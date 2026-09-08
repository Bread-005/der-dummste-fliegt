import {getAllQuestions} from "./questionRepository.js";

const rooms = new Map();
const DISCONNECT_GRACE_PERIOD_MS = 5000;
const DEFAULT_STARTING_LIVES = 3;
const MIN_STARTING_LIVES = 1;
const MAX_STARTING_LIVES = 5;
const DEFAULT_QUESTIONS_PER_PLAYER_PER_ROUND = 2;
const MIN_QUESTIONS_PER_PLAYER_PER_ROUND = 1;
const MAX_QUESTIONS_PER_PLAYER_PER_ROUND = 5;
const MINIMUM_PLAYERS_TO_START = 3;
const FINALE_QUESTION_COUNT = 5;

/**
 * Generates a random four-character uppercase room code that is not yet in use.
 * @returns {string} A unique room code.
 */
function generateRoomCode() {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let roomCode = "";

    do {
        roomCode = "";

        for (let indexCharacter = 0; indexCharacter < 4; indexCharacter++) {
            roomCode += characters.charAt(Math.floor(Math.random() * characters.length));
        }
    } while (rooms.has(roomCode));

    return roomCode;
}

/**
 * Checks whether a player is still alive (has at least one life left). Dead players are skipped
 * for turns and voting, and are displayed separately on the client.
 * @param {object} player - The internal player record.
 * @returns {boolean} True if the player has more than zero lives.
 */
function isPlayerAlive(player) {
    return player.lives > 0;
}

/**
 * Normalizes an answer for comparison: trims surrounding whitespace and ignores letter case, so
 * e.g. " Berlin " and "berlin" are treated as the same answer.
 * @param {string} text - The text to normalize.
 * @returns {string} The normalized text.
 */
function normalizeAnswerText(text) {
    return text.trim().toLowerCase();
}

/**
 * Checks whether a player has answered every question of the running round correctly. Such
 * players are protected from being voted for.
 * @param {object} room - The internal room record.
 * @param {string} idPlayer - The persistent id of the player to check.
 * @returns {boolean} True if the player has at least one answer this round and all of them are
 *   correct.
 */
function hasAnsweredAllCorrectlyThisRound(room, idPlayer) {
    const answers = room.game.answersGiven[idPlayer];
    return Boolean(answers && answers.length > 0 && answers.every((answer) => answer.isCorrect));
}

/**
 * Orders a room's players by the game's turn order once a game is running, so clients can display
 * them in the same left-to-right order in which they take their turns. Falls back to join order
 * while no game is active. A player who joins mid-game is added to `room.players` but is not part
 * of `room.game.playerOrder` until the next round reshuffles it (they take no turns as a dead
 * spectator in the meantime, see `joinRoom()`), so such players are appended afterwards in join
 * order instead of being silently dropped from the display.
 * @param {object} room - The internal room record.
 * @returns {Array<object>} The room's internal player records, ordered for display.
 */
function orderPlayersForDisplay(room) {
    if (!room.game) {
        return room.players;
    }

    const playersInTurnOrder = room.game.playerOrder
        .map((idPlayer) => room.players.find((player) => player.idPlayer === idPlayer))
        .filter(Boolean);

    const playersJoinedMidGame = room.players.filter((player) => !room.game.playerOrder.includes(player.idPlayer));

    return [...playersInTurnOrder, ...playersJoinedMidGame];
}

/**
 * Strips server-internal fields from a room's player list before sending it to clients, adding
 * each player's current lives and how many questions they have answered in the running round.
 * Ordered by the game's turn order while a game is running, otherwise by join order.
 * @param {object} room - The internal room record.
 * @returns {Array<{idPlayer: string, name: string, isHost: boolean, lives: number, answeredCount: number}>}
 *   The public representation of the players.
 */
function toPublicPlayers(room) {
    return orderPlayersForDisplay(room).map((player) => ({
        idPlayer: player.idPlayer,
        name: player.name,
        isHost: player.idPlayer === room.idHost,
        lives: player.lives,
        answeredCount: room.game ? (room.game.answeredCounts[player.idPlayer] ?? 0) : 0,
    }));
}

/**
 * Builds the public representation of the current turn for a room's active game, if any player
 * from the turn order is still present.
 * @param {object} room - The internal room record.
 * @returns {{phase: "question", question: {text: string}, idCurrentPlayer: string}|null} The
 *   current question turn, or null if no player from the turn order is still in the room.
 */
function buildQuestionTurn(room) {
    const turn = getCurrentTurn(room);
    return turn ? {phase: "question", ...turn} : null;
}

/**
 * Randomly reorders an array using the Fisher-Yates algorithm, without mutating the input.
 * @param {Array<*>} items - The items to shuffle.
 * @returns {Array<*>} A new, shuffled array.
 */
function shuffleArray(items) {
    const shuffled = [...items];

    for (let indexCurrent = shuffled.length - 1; indexCurrent > 0; indexCurrent--) {
        const indexSwap = Math.floor(Math.random() * (indexCurrent + 1));
        [shuffled[indexCurrent], shuffled[indexSwap]] = [shuffled[indexSwap], shuffled[indexCurrent]];
    }

    return shuffled;
}

/**
 * Resolves the current turn (question and player) of a room's active game, skipping over any
 * players in the turn order who have since left the room or died (zero lives).
 * @param {object} room - The internal room record.
 * @returns {{question: {text: string}, idCurrentPlayer: string}|null} The current turn, or null
 *   if no player from the turn order is still alive and in the room.
 */
function getCurrentTurn(room) {
    const totalPlayers = room.game.playerOrder.length;

    for (let attempts = 0; attempts < totalPlayers; attempts++) {
        const idCandidate = room.game.playerOrder[room.game.indexCurrentPlayer];
        const candidateEligibleForTurn = room.players.some(
            (player) => player.idPlayer === idCandidate && isPlayerAlive(player),
        );

        if (candidateEligibleForTurn) {
            return {
                question: {text: room.game.shuffledQuestions[room.game.indexQuestion].text},
                idCurrentPlayer: idCandidate,
            };
        }

        room.game.indexCurrentPlayer = (room.game.indexCurrentPlayer + 1) % totalPlayers;
    }

    return null;
}

/**
 * Finds the room and player entry associated with a given socket id.
 * @param {string} idSocket - The socket id to search for.
 * @returns {{roomCode: string, room: object, player: object}|null} The match, or null if none found.
 */
function findByIdSocket(idSocket) {
    for (const [roomCode, room] of rooms.entries()) {
        const player = room.players.find((candidate) => candidate.idSocket === idSocket);

        if (player) {
            return {roomCode, room, player};
        }
    }

    return null;
}

/**
 * Removes a player from a room, deletes the room if it becomes empty, and hands the host crown to
 * an arbitrary remaining player if the removed player was the host. If a game is running, it is
 * never stopped by this removal alone (the caller decides how to resync it); votes cast for the
 * removed player are cleared instead, so their voters count as not having voted yet. The same
 * applies to a running tiebreak's outside votes. If the removed player was one of the two tiebreak
 * candidates, the tiebreak cannot be completed anymore and is abandoned outright (`room.game.phase`
 * reverts to `"voting"`), leaving it to the caller to resolve the round with nobody losing a life
 * for it, exactly as a fully-tied vote would. If the removed player was one of the two finale
 * contestants, the finale can no longer be played out either, but unlike the tiebreak case it is
 * not simply abandoned: the remaining finalist is declared the winner (`finaleResult`), since the
 * finale strictly needs two contestants and only one is left standing.
 * @param {string} roomCode - The code of the room.
 * @param {object} room - The internal room record.
 * @param {string} idPlayer - The persistent id of the player to remove.
 * @returns {{wasCurrentQuestionTurn: boolean, phaseAtRemoval: ("question"|"voting"|"tiebreakQuestion"|"tiebreakVoting"|"finale"|null), wasTiebreakCandidate: boolean, finaleResult: {idWinner: string, correctCounts: Object<string, number>}|null}}
 *   Whether the removed player was the one currently up in the question phase, which phase the
 *   game was in at the moment of removal (null if no game was running), whether the removed player
 *   was one of the two active tiebreak candidates, and, if the removed player was one of the two
 *   finale contestants, the finale outcome declaring the remaining contestant the winner.
 */
function removePlayerFromRoom(roomCode, room, idPlayer) {
    const phaseAtRemoval = room.game?.phase ?? null;
    const wasCurrentQuestionTurn =
        phaseAtRemoval === "question" && getCurrentTurn(room)?.idCurrentPlayer === idPlayer;
    const wasTiebreakCandidate =
        (phaseAtRemoval === "tiebreakQuestion" || phaseAtRemoval === "tiebreakVoting") &&
        Boolean(room.game.tiebreak.idPlayers.includes(idPlayer));
    const wasFinaleContestant = phaseAtRemoval === "finale" && room.game.finale.idPlayers.includes(idPlayer);
    const finaleResult = wasFinaleContestant
        ? {
              idWinner: room.game.finale.idPlayers.find((idFinalist) => idFinalist !== idPlayer),
              correctCounts: {...room.game.finale.correctCounts},
          }
        : null;

    room.players = room.players.filter((player) => player.idPlayer !== idPlayer);

    if (room.players.length === 0) {
        rooms.delete(roomCode);
        return {wasCurrentQuestionTurn: false, phaseAtRemoval: null, wasTiebreakCandidate: false, finaleResult: null};
    }

    if (room.idHost === idPlayer) {
        room.idHost = room.players[0].idPlayer;
    }

    if (phaseAtRemoval === "voting") {
        delete room.game.votes[idPlayer];

        for (const idVoter of Object.keys(room.game.votes)) {
            if (room.game.votes[idVoter] === idPlayer) {
                delete room.game.votes[idVoter];
            }
        }
    }

    if (phaseAtRemoval === "tiebreakVoting" && !wasTiebreakCandidate) {
        delete room.game.tiebreak.votes[idPlayer];
    }

    if (wasTiebreakCandidate) {
        room.game.phase = "voting";
        delete room.game.tiebreak;
    }

    return {wasCurrentQuestionTurn, phaseAtRemoval, wasTiebreakCandidate, finaleResult};
}

/**
 * Creates a new room with a single player as its first member.
 * @param {string} idPlayer - The persistent id of the creating player.
 * @param {string} idSocket - The current socket id of the creating player.
 * @param {string} playerName - The display name of the creating player.
 * @returns {{roomCode: string, players: Array<{idPlayer: string, name: string, isHost: boolean}>, settings: {startingLives: number, questionsPerPlayerPerRound: number}}} The created room.
 */
function createRoom(idPlayer, idSocket, playerName) {
    const roomCode = generateRoomCode();
    const room = {
        players: [{idPlayer, idSocket, name: playerName, disconnectTimeout: null, lives: DEFAULT_STARTING_LIVES}],
        idHost: idPlayer,
        game: null,
        settings: {
            startingLives: DEFAULT_STARTING_LIVES,
            questionsPerPlayerPerRound: DEFAULT_QUESTIONS_PER_PLAYER_PER_ROUND,
        },
    };

    rooms.set(roomCode, room);

    return {roomCode, players: toPublicPlayers(room), settings: {...room.settings}};
}

/**
 * Adds a player to an existing room, or reconnects them if they already belong to it
 * (recognized by their persistent player id surviving a page navigation).
 * @param {string} roomCode - The code of the room to join.
 * @param {string} idPlayer - The persistent id of the joining player.
 * @param {string} idSocket - The current socket id of the joining player.
 * @param {string} playerName - The display name of the joining player.
 * @returns {{players: Array<{idPlayer: string, name: string, isHost: boolean}>, settings: {startingLives: number, questionsPerPlayerPerRound: number}}|null}
 *   The updated player list and current room settings, or null if the room does not exist.
 */
function joinRoom(roomCode, idPlayer, idSocket, playerName) {
    const room = rooms.get(roomCode);

    if (!room) {
        return null;
    }

    const existingPlayer = room.players.find((player) => player.idPlayer === idPlayer);

    if (existingPlayer) {
        clearTimeout(existingPlayer.disconnectTimeout);
        existingPlayer.disconnectTimeout = null;
        existingPlayer.idSocket = idSocket;
        existingPlayer.name = playerName;
    } else {
        const livesOnJoin = room.game ? 0 : room.settings.startingLives;

        room.players.push({idPlayer, idSocket, name: playerName, disconnectTimeout: null, lives: livesOnJoin});
    }

    return {players: toPublicPlayers(room), settings: {...room.settings}};
}

/**
 * Removes a player from their room immediately, e.g. when they deliberately click "Verlassen". A
 * game in progress keeps running for the remaining players; the caller uses `removalEffect` to
 * resync the turn or voting phase if needed.
 * @param {string} idSocket - The socket id of the leaving player.
 * @returns {{roomCode: string, players: Array<{idPlayer: string, name: string, isHost: boolean}>, removalEffect: {wasCurrentQuestionTurn: boolean, phaseAtRemoval: ("question"|"voting"|null)}}|null}
 *   The affected room, or null if none found.
 */
function leaveRoom(idSocket) {
    const match = findByIdSocket(idSocket);

    if (!match) {
        return null;
    }

    const {roomCode, room, player} = match;
    const removalEffect = removePlayerFromRoom(roomCode, room, player.idPlayer);

    if (!rooms.has(roomCode)) {
        return null;
    }

    return {roomCode, players: toPublicPlayers(room), removalEffect};
}

/**
 * Schedules a player for removal after a grace period, allowing a page navigation
 * (which disconnects the old socket) to be followed by a rejoin on the new page
 * without the room being torn down in between. If the grace period elapses without a rejoin, a
 * game in progress keeps running for the remaining players.
 * @param {string} idSocket - The socket id that disconnected.
 * @param {(affectedRoom: {roomCode: string, players: Array<{idPlayer: string, name: string, isHost: boolean}>, removalEffect: {wasCurrentQuestionTurn: boolean, phaseAtRemoval: ("question"|"voting"|null)}}) => void} onRemoved -
 *   Called once the player is actually removed, if the room still exists.
 */
function scheduleRemovalOnDisconnect(idSocket, onRemoved) {
    const match = findByIdSocket(idSocket);

    if (!match) {
        return;
    }

    const {roomCode, room, player} = match;

    player.disconnectTimeout = setTimeout(() => {
        const removalEffect = removePlayerFromRoom(roomCode, room, player.idPlayer);

        if (rooms.has(roomCode)) {
            onRemoved({roomCode, players: toPublicPlayers(room), removalEffect});
        }
    }, DISCONNECT_GRACE_PERIOD_MS);
}

/**
 * Checks whether a socket belongs to the player who created the given room.
 * @param {string} roomCode - The code of the room.
 * @param {string} idSocket - The socket id to check.
 * @returns {boolean} True if the socket belongs to the room's host.
 */
function isRoomHost(roomCode, idSocket) {
    const room = rooms.get(roomCode);

    if (!room) {
        return false;
    }

    const player = room.players.find((candidate) => candidate.idSocket === idSocket);
    return player?.idPlayer === room.idHost;
}

/**
 * Checks whether a room currently has enough players to start a game.
 * @param {string} roomCode - The code of the room.
 * @returns {boolean} True if the room exists and has at least `MINIMUM_PLAYERS_TO_START` players.
 */
function hasEnoughPlayersToStart(roomCode) {
    const room = rooms.get(roomCode);
    return Boolean(room) && room.players.length >= MINIMUM_PLAYERS_TO_START;
}

/**
 * Starts a new game in a room: resets every player's lives, shuffles all available questions
 * once, and sets a random turn order over the room's current players. Only the room's host is
 * meant to trigger this (checked by the caller); the caller must also check
 * `hasEnoughPlayersToStart()` beforehand, as this function does not enforce the minimum itself.
 * @param {string} roomCode - The code of the room.
 * @returns {{phase: "question", question: {text: string}, idCurrentPlayer: string}|null} The
 *   first turn, or null if the room does not exist or no questions are available.
 */
function startGame(roomCode) {
    const room = rooms.get(roomCode);
    const shuffledQuestions = shuffleArray(getAllQuestions());

    if (!room || shuffledQuestions.length === 0) {
        return null;
    }

    room.players.forEach((player) => {
        player.lives = room.settings.startingLives;
    });

    room.game = {
        shuffledQuestions,
        indexQuestion: 0,
        playerOrder: shuffleArray(room.players.map((player) => player.idPlayer)),
        indexCurrentPlayer: 0,
        answeredCounts: {},
        answersGiven: {},
        votes: {},
        phase: "question",
    };

    return buildQuestionTurn(room);
}

/**
 * Starts the next round after a voting result has been shown: reshuffles the turn order over the
 * room's current players and resets each player's answered-question count, answer history, and
 * votes, without touching lives or the ongoing shuffled question pool.
 * @param {string} roomCode - The code of the room.
 * @returns {{phase: "question", question: {text: string}, idCurrentPlayer: string}|null} The
 *   first turn of the new round, or null if the room has no active game or no player is left.
 */
function startNextRound(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game) {
        return null;
    }

    room.game.playerOrder = shuffleArray(room.players.map((player) => player.idPlayer));
    room.game.indexCurrentPlayer = 0;
    room.game.answeredCounts = {};
    room.game.answersGiven = {};
    room.game.votes = {};
    room.game.phase = "question";

    return buildQuestionTurn(room);
}

/**
 * Checks whether a socket belongs to the player whose turn it currently is in a room's game.
 * Always false once the round has moved on to the voting phase.
 * @param {string} roomCode - The code of the room.
 * @param {string} idSocket - The socket id to check.
 * @returns {boolean} True if the socket belongs to the current player.
 */
function isCurrentPlayerSocket(roomCode, idSocket) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "question") {
        return false;
    }

    const turn = getCurrentTurn(room);

    if (!turn) {
        return false;
    }

    const currentPlayer = room.players.find((player) => player.idPlayer === turn.idCurrentPlayer);
    return currentPlayer?.idSocket === idSocket;
}

/**
 * Checks whether every currently alive player in a room has answered enough questions this round
 * to move on to the voting phase.
 * @param {object} room - The internal room record.
 * @returns {boolean} True if every alive player has met the per-round question quota.
 */
function hasEveryPlayerAnsweredEnough(room) {
    return room.players
        .filter(isPlayerAlive)
        .every((player) => (room.game.answeredCounts[player.idPlayer] ?? 0) >= room.settings.questionsPerPlayerPerRound);
}

/**
 * Records the finished turn's answer, then either advances a room's game to the next player's
 * turn and the next question, or switches the round to the voting phase once every player has
 * answered their share of questions for this round. The question pool always advances by one on
 * every finished turn, including the round's last one, so the next round continues with the next
 * question instead of repeating the one just asked; it is only reshuffled once every question in
 * the pool has been asked exactly once, never simply because a round ended. Takes the finished
 * turn's player id explicitly (captured at answer time, before the delayed reveal) rather than
 * re-reading the current turn, so it still credits the right player even if they left or
 * disconnected during the reveal.
 * @param {string} roomCode - The code of the room.
 * @param {string} idFinishedPlayer - The persistent id of the player whose turn just ended.
 * @returns {{phase: "question", question: {text: string}, idCurrentPlayer: string}|{phase: "voting"}|null}
 *   The new turn, a voting-phase marker, or null if the room has no active game or no player is
 *   left to take a turn.
 */
function advanceTurn(roomCode, idFinishedPlayer) {
    const room = rooms.get(roomCode);

    if (!room || !room.game) {
        return null;
    }

    room.game.answeredCounts[idFinishedPlayer] = (room.game.answeredCounts[idFinishedPlayer] ?? 0) + 1;

    room.game.indexQuestion += 1;

    if (room.game.indexQuestion >= room.game.shuffledQuestions.length) {
        room.game.shuffledQuestions = shuffleArray(getAllQuestions());
        room.game.indexQuestion = 0;
    }

    if (hasEveryPlayerAnsweredEnough(room)) {
        room.game.phase = "voting";
        return {phase: "voting"};
    }

    room.game.indexCurrentPlayer = (room.game.indexCurrentPlayer + 1) % room.game.playerOrder.length;

    return buildQuestionTurn(room);
}

/**
 * Resyncs the current question turn after the player who was up left or disconnected, without
 * recording an answer for them (they simply never took this turn). Switches to the voting phase
 * instead if every remaining alive player already met the per-round question quota. Must only be
 * called while the room is still in the question phase.
 * @param {string} roomCode - The code of the room.
 * @returns {{phase: "question", question: {text: string}, idCurrentPlayer: string}|{phase: "voting"}|null}
 *   The new current turn, a voting-phase marker, or null if the room has no active game or no
 *   player is left to take a turn.
 */
function resyncQuestionTurn(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game) {
        return null;
    }

    if (hasEveryPlayerAnsweredEnough(room)) {
        room.game.phase = "voting";
        return {phase: "voting"};
    }

    return buildQuestionTurn(room);
}

/**
 * Reads the public player list of a room, including lives and answered-question counts.
 * @param {string} roomCode - The code of the room.
 * @returns {Array<{idPlayer: string, name: string, isHost: boolean, lives: number, answeredCount: number}>|null}
 *   The public players, or null if the room does not exist.
 */
function getPublicPlayers(roomCode) {
    const room = rooms.get(roomCode);
    return room ? toPublicPlayers(room) : null;
}

/**
 * Reads the current turn's player name and correct answer for the reveal display, and records the
 * question, given answer, correct answer, and whether the answer was correct into the player's
 * answer history for this round (used for the voting-phase tooltips and for protecting players
 * with an all-correct round from being voted for). Must be called before `advanceTurn()` moves the
 * game to the next turn.
 * @param {string} roomCode - The code of the room.
 * @param {string} answerText - The answer text given for the current turn.
 * @returns {{idPlayer: string, playerName: string, questionText: string, correctAnswer: string, isCorrect: boolean}|null}
 *   The reveal info, or null if the room has no active game or no player is left to take a turn.
 */
function recordCurrentAnswer(roomCode, answerText) {
    const room = rooms.get(roomCode);

    if (!room || !room.game) {
        return null;
    }

    const turn = getCurrentTurn(room);

    if (!turn) {
        return null;
    }

    const player = room.players.find((candidate) => candidate.idPlayer === turn.idCurrentPlayer);
    const correctAnswer = room.game.shuffledQuestions[room.game.indexQuestion].answer;
    const isCorrect = normalizeAnswerText(answerText) === normalizeAnswerText(correctAnswer);

    if (!room.game.answersGiven[turn.idCurrentPlayer]) {
        room.game.answersGiven[turn.idCurrentPlayer] = [];
    }

    room.game.answersGiven[turn.idCurrentPlayer].push({
        questionText: turn.question.text,
        answerGiven: answerText,
        correctAnswer,
        isCorrect,
    });

    return {
        idPlayer: turn.idCurrentPlayer,
        playerName: player?.name ?? "Unbekannt",
        questionText: turn.question.text,
        correctAnswer,
        isCorrect,
    };
}

/**
 * Reads each player's answer history (question, given answer, correct answer) for the running
 * round, used to show tooltips over the answered-question dots during the voting phase.
 * @param {string} roomCode - The code of the room.
 * @returns {Object<string, Array<{questionText: string, answerGiven: string, correctAnswer: string}>>}
 *   The answer history keyed by player id, or an empty object if the room has no active game.
 */
function getAnswersGivenThisRound(roomCode) {
    const room = rooms.get(roomCode);
    return room?.game?.answersGiven ?? {};
}

/**
 * Reads the persistent player id of whoever holds a given socket, if any.
 * @param {string} idSocket - The socket id to search for.
 * @returns {string|null} The player's persistent id, or null if the socket belongs to no player.
 */
function getPlayerIdForSocket(idSocket) {
    const match = findByIdSocket(idSocket);
    return match ? match.player.idPlayer : null;
}

/**
 * Registers a player's vote for who was the dumbest this round. Ignored outside the voting phase,
 * for a voter or vote target no longer in the room or already dead, for a vote target who
 * answered every question of the round correctly, or if the voter already voted.
 * @param {string} roomCode - The code of the room.
 * @param {string} idVoter - The persistent id of the voting player.
 * @param {string} idVotedFor - The persistent id of the player being voted for.
 * @returns {boolean} True if the vote was accepted.
 */
function submitVote(roomCode, idVoter, idVotedFor) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "voting" || room.game.votes[idVoter]) {
        return false;
    }

    const voterStillEligible = room.players.some(
        (player) => player.idPlayer === idVoter && isPlayerAlive(player),
    );
    const votedForStillEligible = room.players.some(
        (player) => player.idPlayer === idVotedFor && isPlayerAlive(player),
    );

    if (!voterStillEligible || !votedForStillEligible) {
        return false;
    }

    if (hasAnsweredAllCorrectlyThisRound(room, idVotedFor)) {
        return false;
    }

    room.game.votes[idVoter] = idVotedFor;
    return true;
}

/**
 * Checks whether every currently alive player in a room has voted this round.
 * @param {string} roomCode - The code of the room.
 * @returns {boolean} True if every alive player has cast a vote.
 */
function haveAllPlayersVoted(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game) {
        return false;
    }

    return room.players.filter(isPlayerAlive).every((player) => Boolean(room.game.votes[player.idPlayer]));
}

/**
 * Resolves the voting round: any alive player who has not voted yet (e.g. after the voting
 * timeout) automatically votes for themselves, then the vote is tallied. Dead players neither vote
 * nor can be voted for. Votes for a player who answered every question of the round correctly
 * (including such a player's own fallback self-vote) are excluded from the count, so that player
 * cannot lose a life this round. Depending on how many players are tied for the most votes:
 * - exactly one: that player loses one life (down to a minimum of zero);
 * - exactly two: neither loses a life yet — the caller must start a tiebreak between them instead
 *   (see `startTiebreakQuestion()`);
 * - three or more, or nobody received a countable vote at all: the tie spans too much of the field
 *   to single a group out, so nobody loses a life.
 * @param {string} roomCode - The code of the room.
 * @returns {{type: "tiebreak", idPlayers: string[]}|{type: "resolved", votes: Array<{idVoter: string, idVotedFor: string}>, idPlayersLosingLife: string[], players: Array<object>}|null}
 *   Either a marker that a two-way tiebreak must be started, or the resolved votes, who lost a
 *   life, and the updated public player list — or null if the room has no active game.
 */
function resolveVotingPhase(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game) {
        return null;
    }

    const alivePlayers = room.players.filter(isPlayerAlive);

    alivePlayers.forEach((player) => {
        if (!room.game.votes[player.idPlayer]) {
            room.game.votes[player.idPlayer] = player.idPlayer;
        }
    });

    const voteCounts = {};

    alivePlayers.forEach((player) => {
        const idVotedFor = room.game.votes[player.idPlayer];

        if (hasAnsweredAllCorrectlyThisRound(room, idVotedFor)) {
            return;
        }

        voteCounts[idVotedFor] = (voteCounts[idVotedFor] ?? 0) + 1;
    });

    const votes = alivePlayers.map((player) => ({
        idVoter: player.idPlayer,
        idVotedFor: room.game.votes[player.idPlayer],
    }));

    const highestVoteCount = Object.values(voteCounts).length > 0 ? Math.max(...Object.values(voteCounts)) : 0;
    const idPlayersAtTop = Object.keys(voteCounts).filter((idPlayer) => voteCounts[idPlayer] === highestVoteCount);

    if (idPlayersAtTop.length === 2) {
        return {type: "tiebreak", idPlayers: idPlayersAtTop};
    }

    const idPlayersLosingLife = idPlayersAtTop.length >= 3 ? [] : idPlayersAtTop;

    idPlayersLosingLife.forEach((idPlayer) => {
        const player = room.players.find((candidate) => candidate.idPlayer === idPlayer);

        if (player) {
            player.lives = Math.max(0, player.lives - 1);
        }
    });

    return {type: "resolved", votes, idPlayersLosingLife, players: toPublicPlayers(room)};
}

/**
 * Builds the public representation of a room's currently running tiebreak question.
 * @param {object} room - The internal room record.
 * @returns {{question: {text: string}, idPlayers: string[], players: Array<object>}} The current
 *   tiebreak question turn.
 */
function buildTiebreakQuestionTurn(room) {
    return {
        question: {text: room.game.tiebreak.question.text},
        idPlayers: room.game.tiebreak.idPlayers,
        players: toPublicPlayers(room),
    };
}

/**
 * Starts a tiebreak question between exactly two players tied for the most votes in a voting
 * round, drawing the next question from the same shuffled pool a normal turn would use. Also used
 * to start a repeat tiebreak question after a tiebreak re-vote is itself still tied.
 * @param {string} roomCode - The code of the room.
 * @param {string[]} idPlayers - The two persistent ids of the tied players.
 * @returns {{question: {text: string}, idPlayers: string[], players: Array<object>}|null} The
 *   tiebreak question turn, or null if the room has no active game or no question is available.
 */
function startTiebreakQuestion(roomCode, idPlayers) {
    const room = rooms.get(roomCode);
    const question = room?.game?.shuffledQuestions[room.game.indexQuestion];

    if (!room || !room.game || !question) {
        return null;
    }

    room.game.phase = "tiebreakQuestion";
    room.game.tiebreak = {idPlayers, question, answers: {}, wasCorrect: {}, votes: {}};

    return buildTiebreakQuestionTurn(room);
}

/**
 * Registers one of the two tiebreak candidates' answer for the current tiebreak question. Ignored
 * outside the tiebreak-question phase, for a player who is not one of the two candidates, or if
 * that player already answered this question.
 * @param {string} roomCode - The code of the room.
 * @param {string} idPlayer - The persistent id of the answering player.
 * @param {string} answerText - The answer text given.
 * @returns {boolean} True if the answer was accepted.
 */
function submitTiebreakAnswer(roomCode, idPlayer, answerText) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "tiebreakQuestion") {
        return false;
    }

    const tiebreak = room.game.tiebreak;

    if (!tiebreak.idPlayers.includes(idPlayer) || tiebreak.answers[idPlayer] !== undefined) {
        return false;
    }

    tiebreak.answers[idPlayer] = answerText;
    return true;
}

/**
 * Checks whether both tiebreak candidates have answered the current tiebreak question.
 * @param {string} roomCode - The code of the room.
 * @returns {boolean} True if both candidates have submitted an answer.
 */
function haveBothTiebreakPlayersAnswered(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "tiebreakQuestion") {
        return false;
    }

    return room.game.tiebreak.idPlayers.every((idPlayer) => room.game.tiebreak.answers[idPlayer] !== undefined);
}

/**
 * Resolves the current tiebreak question: fills in a placeholder answer for whichever candidate
 * did not answer in time and compares both answers against the correct one. A candidate who
 * answered correctly is recorded as immune from the re-vote that follows (`tiebreak.wasCorrect`,
 * checked by `submitTiebreakVote()`) — answering right is this question's only way for a candidate
 * to protect themselves, exactly like answering every question right protects a player from normal
 * voting. Advances the shared question pool exactly like a normal turn's answer would, reshuffling
 * once every question has been asked. Must be called before `startTiebreakVoting()`.
 * @param {string} roomCode - The code of the room.
 * @returns {{questionText: string, correctAnswer: string, answers: Array<{idPlayer: string, playerName: string, answerText: string, isCorrect: boolean}>, idPlayers: string[]}|null}
 *   The reveal info, or null if the room has no active tiebreak question.
 */
function resolveTiebreakQuestion(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "tiebreakQuestion") {
        return null;
    }

    const tiebreak = room.game.tiebreak;
    const question = tiebreak.question;

    const answers = tiebreak.idPlayers.map((idPlayer) => {
        const answerText = tiebreak.answers[idPlayer] ?? "(keine Antwort)";
        const isCorrect = normalizeAnswerText(answerText) === normalizeAnswerText(question.answer);
        const player = room.players.find((candidate) => candidate.idPlayer === idPlayer);

        tiebreak.wasCorrect[idPlayer] = isCorrect;

        return {idPlayer, playerName: player?.name ?? "Unbekannt", answerText, isCorrect};
    });

    room.game.indexQuestion += 1;

    if (room.game.indexQuestion >= room.game.shuffledQuestions.length) {
        room.game.shuffledQuestions = shuffleArray(getAllQuestions());
        room.game.indexQuestion = 0;
    }

    return {questionText: question.text, correctAnswer: question.answer, answers, idPlayers: tiebreak.idPlayers};
}

/**
 * Switches a running tiebreak from its question to its re-vote: only alive players who are not one
 * of the two tiebreak candidates may cast a vote (see `submitTiebreakVote()`). Must be called after
 * `resolveTiebreakQuestion()`.
 * @param {string} roomCode - The code of the room.
 * @returns {{idPlayers: string[], players: Array<object>}|null} The tiebreak's candidate ids and
 *   the updated public player list, or null if the room has no active tiebreak question.
 */
function startTiebreakVoting(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "tiebreakQuestion") {
        return null;
    }

    room.game.phase = "tiebreakVoting";
    room.game.tiebreak.votes = {};

    return {idPlayers: room.game.tiebreak.idPlayers, players: toPublicPlayers(room)};
}

/**
 * Registers an outside player's vote for which of the two tiebreak candidates should lose a life.
 * Ignored outside the tiebreak-voting phase, for a voter who is dead, no longer in the room, or is
 * one of the two candidates themselves (only outside players may break the tie), for a vote that
 * does not target one of the two candidates, targets a candidate who answered the current tiebreak
 * question correctly (`tiebreak.wasCorrect`, set by `resolveTiebreakQuestion()` — a correct answer
 * is this question's own way of earning immunity from this particular re-vote, separate from and
 * in addition to the normal round's "answered everything correctly" immunity, which is also
 * checked here for defense in depth even though a tiebreak candidate cannot normally hold it — see
 * `resolveVotingPhase()`), or if the voter already voted this tiebreak round.
 * @param {string} roomCode - The code of the room.
 * @param {string} idVoter - The persistent id of the voting player.
 * @param {string} idVotedFor - The persistent id of the candidate being voted for.
 * @returns {boolean} True if the vote was accepted.
 */
function submitTiebreakVote(roomCode, idVoter, idVotedFor) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "tiebreakVoting" || room.game.tiebreak.votes[idVoter]) {
        return false;
    }

    const tiebreak = room.game.tiebreak;

    if (tiebreak.idPlayers.includes(idVoter) || !tiebreak.idPlayers.includes(idVotedFor)) {
        return false;
    }

    if (tiebreak.wasCorrect[idVotedFor] || hasAnsweredAllCorrectlyThisRound(room, idVotedFor)) {
        return false;
    }

    const voterStillAlive = room.players.some((player) => player.idPlayer === idVoter && isPlayerAlive(player));

    if (!voterStillAlive) {
        return false;
    }

    tiebreak.votes[idVoter] = idVotedFor;
    return true;
}

/**
 * Checks whether every alive player outside the tiebreak (i.e. every player allowed to vote in it)
 * has cast their tiebreak vote. True immediately if no such outside player exists.
 * @param {string} roomCode - The code of the room.
 * @returns {boolean} True if every eligible outside voter has voted.
 */
function haveAllTiebreakVotersVoted(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "tiebreakVoting") {
        return false;
    }

    const outsideVoters = room.players.filter(
        (player) => isPlayerAlive(player) && !room.game.tiebreak.idPlayers.includes(player.idPlayer),
    );

    return outsideVoters.every((player) => Boolean(room.game.tiebreak.votes[player.idPlayer]));
}

/**
 * Resolves a tiebreak re-vote: whichever of the two candidates received more votes from outside
 * players loses one life (down to a minimum of zero) and the tiebreak ends. If the outside vote is
 * itself tied (including nobody having been able to vote at all, e.g. only the two candidates are
 * left alive), the tiebreak is either abandoned with nobody losing a life (no outside voters at
 * all) or must repeat with another tiebreak question (`startTiebreakQuestion()` again with the same
 * two candidates). Restores `room.game.phase` back to `"voting"` once the tiebreak concludes, so
 * the room ends up in the same phase a normal, non-tied vote would have left it in.
 * @param {string} roomCode - The code of the room.
 * @returns {{type: "stillTied", idPlayers: string[]}|{type: "resolved", votes: Array<{idVoter: string, idVotedFor: string}>, idPlayersLosingLife: string[], players: Array<object>}|null}
 *   Either a marker that another tiebreak question must be started, or the resolved outcome, or
 *   null if the room has no active tiebreak vote.
 */
function resolveTiebreakVoting(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "tiebreakVoting") {
        return null;
    }

    const tiebreak = room.game.tiebreak;
    const outsideVoters = room.players.filter(
        (player) => isPlayerAlive(player) && !tiebreak.idPlayers.includes(player.idPlayer),
    );

    const votes = outsideVoters
        .filter((player) => Boolean(tiebreak.votes[player.idPlayer]))
        .map((player) => ({idVoter: player.idPlayer, idVotedFor: tiebreak.votes[player.idPlayer]}));

    const voteCounts = {};
    votes.forEach((vote) => {
        voteCounts[vote.idVotedFor] = (voteCounts[vote.idVotedFor] ?? 0) + 1;
    });

    const [idFirstCandidate, idSecondCandidate] = tiebreak.idPlayers;
    const firstCandidateVotes = voteCounts[idFirstCandidate] ?? 0;
    const secondCandidateVotes = voteCounts[idSecondCandidate] ?? 0;

    if (outsideVoters.length === 0) {
        room.game.phase = "voting";
        delete room.game.tiebreak;
        return {type: "resolved", votes: [], idPlayersLosingLife: [], players: toPublicPlayers(room)};
    }

    if (firstCandidateVotes === secondCandidateVotes) {
        return {type: "stillTied", idPlayers: tiebreak.idPlayers};
    }

    const idPlayerLosingLife = firstCandidateVotes > secondCandidateVotes ? idFirstCandidate : idSecondCandidate;
    const player = room.players.find((candidate) => candidate.idPlayer === idPlayerLosingLife);

    if (player) {
        player.lives = Math.max(0, player.lives - 1);
    }

    room.game.phase = "voting";
    delete room.game.tiebreak;

    return {type: "resolved", votes, idPlayersLosingLife: [idPlayerLosingLife], players: toPublicPlayers(room)};
}

/**
 * Counts how many players in a room are currently alive (more than zero lives). Used to decide
 * whether the next round should be a normal round or the two-player finale.
 * @param {string} roomCode - The code of the room.
 * @returns {number} The number of currently alive players.
 */
function countAlivePlayers(roomCode) {
    const room = rooms.get(roomCode);
    return room ? room.players.filter(isPlayerAlive).length : 0;
}

/**
 * Builds the public representation of the current finale question for a room's active finale.
 * @param {object} room - The internal room record.
 * @returns {{phase: "finale", question: {text: string}, idPlayers: string[], questionIndex: number, totalQuestions: number, correctCounts: Object<string, number>}}
 *   The current finale question turn.
 */
function buildFinaleTurn(room) {
    const finale = room.game.finale;

    return {
        phase: "finale",
        question: {text: finale.questions[finale.indexQuestion].text},
        idPlayers: finale.idPlayers,
        questionIndex: finale.indexQuestion,
        totalQuestions: finale.questions.length,
        correctCounts: {...finale.correctCounts},
    };
}

/**
 * Starts the finale between the two remaining alive players: reshuffles the full question pool
 * from scratch and has both players answer the same fixed number of questions simultaneously,
 * tracking each player's correct-answer count instead of lives. Only meant to be called once
 * exactly two alive players remain.
 * @param {string} roomCode - The code of the room.
 * @returns {{phase: "finale", question: {text: string}, idPlayers: string[], questionIndex: number, totalQuestions: number, correctCounts: Object<string, number>}|null}
 *   The first finale question, or null if the room has no active game, does not have exactly two
 *   alive players, or no questions are available.
 */
function startFinale(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game) {
        return null;
    }

    const alivePlayers = room.players.filter(isPlayerAlive);

    if (alivePlayers.length !== 2) {
        return null;
    }

    const finaleQuestions = shuffleArray(getAllQuestions()).slice(0, FINALE_QUESTION_COUNT);

    if (finaleQuestions.length === 0) {
        return null;
    }

    room.game.phase = "finale";
    room.game.finale = {
        questions: finaleQuestions,
        indexQuestion: 0,
        idPlayers: alivePlayers.map((player) => player.idPlayer),
        answers: {},
        correctCounts: Object.fromEntries(alivePlayers.map((player) => [player.idPlayer, 0])),
    };

    return buildFinaleTurn(room);
}

/**
 * Registers a finalist's answer for the current finale question. Ignored outside the finale phase,
 * for a player who is not one of the two finalists, or if that player already answered this
 * question.
 * @param {string} roomCode - The code of the room.
 * @param {string} idPlayer - The persistent id of the answering player.
 * @param {string} answerText - The answer text given.
 * @returns {boolean} True if the answer was accepted.
 */
function submitFinaleAnswer(roomCode, idPlayer, answerText) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "finale") {
        return false;
    }

    const finale = room.game.finale;

    if (!finale.idPlayers.includes(idPlayer) || finale.answers[idPlayer] !== undefined) {
        return false;
    }

    finale.answers[idPlayer] = answerText;
    return true;
}

/**
 * Checks whether both finalists have answered the current finale question.
 * @param {string} roomCode - The code of the room.
 * @returns {boolean} True if both finalists have submitted an answer.
 */
function haveBothFinalePlayersAnswered(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "finale") {
        return false;
    }

    return room.game.finale.idPlayers.every((idPlayer) => room.game.finale.answers[idPlayer] !== undefined);
}

/**
 * Resolves the current finale question: fills in a placeholder answer for whichever finalist did
 * not answer in time, compares both answers against the correct one, and increments each
 * finalist's correct-answer count accordingly. Must be called before `advanceFinaleQuestion()`
 * moves the finale on to the next question.
 * @param {string} roomCode - The code of the room.
 * @returns {{questionText: string, correctAnswer: string, answers: Array<{idPlayer: string, playerName: string, answerText: string, isCorrect: boolean}>, correctCounts: Object<string, number>}|null}
 *   The reveal info, or null if the room has no active finale.
 */
function resolveFinaleQuestion(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "finale") {
        return null;
    }

    const finale = room.game.finale;
    const question = finale.questions[finale.indexQuestion];

    const answers = finale.idPlayers.map((idPlayer) => {
        const answerText = finale.answers[idPlayer] ?? "(keine Antwort)";
        const isCorrect = normalizeAnswerText(answerText) === normalizeAnswerText(question.answer);

        if (isCorrect) {
            finale.correctCounts[idPlayer] += 1;
        }

        const player = room.players.find((candidate) => candidate.idPlayer === idPlayer);

        return {idPlayer, playerName: player?.name ?? "Unbekannt", answerText, isCorrect};
    });

    return {
        questionText: question.text,
        correctAnswer: question.answer,
        answers,
        correctCounts: {...finale.correctCounts},
    };
}

/**
 * Advances the finale to its next question, or, once every finale question has been asked,
 * determines the winner (whoever answered more questions correctly overall; null if tied).
 * @param {string} roomCode - The code of the room.
 * @returns {{phase: "finale", question: {text: string}, idPlayers: string[], questionIndex: number, totalQuestions: number, correctCounts: Object<string, number>}|{phase: "finaleFinished", idWinner: string|null, correctCounts: Object<string, number>}|null}
 *   The next finale question, the finale outcome, or null if the room has no active finale.
 */
function advanceFinaleQuestion(roomCode) {
    const room = rooms.get(roomCode);

    if (!room || !room.game || room.game.phase !== "finale") {
        return null;
    }

    const finale = room.game.finale;
    finale.answers = {};
    finale.indexQuestion += 1;

    if (finale.indexQuestion >= finale.questions.length) {
        const [idFirstPlayer, idSecondPlayer] = finale.idPlayers;
        const firstScore = finale.correctCounts[idFirstPlayer];
        const secondScore = finale.correctCounts[idSecondPlayer];
        const idWinner =
            firstScore === secondScore ? null : firstScore > secondScore ? idFirstPlayer : idSecondPlayer;

        return {phase: "finaleFinished", idWinner, correctCounts: {...finale.correctCounts}};
    }

    return buildFinaleTurn(room);
}

/**
 * Revives every player in a room back to the room's `settings.startingLives`, e.g. once the finale is over and the
 * players eliminated during the normal rounds should no longer show up as dead on the finale
 * result screen or in a subsequently restarted game.
 * @param {string} roomCode - The code of the room.
 */
function revivePlayersAfterFinale(roomCode) {
    const room = rooms.get(roomCode);

    if (!room) {
        return;
    }

    room.players.forEach((player) => {
        player.lives = room.settings.startingLives;
    });
}

/**
 * Updates a room's starting-lives setting. Only the room's host may change it, and only while no
 * game is in progress in that room, since changing it mid-game would desync the hearts already
 * shown for the current game.
 * @param {string} roomCode - The code of the room.
 * @param {string} idSocket - The socket id of the player requesting the change.
 * @param {number} startingLives - The requested number of starting lives, clamped to
 *   `[MIN_STARTING_LIVES, MAX_STARTING_LIVES]`.
 * @returns {{startingLives: number}|null} The room's updated settings, or null if the change was
 *   rejected (room not found, requester not host, or a game is currently running).
 */
function updateStartingLives(roomCode, idSocket, startingLives) {
    const room = rooms.get(roomCode);

    if (!room || room.game || !isRoomHost(roomCode, idSocket)) {
        return null;
    }

    const clampedStartingLives = Math.min(MAX_STARTING_LIVES, Math.max(MIN_STARTING_LIVES, Math.round(startingLives)));
    room.settings.startingLives = clampedStartingLives;

    return {...room.settings};
}

/**
 * Updates a room's questions-per-player-per-round setting. Only the room's host may change it, and
 * only while no game is in progress in that room, since changing it mid-round would desync the
 * already-shown answered-question dots and the round's voting-phase transition.
 * @param {string} roomCode - The code of the room.
 * @param {string} idSocket - The socket id of the player requesting the change.
 * @param {number} questionsPerPlayerPerRound - The requested number of questions per player per
 *   round, clamped to `[MIN_QUESTIONS_PER_PLAYER_PER_ROUND, MAX_QUESTIONS_PER_PLAYER_PER_ROUND]`.
 * @returns {{startingLives: number, questionsPerPlayerPerRound: number}|null} The room's updated
 *   settings, or null if the change was rejected (room not found, requester not host, or a game is
 *   currently running).
 */
function updateQuestionsPerPlayerPerRound(roomCode, idSocket, questionsPerPlayerPerRound) {
    const room = rooms.get(roomCode);

    if (!room || room.game || !isRoomHost(roomCode, idSocket)) {
        return null;
    }

    const clampedQuestionsPerPlayerPerRound = Math.min(
        MAX_QUESTIONS_PER_PLAYER_PER_ROUND,
        Math.max(MIN_QUESTIONS_PER_PLAYER_PER_ROUND, Math.round(questionsPerPlayerPerRound)),
    );
    room.settings.questionsPerPlayerPerRound = clampedQuestionsPerPlayerPerRound;

    return {...room.settings};
}

/**
 * Finds the code of the room a socket currently belongs to, without modifying anything.
 * @param {string} idSocket - The socket id to search for.
 * @returns {string|null} The room code, or null if the socket belongs to no room.
 */
function getRoomCodeForSocket(idSocket) {
    const match = findByIdSocket(idSocket);
    return match ? match.roomCode : null;
}

/**
 * Checks whether a room currently has an active game.
 * @param {string} roomCode - The code of the room.
 * @returns {boolean} True if a game is in progress.
 */
function isGameActive(roomCode) {
    return Boolean(rooms.get(roomCode)?.game);
}

/**
 * Stops a room's active game (if any), e.g. because no player was left to take the current turn.
 * @param {string} roomCode - The code of the room.
 */
function stopGame(roomCode) {
    const room = rooms.get(roomCode);

    if (room) {
        room.game = null;
    }
}

export {
    createRoom,
    joinRoom,
    leaveRoom,
    scheduleRemovalOnDisconnect,
    isRoomHost,
    hasEnoughPlayersToStart,
    updateStartingLives,
    updateQuestionsPerPlayerPerRound,
    startGame,
    revivePlayersAfterFinale,
    startNextRound,
    isCurrentPlayerSocket,
    advanceTurn,
    resyncQuestionTurn,
    recordCurrentAnswer,
    getAnswersGivenThisRound,
    getPlayerIdForSocket,
    submitVote,
    haveAllPlayersVoted,
    resolveVotingPhase,
    startTiebreakQuestion,
    submitTiebreakAnswer,
    haveBothTiebreakPlayersAnswered,
    resolveTiebreakQuestion,
    startTiebreakVoting,
    submitTiebreakVote,
    haveAllTiebreakVotersVoted,
    resolveTiebreakVoting,
    getRoomCodeForSocket,
    getPublicPlayers,
    isGameActive,
    stopGame,
    countAlivePlayers,
    startFinale,
    submitFinaleAnswer,
    haveBothFinalePlayersAnswered,
    resolveFinaleQuestion,
    advanceFinaleQuestion,
};
