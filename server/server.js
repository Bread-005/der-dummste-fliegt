import express from "express";
import {createServer} from "node:http";
import {Server} from "socket.io";
import {
    createRoom,
    joinRoom,
    leaveRoom,
    scheduleRemovalOnDisconnect,
    isRoomHost,
    startGame,
    startNextRound,
    isCurrentPlayerSocket,
    advanceTurn,
    resyncQuestionTurn,
    recordCurrentAnswer,
    getAnswersGivenThisRound,
    getPlayerIdForSocket,
    submitVote,
    haveAllPlayersVoted,
    resolveVotes,
    getPublicPlayers,
    isGameActive,
    stopGame,
    countAlivePlayers,
    startFinale,
    submitFinaleAnswer,
    haveBothFinalePlayersAnswered,
    resolveFinaleQuestion,
    advanceFinaleQuestion,
} from "./roomManager.js";
import {loadQuestions} from "./questionRepository.js";

const portServer = process.env.PORT || 3000;
const TURN_DURATION_MS = 30000;
const REVEAL_DURATION_MS = 5000;
const VOTING_DURATION_MS = 30000;
const VOTING_RESULT_DURATION_MS = 15000;
const FINALE_DURATION_MS = 30000;
const FINALE_RESULT_DURATION_MS = 5000;
const turnTimeouts = new Map();
const gameDisplayStates = new Map();

const application = express();
const httpServer = createServer(application);
const socketServer = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:63342', 'https://bread-005.github.io'],
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
    }
});

/**
 * Remembers the most recently broadcast game-display event for a room, so that a player rejoining
 * mid-game (e.g. after a page reload within the disconnect grace period) can be caught up on the
 * current phase instead of only seeing the empty waiting room.
 * @param {string} roomCode - The code of the room.
 * @param {string} type - The event name this state corresponds to ("turnStarted", "answerRevealed",
 *   "votingStarted", or "votingResolved").
 * @param {object} payload - The event payload as it was broadcast.
 */
function setGameDisplayState(roomCode, type, payload) {
    gameDisplayStates.set(roomCode, {type, ...payload});
}

/**
 * Broadcasts the current turn (question and whose turn it is) to everyone in a room, together
 * with the up-to-date player list (lives, answered-question counts) and every player's answer
 * history so far this round (so the answered-question dots keep their color and hover tooltip
 * across a page reload, not just for the live event).
 * @param {string} roomCode - The code of the room.
 * @param {{question: {text: string}, idCurrentPlayer: string}} turn - The turn to broadcast.
 */
function broadcastTurn(roomCode, turn) {
    const payload = {
        question: turn.question,
        idCurrentPlayer: turn.idCurrentPlayer,
        turnDurationMs: TURN_DURATION_MS,
        turnStartedAt: Date.now(),
        players: getPublicPlayers(roomCode),
        answersByPlayer: getAnswersGivenThisRound(roomCode),
    };

    setGameDisplayState(roomCode, "turnStarted", payload);
    socketServer.to(roomCode).emit("turnStarted", payload);
}

/**
 * Applies the result of starting a game or advancing a turn: either broadcasts the next question
 * turn and schedules its timeout, or, once every player has answered enough questions this round,
 * starts the voting phase.
 * @param {string} roomCode - The code of the room.
 * @param {{phase: "question", question: {text: string}, idCurrentPlayer: string}|{phase: "voting"}|null} turnResult -
 *   The result returned by `startGame()`, `advanceTurn()`, or `startNextRound()`.
 */
function handleTurnResult(roomCode, turnResult) {
    if (!turnResult) {
        turnTimeouts.delete(roomCode);
        return;
    }

    if (turnResult.phase === "voting") {
        startVotingPhase(roomCode);
        return;
    }

    broadcastTurn(roomCode, turnResult);
    scheduleTurnTimeout(roomCode);
}

/**
 * Broadcasts the start of the voting phase, including every player's answer history for this
 * round (for the voting-phase tooltips), and schedules the automatic vote resolution.
 * @param {string} roomCode - The code of the room.
 */
function startVotingPhase(roomCode) {
    const payload = {
        players: getPublicPlayers(roomCode),
        answersByPlayer: getAnswersGivenThisRound(roomCode),
        votingDurationMs: VOTING_DURATION_MS,
        votingStartedAt: Date.now(),
    };

    setGameDisplayState(roomCode, "votingStarted", payload);
    socketServer.to(roomCode).emit("votingStarted", payload);

    scheduleVotingTimeout(roomCode);
}

/**
 * (Re-)schedules the automatic vote resolution for a room, replacing any previously scheduled
 * one. Fires when not every player has voted within the time limit.
 * @param {string} roomCode - The code of the room.
 */
function scheduleVotingTimeout(roomCode) {
    clearTimeout(turnTimeouts.get(roomCode));

    const timeoutHandle = setTimeout(() => {
        finishVoting(roomCode);
    }, VOTING_DURATION_MS);

    turnTimeouts.set(roomCode, timeoutHandle);
}

/**
 * Resolves the voting round (auto-voting anyone who has not voted for themselves). If exactly two
 * players are now alive, skips the voting-result display entirely and starts the finale right
 * away; otherwise broadcasts the outcome together with a result-display timer, then, once that
 * timer runs out, either starts the next normal round or ends the game (if fewer than two players
 * are left alive).
 * @param {string} roomCode - The code of the room.
 */
function finishVoting(roomCode) {
    clearTimeout(turnTimeouts.get(roomCode));

    const result = resolveVotes(roomCode);

    if (!result) {
        turnTimeouts.delete(roomCode);
        return;
    }

    const aliveCount = countAlivePlayers(roomCode);

    if (aliveCount === 2) {
        handleFinaleAdvanceResult(roomCode, startFinale(roomCode));
        return;
    }

    const payload = {
        ...result,
        resultDurationMs: VOTING_RESULT_DURATION_MS,
        resultStartedAt: Date.now(),
    };

    setGameDisplayState(roomCode, "votingResolved", payload);
    socketServer.to(roomCode).emit("votingResolved", payload);

    const resultTimeoutHandle = setTimeout(() => {
        if (aliveCount < 2) {
            stopGameIfActive(roomCode);
        } else {
            handleTurnResult(roomCode, startNextRound(roomCode));
        }
    }, VOTING_RESULT_DURATION_MS);

    turnTimeouts.set(roomCode, resultTimeoutHandle);
}

/**
 * Broadcasts the current finale question to everyone in the room, together with the up-to-date
 * player list, and schedules the finale question's timeout.
 * @param {string} roomCode - The code of the room.
 * @param {{question: {text: string}, idPlayers: string[], questionIndex: number, totalQuestions: number, correctCounts: Object<string, number>}} finaleTurn -
 *   The finale question to broadcast.
 */
function broadcastFinaleTurn(roomCode, finaleTurn) {
    const payload = {
        question: finaleTurn.question,
        idPlayers: finaleTurn.idPlayers,
        questionIndex: finaleTurn.questionIndex,
        totalQuestions: finaleTurn.totalQuestions,
        correctCounts: finaleTurn.correctCounts,
        finaleDurationMs: FINALE_DURATION_MS,
        finaleStartedAt: Date.now(),
        players: getPublicPlayers(roomCode),
    };

    setGameDisplayState(roomCode, "finaleStarted", payload);
    socketServer.to(roomCode).emit("finaleStarted", payload);
    scheduleFinaleTimeout(roomCode);
}

/**
 * (Re-)schedules the automatic finale-question reveal for a room, replacing any previously
 * scheduled one. Fires when not both finalists have answered within the time limit.
 * @param {string} roomCode - The code of the room.
 */
function scheduleFinaleTimeout(roomCode) {
    clearTimeout(turnTimeouts.get(roomCode));

    const timeoutHandle = setTimeout(() => {
        revealFinaleAnswerAndAdvance(roomCode);
    }, FINALE_DURATION_MS);

    turnTimeouts.set(roomCode, timeoutHandle);
}

/**
 * Reveals both finalists' answers (filling in a placeholder for whoever did not answer in time)
 * together with the correct answer, then, after a short delay, advances to the next finale
 * question or ends the finale.
 * @param {string} roomCode - The code of the room.
 */
function revealFinaleAnswerAndAdvance(roomCode) {
    clearTimeout(turnTimeouts.get(roomCode));

    const reveal = resolveFinaleQuestion(roomCode);

    if (!reveal) {
        turnTimeouts.delete(roomCode);
        return;
    }

    setGameDisplayState(roomCode, "finaleAnswerRevealed", reveal);
    socketServer.to(roomCode).emit("finaleAnswerRevealed", reveal);

    const revealTimeoutHandle = setTimeout(() => {
        handleFinaleAdvanceResult(roomCode, advanceFinaleQuestion(roomCode));
    }, REVEAL_DURATION_MS);

    turnTimeouts.set(roomCode, revealTimeoutHandle);
}

/**
 * Applies the result of starting or advancing the finale: either broadcasts the next finale
 * question and schedules its timeout, finishes the finale once every finale question has been
 * asked, or ends the game outright if no further finale question could be produced (e.g. because
 * the two-finalist condition no longer held).
 * @param {string} roomCode - The code of the room.
 * @param {{phase: "finale", question: {text: string}, idPlayers: string[], questionIndex: number, totalQuestions: number, correctCounts: Object<string, number>}|{phase: "finaleFinished", idWinner: string|null, correctCounts: Object<string, number>}|null} result -
 *   The result returned by `startFinale()` or `advanceFinaleQuestion()`.
 */
function handleFinaleAdvanceResult(roomCode, result) {
    if (!result) {
        turnTimeouts.delete(roomCode);
        stopGameIfActive(roomCode);
        return;
    }

    if (result.phase === "finaleFinished") {
        finishFinale(roomCode, result);
        return;
    }

    broadcastFinaleTurn(roomCode, result);
}

/**
 * Broadcasts the finale outcome (winner, or a tie). The game then simply waits on this screen —
 * after a short delay the host gets a button to start a fresh game (`startGame`), the same event
 * used to start the very first game; there is no automatic timeout back to the waiting room.
 * @param {string} roomCode - The code of the room.
 * @param {{idWinner: string|null, correctCounts: Object<string, number>}} result - The finale
 *   outcome returned by `advanceFinaleQuestion()`.
 */
function finishFinale(roomCode, result) {
    clearTimeout(turnTimeouts.get(roomCode));
    turnTimeouts.delete(roomCode);

    const payload = {
        idWinner: result.idWinner,
        correctCounts: result.correctCounts,
        players: getPublicPlayers(roomCode),
        resultDurationMs: FINALE_RESULT_DURATION_MS,
        resultStartedAt: Date.now(),
    };

    setGameDisplayState(roomCode, "finaleResolved", payload);
    socketServer.to(roomCode).emit("finaleResolved", payload);
}

/**
 * (Re-)schedules the automatic turn advance for a room, replacing any previously scheduled one.
 * Fires when a player fails to answer within the time limit.
 * @param {string} roomCode - The code of the room.
 */
function scheduleTurnTimeout(roomCode) {
    clearTimeout(turnTimeouts.get(roomCode));

    const timeoutHandle = setTimeout(() => {
        revealAnswerAndAdvance(roomCode, "(keine Antwort)");
    }, TURN_DURATION_MS);

    turnTimeouts.set(roomCode, timeoutHandle);
}

/**
 * Reveals the current turn's answer (the one just given, or a placeholder if time ran out)
 * together with the correct answer, then, after a short delay, advances to the next turn. Also
 * carries every player's answer history so far this round, so the answered-question dots keep
 * their color and hover tooltip across a page reload, not just for the live event.
 * @param {string} roomCode - The code of the room.
 * @param {string} answerText - The answer text to reveal for the current player.
 */
function revealAnswerAndAdvance(roomCode, answerText) {
    const reveal = recordCurrentAnswer(roomCode, answerText);

    if (!reveal) {
        turnTimeouts.delete(roomCode);
        return;
    }

    const payload = {
        idPlayer: reveal.idPlayer,
        playerName: reveal.playerName,
        answerText,
        questionText: reveal.questionText,
        correctAnswer: reveal.correctAnswer,
        isCorrect: reveal.isCorrect,
        answersByPlayer: getAnswersGivenThisRound(roomCode),
    };

    setGameDisplayState(roomCode, "answerRevealed", payload);
    socketServer.to(roomCode).emit("answerRevealed", payload);

    const revealTimeoutHandle = setTimeout(() => {
        handleTurnResult(roomCode, advanceTurn(roomCode, reveal.idPlayer));
    }, REVEAL_DURATION_MS);

    turnTimeouts.set(roomCode, revealTimeoutHandle);
}

/**
 * Stops a room's active game, if any, and tells everyone in the room to return to the waiting
 * room. Only used as a last resort when no player is left to take the current turn.
 * @param {string} roomCode - The code of the room.
 */
function stopGameIfActive(roomCode) {
    if (!isGameActive(roomCode)) {
        return;
    }

    clearTimeout(turnTimeouts.get(roomCode));
    turnTimeouts.delete(roomCode);
    gameDisplayStates.delete(roomCode);
    stopGame(roomCode);
    socketServer.to(roomCode).emit("gameStopped");
}

/**
 * Keeps a game running for the remaining players after one player left or was removed following a
 * disconnect: if the removed player was still waiting to answer in the question phase, resyncs the
 * turn (or moves on to voting) right away instead of waiting out their now-pointless turn timeout;
 * if they left while voting was still actively open and every remaining alive player has now
 * voted, resolves the vote immediately. A player removed while their just-given answer is being
 * revealed, or while a voting result is already being displayed, is left alone — the
 * already-scheduled timeout for that phase moves things along on its own once it runs out. The
 * finale strictly requires exactly two players, so removing either finalist at any point simply
 * ends the game.
 * @param {string} roomCode - The code of the room.
 * @param {{wasCurrentQuestionTurn: boolean, phaseAtRemoval: ("question"|"voting"|"finale"|null)}|undefined} removalEffect -
 *   The removal effect returned by `leaveRoom()`/`scheduleRemovalOnDisconnect()`.
 */
function handlePlayerRemovedDuringGame(roomCode, removalEffect) {
    if (!removalEffect || !isGameActive(roomCode)) {
        return;
    }

    if (removalEffect.phaseAtRemoval === "finale") {
        stopGameIfActive(roomCode);
        return;
    }

    const isMidUnansweredTurn =
        removalEffect.phaseAtRemoval === "question" &&
        removalEffect.wasCurrentQuestionTurn &&
        gameDisplayStates.get(roomCode)?.type === "turnStarted";

    if (isMidUnansweredTurn) {
        clearTimeout(turnTimeouts.get(roomCode));
        const turn = resyncQuestionTurn(roomCode);

        if (!turn) {
            stopGameIfActive(roomCode);
            return;
        }

        handleTurnResult(roomCode, turn);
        return;
    }

    const isMidActiveVoting =
        removalEffect.phaseAtRemoval === "voting" && gameDisplayStates.get(roomCode)?.type === "votingStarted";

    if (isMidActiveVoting && haveAllPlayersVoted(roomCode)) {
        finishVoting(roomCode);
    }
}

socketServer.on("connection", (socket) => {
    socket.on("createRoom", ({playerName, idPlayer}) => {
        const {roomCode, players} = createRoom(idPlayer, socket.id, playerName);

        socket.join(roomCode);
        socket.emit("roomJoined", {roomCode, players});
    });

    socket.on("joinRoom", ({playerName, roomCode, idPlayer}) => {
        const players = joinRoom(roomCode, idPlayer, socket.id, playerName);

        if (!players) {
            socket.emit("errorMessage", {message: "Raum wurde nicht gefunden."});
            return;
        }

        socket.join(roomCode);
        socket.emit("roomJoined", {roomCode, players, gameState: gameDisplayStates.get(roomCode) ?? null});
        socket.to(roomCode).emit("playersUpdated", {players});
    });

    socket.on("startGame", ({roomCode}) => {
        if (!isRoomHost(roomCode, socket.id)) {
            return;
        }

        const turn = startGame(roomCode);

        if (!turn) {
            socket.emit("gameErrorMessage", {message: "Es sind aktuell keine Fragen verfügbar."});
            return;
        }

        handleTurnResult(roomCode, turn);
    });

    socket.on("submitAnswer", ({roomCode, answerText}) => {
        if (!isCurrentPlayerSocket(roomCode, socket.id)) {
            return;
        }

        clearTimeout(turnTimeouts.get(roomCode));
        const trimmedAnswer = (answerText ?? "").trim();
        revealAnswerAndAdvance(roomCode, trimmedAnswer || "(keine Antwort)");
    });

    socket.on("submitFinaleAnswer", ({roomCode, answerText}) => {
        const idPlayer = getPlayerIdForSocket(socket.id);
        const trimmedAnswer = (answerText ?? "").trim();

        if (!idPlayer || !submitFinaleAnswer(roomCode, idPlayer, trimmedAnswer || "(keine Antwort)")) {
            return;
        }

        if (haveBothFinalePlayersAnswered(roomCode)) {
            revealFinaleAnswerAndAdvance(roomCode);
        }
    });

    socket.on("submitVote", ({roomCode, idVotedFor}) => {
        const idVoter = getPlayerIdForSocket(socket.id);

        if (!idVoter || !submitVote(roomCode, idVoter, idVotedFor)) {
            return;
        }

        if (haveAllPlayersVoted(roomCode)) {
            finishVoting(roomCode);
        }
    });

    socket.on("leaveRoom", () => {
        const affectedRoom = leaveRoom(socket.id);

        if (affectedRoom) {
            handlePlayerRemovedDuringGame(affectedRoom.roomCode, affectedRoom.removalEffect);
            socketServer.to(affectedRoom.roomCode).emit("playersUpdated", {players: affectedRoom.players});
        }
    });

    socket.on("disconnect", () => {
        scheduleRemovalOnDisconnect(socket.id, (affectedRoom) => {
            handlePlayerRemovedDuringGame(affectedRoom.roomCode, affectedRoom.removalEffect);
            socketServer.to(affectedRoom.roomCode).emit("playersUpdated", {players: affectedRoom.players});
        });
    });
});

try {
    await loadQuestions();
} catch (error) {
    console.error("Fragen konnten nicht geladen werden:", error.message);
}

httpServer.listen(3050, "0.0.0.0", () => {
    console.log("Access game on https://bread-005.github.io/der-dummste-fliegt/index.html");
});
