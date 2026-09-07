import {connectToServer} from "./socketClient.js";
import {getOrCreatePlayerId} from "./playerIdentity.js";

const MINIMUM_PLAYERS_TO_START = 3;

const elementRoomScreen = document.getElementById("roomScreen");
const elementGameScreen = document.getElementById("gameScreen");
const buttonStartGame = document.getElementById("buttonStartGame");
const buttonLeaveRoom = document.getElementById("buttonLeaveRoom");
const timerBarFill = document.getElementById("timerBarFill");
const textQuestion = document.getElementById("textQuestion");
const textVotingHint = document.getElementById("textVotingHint");
const textFinaleProgress = document.getElementById("textFinaleProgress");
const answerInputRow = document.getElementById("answerInputRow");
const inputAnswer = document.getElementById("inputAnswer");
const buttonSubmitAnswer = document.getElementById("buttonSubmitAnswer");
const answerReveal = document.getElementById("answerReveal");
const textPlayerAnswer = document.getElementById("textPlayerAnswer");
const textCorrectAnswer = document.getElementById("textCorrectAnswer");
const votingResult = document.getElementById("votingResult");
const listVotes = document.getElementById("listVotes");
const textVotingOutcome = document.getElementById("textVotingOutcome");
const listPlayersInGame = document.getElementById("listPlayersInGame");
const deadPlayersBox = document.getElementById("deadPlayersBox");
const listDeadPlayers = document.getElementById("listDeadPlayers");
const finaleAnswerRow = document.getElementById("finaleAnswerRow");
const textFinaleNameLeft = document.getElementById("textFinaleNameLeft");
const textFinaleNameRight = document.getElementById("textFinaleNameRight");
const inputFinaleAnswerLeft = document.getElementById("inputFinaleAnswerLeft");
const inputFinaleAnswerRight = document.getElementById("inputFinaleAnswerRight");
const buttonSubmitFinaleAnswerLeft = document.getElementById("buttonSubmitFinaleAnswerLeft");
const buttonSubmitFinaleAnswerRight = document.getElementById("buttonSubmitFinaleAnswerRight");
const finaleReveal = document.getElementById("finaleReveal");
const textFinaleAnswerLeft = document.getElementById("textFinaleAnswerLeft");
const textFinaleAnswerRight = document.getElementById("textFinaleAnswerRight");
const textFinaleCorrectAnswer = document.getElementById("textFinaleCorrectAnswer");
const finaleResult = document.getElementById("finaleResult");
const textFinaleWinner = document.getElementById("textFinaleWinner");
const buttonRestartGame = document.getElementById("buttonRestartGame");

const MAX_LIVES = 3;

let currentPlayers = [];
let idCurrentTurnPlayer = null;
let hasGameStarted = false;
let isVotingPhase = false;
let hasVotedThisRound = false;
let answersByPlayerThisRound = {};
let activeTimer = null;
let isFinalePhase = false;
let finaleIdPlayers = [];
let finaleAnswersByPlayer = {};
let hasSubmittedFinaleAnswer = false;
let finaleRestartRevealTimeout = null;

answerInputRow.hidden = true;
finaleAnswerRow.hidden = true;

/**
 * Reads the room code from the "room" query parameter (e.g. "room.html?room=<roomCode>").
 * @returns {string|null} The room code from the URL, or null if not present.
 */
function readRoomCodeFromUrl() {
    const roomCode = new URLSearchParams(location.search).get("room");
    return roomCode ? roomCode.toUpperCase() : null;
}

/**
 * Checks whether a player has answered every question known so far this round correctly, making
 * them immune from being voted for.
 * @param {string} idPlayerToCheck - The persistent id of the player to check.
 * @returns {boolean} True if the player has at least one known answer this round and all of them
 *   are correct.
 */
function hasPlayerAnsweredAllCorrectly(idPlayerToCheck) {
    const answerHistory = answersByPlayerThisRound[idPlayerToCheck];
    return Boolean(answerHistory && answerHistory.length > 0 && answerHistory.every((entry) => entry.isCorrect));
}

/**
 * Renders a player's row of lives as heart icons, greying out the rightmost hearts first as
 * lives are lost.
 * @param {number} lives - The player's remaining lives.
 * @returns {HTMLElement} A row element containing one heart icon per starting life.
 */
function renderPlayerHearts(lives) {
    const heartsRow = document.createElement("div");
    heartsRow.classList.add("playerHearts");

    for (let indexHeart = 0; indexHeart < MAX_LIVES; indexHeart++) {
        const heartIcon = document.createElement("span");
        heartIcon.classList.add("heartIcon");
        heartIcon.textContent = indexHeart < lives ? "❤️" : "🤍";

        heartsRow.appendChild(heartIcon);
    }

    return heartsRow;
}

/**
 * Renders a player's answered-questions progress as one dot per question already answered in the
 * current round: green if answered correctly, grey otherwise. Wherever answer history is already
 * known for a dot, it also shows the question, the player's answer, and the correct answer as a
 * hover tooltip.
 * @param {string} playerName - The player's display name, used in the tooltip's answer line.
 * @param {number} answeredCount - How many questions the player has already answered this round.
 * @param {Array<{questionText: string, answerGiven: string, correctAnswer: string, isCorrect: boolean}>|undefined} answerHistory -
 *   This player's answer history for the round known so far.
 * @returns {HTMLElement} A row element containing one dot per answered question.
 */
function renderPlayerAnsweredDots(playerName, answeredCount, answerHistory) {
    const dotsRow = document.createElement("div");
    dotsRow.classList.add("playerAnsweredDots");

    for (let indexDot = 0; indexDot < answeredCount; indexDot++) {
        const dot = document.createElement("span");
        dot.classList.add("answeredDot");

        const answerEntry = answerHistory?.[indexDot];

        if (answerEntry) {
            dot.dataset.tooltip =
                `Frage: ${answerEntry.questionText}\n` +
                `${playerName}'s Antwort: ${answerEntry.answerGiven}\n` +
                `Richtige Antwort: ${answerEntry.correctAnswer}`;

            if (answerEntry.isCorrect) {
                dot.classList.add("correctAnswerDot");
            }
        }

        dotsRow.appendChild(dot);
    }

    return dotsRow;
}

/**
 * Renders a list of players into a target list element: a row of life hearts, the name (with a
 * crown for the host, golden border for whoever's turn it currently is), and a row of dots for
 * the questions already answered this round. For a finalist during the finale, the dots reflect
 * their finale answers so far instead of the normal round's answer history.
 * @param {HTMLElement} targetList - The list element to render into.
 * @param {Array<{idPlayer: string, name: string, isHost: boolean, lives: number, answeredCount: number}>} players -
 *   Players to render.
 * @param {string|null} idPlayerOnTurn - The persistent id of the player whose turn it is, if any.
 */
function renderPlayers(targetList, players, idPlayerOnTurn) {
    targetList.innerHTML = "";

    for (const player of players) {
        const itemPlayer = document.createElement("li");
        itemPlayer.dataset.idPlayer = player.idPlayer;

        if (player.idPlayer === idPlayerOnTurn) {
            itemPlayer.classList.add("currentTurn");
        }

        if (isVotingPhase && hasPlayerAnsweredAllCorrectly(player.idPlayer)) {
            itemPlayer.classList.add("immuneFromVoting");
        }

        const nameElement = document.createElement("span");
        nameElement.classList.add("playerName");
        nameElement.textContent = player.isHost ? `👑 ${player.name}` : player.name;

        const isFinalist = isFinalePhase && finaleIdPlayers.includes(player.idPlayer);
        const answerHistory = isFinalist ? finaleAnswersByPlayer[player.idPlayer] : answersByPlayerThisRound[player.idPlayer];
        // player.answeredCount reflects the server's count as of the last turnStarted/votingStarted
        // broadcast; right after this player's own answer is revealed, the locally known history is
        // already one entry ahead of that (the next such broadcast hasn't arrived yet), so take
        // whichever is higher to avoid the just-answered dot briefly disappearing.
        const answeredCount = isFinalist
            ? (answerHistory?.length ?? 0)
            : Math.max(player.answeredCount, answerHistory?.length ?? 0);

        itemPlayer.appendChild(renderPlayerHearts(player.lives));
        itemPlayer.appendChild(nameElement);
        itemPlayer.appendChild(renderPlayerAnsweredDots(player.name, answeredCount, answerHistory));

        targetList.appendChild(itemPlayer);
    }
}

/**
 * Renders the list of dead players (zero lives) as name-only rows, without hearts or answered-
 * question dots.
 * @param {Array<{idPlayer: string, name: string}>} deadPlayers - Players with zero lives.
 */
function renderDeadPlayers(deadPlayers) {
    listDeadPlayers.innerHTML = "";
    deadPlayersBox.hidden = deadPlayers.length === 0;

    for (const player of deadPlayers) {
        const itemPlayer = document.createElement("li");
        itemPlayer.textContent = player.name;
        listDeadPlayers.appendChild(itemPlayer);
    }
}

/**
 * Renders the in-game player list from the latest known state, splitting players into the alive
 * player list and the dead-players box, and shows the "Spiel starten" button only to the host
 * while no game is running and at least `MINIMUM_PLAYERS_TO_START` players are in the room.
 * @param {string} idOwnPlayer - The persistent id of the player viewing this page.
 */
function renderPlayerLists(idOwnPlayer) {
    const alivePlayers = currentPlayers.filter((player) => player.lives > 0);
    const deadPlayers = currentPlayers.filter((player) => player.lives <= 0);

    renderPlayers(listPlayersInGame, alivePlayers, idCurrentTurnPlayer);
    renderDeadPlayers(deadPlayers);

    if (hasGameStarted) {
        buttonStartGame.hidden = true;
        return;
    }

    const ownPlayer = currentPlayers.find((player) => player.idPlayer === idOwnPlayer);
    const hasEnoughPlayers = currentPlayers.length >= MINIMUM_PLAYERS_TO_START;
    buttonStartGame.hidden = !ownPlayer?.isHost || !hasEnoughPlayers;
}

/**
 * Restarts the shrinking timer bar animation for a new turn, based on the server's authoritative
 * start time rather than the moment this client happens to process the event. This keeps the bar
 * in sync across players even if a client's tab was backgrounded and only catches up late.
 * Remembers the duration/start time so `resyncTimerBarToNow()` can re-derive the correct position
 * later, e.g. once a backgrounded tab becomes visible again.
 * @param {number} durationMs - The full duration of a turn.
 * @param {number} startedAt - The server timestamp (ms since epoch) when the turn started.
 */
function restartTimerBar(durationMs, startedAt) {
    activeTimer = {durationMs, startedAt};

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = Math.max(0, durationMs - elapsedMs);
    const remainingRatio = remainingMs / durationMs;

    timerBarFill.style.transition = "none";
    timerBarFill.style.width = `${remainingRatio * 100}%`;
    void timerBarFill.offsetWidth;
    timerBarFill.style.transition = `width ${remainingMs}ms linear`;
    timerBarFill.style.width = "0%";
}

/**
 * Freezes the timer bar at its current visual width, stopping the countdown while the answer
 * reveal is shown. Reads the live, browser-interpolated width before cancelling the transition,
 * so the bar does not jump before it stops. Clears the remembered timer so a tab becoming visible
 * again during the reveal does not wrongly resume a countdown.
 */
function stopTimerBar() {
    activeTimer = null;

    const currentWidth = getComputedStyle(timerBarFill).width;

    timerBarFill.style.transition = "none";
    timerBarFill.style.width = currentWidth;
}

/**
 * Re-derives the timer bar's position from the currently active timer's server-authoritative start
 * time. Browsers suspend rendering (including running CSS transitions) for hidden tabs, so a
 * backgrounded tab's bar visually freezes until this runs; calling it on `visibilitychange` makes
 * the bar always reflect the real, current state instead of restarting from full width.
 */
function resyncTimerBarToNow() {
    if (document.visibilityState !== "visible" || !activeTimer) {
        return;
    }

    restartTimerBar(activeTimer.durationMs, activeTimer.startedAt);
}

document.addEventListener("visibilitychange", resyncTimerBarToNow);

const idPlayer = getOrCreatePlayerId();
const playerName = sessionStorage.getItem("playerName");
const roomCode = readRoomCodeFromUrl();

if (!playerName || !roomCode) {
    window.location.href = roomCode ? `index.html?room=${roomCode}` : "index.html";
} else {
    const socket = connectToServer();

    /**
     * Sends the currently typed answer to the server and hides the input until the next turn.
     */
    function submitAnswer() {
        if (answerInputRow.hidden || inputAnswer.value.trim() === "") {
            return;
        }

        const answerText = inputAnswer.value.trim();
        answerInputRow.hidden = true;
        socket.emit("submitAnswer", {roomCode, answerText});
    }

    /**
     * Sends the currently typed answer for whichever finale input belongs to this player, then
     * disables both finale inputs until the next question so this player cannot answer twice.
     */
    function submitFinaleAnswerFromOwnInput() {
        if (finaleAnswerRow.hidden || hasSubmittedFinaleAnswer) {
            return;
        }

        const ownInput = !inputFinaleAnswerLeft.disabled ? inputFinaleAnswerLeft : inputFinaleAnswerRight;

        if (ownInput.disabled || ownInput.value.trim() === "") {
            return;
        }

        hasSubmittedFinaleAnswer = true;
        inputFinaleAnswerLeft.disabled = true;
        inputFinaleAnswerRight.disabled = true;
        buttonSubmitFinaleAnswerLeft.disabled = true;
        buttonSubmitFinaleAnswerRight.disabled = true;
        socket.emit("submitFinaleAnswer", {roomCode, answerText: ownInput.value.trim()});
    }

    /**
     * Applies a "turnStarted" event's data to the UI: shows the current question, switches to the
     * game screen, and starts the turn's timer bar. Used both for the live event and to catch a
     * rejoining player up on an already-running turn.
     * @param {{question: {text: string}, idCurrentPlayer: string, turnDurationMs: number, turnStartedAt: number, players: Array<object>, answersByPlayer: object}} data -
     *   The turn data.
     */
    function applyTurnStarted({question, idCurrentPlayer, turnDurationMs, turnStartedAt, players, answersByPlayer}) {
        currentPlayers = players;
        hasGameStarted = true;
        idCurrentTurnPlayer = idCurrentPlayer;

        elementRoomScreen.hidden = true;
        elementGameScreen.hidden = false;

        isVotingPhase = false;
        hasVotedThisRound = false;
        answersByPlayerThisRound = answersByPlayer;
        isFinalePhase = false;
        finaleIdPlayers = [];
        finaleAnswersByPlayer = {};
        listPlayersInGame.classList.remove("votingActive", "voted");
        renderPlayerLists(idPlayer);

        textQuestion.textContent = question.text;
        textVotingHint.hidden = true;
        textFinaleProgress.hidden = true;
        inputAnswer.value = "";
        answerReveal.hidden = true;
        textPlayerAnswer.textContent = "";
        textCorrectAnswer.textContent = "";
        votingResult.hidden = true;
        listVotes.innerHTML = "";
        textVotingOutcome.textContent = "";
        finaleAnswerRow.hidden = true;
        finaleReveal.hidden = true;
        finaleResult.hidden = true;
        clearTimeout(finaleRestartRevealTimeout);
        buttonRestartGame.hidden = true;

        const isOwnTurn = idCurrentPlayer === idPlayer;
        answerInputRow.hidden = !isOwnTurn;

        if (isOwnTurn) {
            inputAnswer.focus();
        }

        restartTimerBar(turnDurationMs, turnStartedAt);
    }

    /**
     * Applies an "answerRevealed" event's data to the UI: shows the given and correct answer, and
     * freezes the timer bar. Used both for the live event and to catch a rejoining player up on an
     * already-running reveal.
     * @param {{idPlayer: string, playerName: string, answerText: string, questionText: string, correctAnswer: string, isCorrect: boolean, answersByPlayer: object}} data -
     *   The reveal data.
     */
    function applyAnswerRevealed({playerName: answeringPlayerName, answerText, correctAnswer, answersByPlayer}) {
        answerInputRow.hidden = true;
        textPlayerAnswer.textContent = `${answeringPlayerName}'s Antwort: ${answerText}`;
        textCorrectAnswer.textContent = `Richtige Antwort: ${correctAnswer}`;
        answerReveal.hidden = false;
        stopTimerBar();

        answersByPlayerThisRound = answersByPlayer;
        renderPlayerLists(idPlayer);
    }

    /**
     * Applies a "votingStarted" event's data to the UI: switches to the voting view and starts the
     * voting timer bar. Used both for the live event and to catch a rejoining player up on an
     * already-running voting phase.
     * @param {{players: Array<object>, answersByPlayer: object, votingDurationMs: number, votingStartedAt: number}} data -
     *   The voting-phase data.
     */
    function applyVotingStarted({players, answersByPlayer, votingDurationMs, votingStartedAt}) {
        currentPlayers = players;
        idCurrentTurnPlayer = null;
        isVotingPhase = true;
        hasVotedThisRound = false;
        answersByPlayerThisRound = answersByPlayer;
        isFinalePhase = false;
        finaleIdPlayers = [];
        finaleAnswersByPlayer = {};
        listPlayersInGame.classList.add("votingActive");
        listPlayersInGame.classList.remove("voted");
        renderPlayerLists(idPlayer);

        elementRoomScreen.hidden = true;
        elementGameScreen.hidden = false;

        textQuestion.textContent = "Voting";
        textVotingHint.hidden = false;
        textFinaleProgress.hidden = true;
        answerInputRow.hidden = true;
        answerReveal.hidden = true;
        textPlayerAnswer.textContent = "";
        textCorrectAnswer.textContent = "";
        votingResult.hidden = true;
        finaleAnswerRow.hidden = true;
        finaleReveal.hidden = true;
        finaleResult.hidden = true;
        clearTimeout(finaleRestartRevealTimeout);
        buttonRestartGame.hidden = true;
        restartTimerBar(votingDurationMs, votingStartedAt);
    }

    /**
     * Applies a "votingResolved" event's data to the UI: shows who voted for whom and who lost a
     * life, and starts the result-display timer bar. Used both for the live event and to catch a
     * rejoining player up on an already-running result display.
     * @param {{votes: Array<object>, idPlayersLosingLife: string[], players: Array<object>, resultDurationMs: number, resultStartedAt: number}} data -
     *   The voting-result data.
     */
    function applyVotingResolved({votes, idPlayersLosingLife, players, resultDurationMs, resultStartedAt}) {
        currentPlayers = players;
        isVotingPhase = false;
        listPlayersInGame.classList.remove("votingActive", "voted");
        renderPlayerLists(idPlayer);

        textQuestion.textContent = "Voting Results";
        textVotingHint.hidden = true;
        textFinaleProgress.hidden = true;
        finaleAnswerRow.hidden = true;
        finaleReveal.hidden = true;
        finaleResult.hidden = true;
        listVotes.innerHTML = "";

        for (const vote of votes) {
            const voter = players.find((player) => player.idPlayer === vote.idVoter);
            const votedFor = players.find((player) => player.idPlayer === vote.idVotedFor);
            const itemVote = document.createElement("li");
            itemVote.textContent = `${voter?.name ?? "Unbekannt"} → ${votedFor?.name ?? "Unbekannt"}`;
            listVotes.appendChild(itemVote);
        }

        const namesLosingLife = idPlayersLosingLife
            .map((idLoser) => players.find((player) => player.idPlayer === idLoser)?.name ?? "Unbekannt")
            .join(", ");

        textVotingOutcome.textContent =
            idPlayersLosingLife.length > 1
                ? `${namesLosingLife} verlieren je ein Herz (Unentschieden).`
                : `${namesLosingLife} verliert ein Herz.`;

        votingResult.hidden = false;
        restartTimerBar(resultDurationMs, resultStartedAt);
    }

    /**
     * Shows the two finalists' names next to their input field and enables only the field
     * belonging to the viewing player, so both finalists see the same left/right layout while
     * only their own side stays editable. Anyone else (an eliminated player watching) sees both
     * fields disabled.
     * @param {Array<{idPlayer: string, name: string}>} players - The current player list.
     */
    function setupFinaleInputs(players) {
        const [idLeftPlayer, idRightPlayer] = finaleIdPlayers;

        textFinaleNameLeft.textContent = players.find((player) => player.idPlayer === idLeftPlayer)?.name ?? "Unbekannt";
        textFinaleNameRight.textContent = players.find((player) => player.idPlayer === idRightPlayer)?.name ?? "Unbekannt";

        inputFinaleAnswerLeft.value = "";
        inputFinaleAnswerRight.value = "";

        const isOwnLeft = idLeftPlayer === idPlayer;
        const isOwnRight = idRightPlayer === idPlayer;

        inputFinaleAnswerLeft.disabled = !isOwnLeft;
        buttonSubmitFinaleAnswerLeft.disabled = !isOwnLeft;
        inputFinaleAnswerRight.disabled = !isOwnRight;
        buttonSubmitFinaleAnswerRight.disabled = !isOwnRight;

        if (isOwnLeft) {
            inputFinaleAnswerLeft.focus();
        } else if (isOwnRight) {
            inputFinaleAnswerRight.focus();
        }
    }

    /**
     * Applies a "finaleStarted" event's data to the UI: shows the current finale question, the
     * left/right answer inputs (own side enabled only), and starts the finale question's timer
     * bar. Used both for the live event and to catch a rejoining player up on an already-running
     * finale question.
     * @param {{question: {text: string}, idPlayers: string[], questionIndex: number, totalQuestions: number, correctCounts: Object<string, number>, finaleDurationMs: number, finaleStartedAt: number, players: Array<object>}} data -
     *   The finale question data.
     */
    function applyFinaleStarted({question, idPlayers, questionIndex, totalQuestions, finaleDurationMs, finaleStartedAt, players}) {
        currentPlayers = players;
        hasGameStarted = true;
        idCurrentTurnPlayer = null;
        isVotingPhase = false;
        hasVotedThisRound = false;
        isFinalePhase = true;
        finaleIdPlayers = idPlayers;
        hasSubmittedFinaleAnswer = false;

        if (questionIndex === 0) {
            finaleAnswersByPlayer = {};
        }

        listPlayersInGame.classList.remove("votingActive", "voted");
        renderPlayerLists(idPlayer);

        elementRoomScreen.hidden = true;
        elementGameScreen.hidden = false;

        textQuestion.textContent = question.text;
        textVotingHint.hidden = true;
        textFinaleProgress.hidden = false;
        textFinaleProgress.textContent = `Finale — Frage ${questionIndex + 1} von ${totalQuestions}`;

        answerInputRow.hidden = true;
        answerReveal.hidden = true;
        votingResult.hidden = true;
        finaleReveal.hidden = true;
        finaleResult.hidden = true;
        finaleAnswerRow.hidden = false;

        setupFinaleInputs(players);
        restartTimerBar(finaleDurationMs, finaleStartedAt);
    }

    /**
     * Applies a "finaleAnswerRevealed" event's data to the UI: shows both finalists' answers next
     * to the correct answer, records them into each finalist's answer history so the shared
     * player list's answered-question dots grow accordingly, and freezes the timer bar. Used both
     * for the live event and to catch a rejoining player up on an already-running finale reveal.
     * @param {{questionText: string, correctAnswer: string, answers: Array<{idPlayer: string, playerName: string, answerText: string, isCorrect: boolean}>, correctCounts: Object<string, number>}} data -
     *   The finale reveal data.
     */
    function applyFinaleAnswerRevealed({questionText, correctAnswer, answers}) {
        isFinalePhase = true;
        finaleIdPlayers = answers.map((answer) => answer.idPlayer);
        finaleAnswerRow.hidden = true;
        stopTimerBar();

        const [leftAnswer, rightAnswer] = answers;

        textFinaleAnswerLeft.textContent = leftAnswer
            ? `${leftAnswer.playerName}'s Antwort: ${leftAnswer.answerText}`
            : "";
        textFinaleAnswerRight.textContent = rightAnswer
            ? `${rightAnswer.playerName}'s Antwort: ${rightAnswer.answerText}`
            : "";
        textFinaleCorrectAnswer.textContent = `Richtige Antwort: ${correctAnswer}`;
        finaleReveal.hidden = false;

        for (const answer of answers) {
            if (!finaleAnswersByPlayer[answer.idPlayer]) {
                finaleAnswersByPlayer[answer.idPlayer] = [];
            }

            finaleAnswersByPlayer[answer.idPlayer].push({
                questionText,
                answerGiven: answer.answerText,
                correctAnswer,
                isCorrect: answer.isCorrect,
            });
        }

        renderPlayerLists(idPlayer);
    }

    /**
     * Applies a "finaleResolved" event's data to the UI: shows only the winner (or a tie) — the
     * final score itself stays visible via each finalist's answered-question dots in the player
     * list — and freezes the timer bar, since the game now simply waits here instead of counting
     * down to an automatic continuation. After the server-given delay has passed (accounting for
     * time already elapsed, so a rejoining player is caught up correctly), the host gets a button
     * to start a fresh game; other players see no button and just keep waiting. Used both for the
     * live event and to catch a rejoining player up on an already-running finale result display.
     * @param {{idWinner: string|null, correctCounts: Object<string, number>, players: Array<object>, resultDurationMs: number, resultStartedAt: number}} data -
     *   The finale-result data.
     */
    function applyFinaleResolved({idWinner, correctCounts, players, resultDurationMs, resultStartedAt}) {
        isFinalePhase = true;
        finaleIdPlayers = Object.keys(correctCounts);
        currentPlayers = players;
        renderPlayerLists(idPlayer);

        textQuestion.textContent = "Finale Ergebnis";
        textFinaleProgress.hidden = true;
        finaleAnswerRow.hidden = true;
        finaleReveal.hidden = true;

        textFinaleWinner.textContent = idWinner
            ? `${players.find((player) => player.idPlayer === idWinner)?.name ?? "Unbekannt"} gewinnt das Finale!`
            : "Unentschieden!";

        finaleResult.hidden = false;

        activeTimer = null;
        timerBarFill.style.transition = "none";
        timerBarFill.style.width = "0%";

        clearTimeout(finaleRestartRevealTimeout);
        buttonRestartGame.hidden = true;

        const isOwnHost = players.find((player) => player.idPlayer === idPlayer)?.isHost ?? false;

        if (isOwnHost) {
            const remainingMs = Math.max(0, resultDurationMs - (Date.now() - resultStartedAt));
            finaleRestartRevealTimeout = setTimeout(() => {
                buttonRestartGame.hidden = false;
            }, remainingMs);
        }
    }

    /**
     * Catches a (re-)joining player up on a game already in progress, e.g. after a page reload
     * within the disconnect grace period. Re-applies whichever game-display event was last
     * broadcast in this room, so the player lands back on the correct screen and phase instead of
     * the empty waiting room.
     * @param {({type: "turnStarted"}|{type: "answerRevealed"}|{type: "votingStarted"}|{type: "votingResolved"}|{type: "finaleStarted"}|{type: "finaleAnswerRevealed"}|{type: "finaleResolved"})|null} gameState -
     *   The room's last broadcast game-display state, or null if no game is running.
     */
    function applyGameStateOnRejoin(gameState) {
        if (!gameState) {
            return;
        }

        if (gameState.type === "turnStarted") {
            applyTurnStarted(gameState);
        } else if (gameState.type === "answerRevealed") {
            applyAnswerRevealed(gameState);
        } else if (gameState.type === "votingStarted") {
            applyVotingStarted(gameState);
        } else if (gameState.type === "votingResolved") {
            applyVotingResolved(gameState);
        } else if (gameState.type === "finaleStarted") {
            applyFinaleStarted(gameState);
        } else if (gameState.type === "finaleAnswerRevealed") {
            applyFinaleAnswerRevealed(gameState);
        } else if (gameState.type === "finaleResolved") {
            applyFinaleResolved(gameState);
        }
    }

    socket.emit("joinRoom", {playerName, roomCode, idPlayer});

    socket.on("roomJoined", ({players, gameState}) => {
        currentPlayers = players;
        renderPlayerLists(idPlayer);
        applyGameStateOnRejoin(gameState);
    });

    socket.on("playersUpdated", ({players}) => {
        currentPlayers = players;
        renderPlayerLists(idPlayer);
    });

    socket.on("turnStarted", applyTurnStarted);

    socket.on("answerRevealed", applyAnswerRevealed);

    socket.on("votingStarted", applyVotingStarted);

    socket.on("votingResolved", applyVotingResolved);

    socket.on("finaleStarted", applyFinaleStarted);

    socket.on("finaleAnswerRevealed", applyFinaleAnswerRevealed);

    socket.on("finaleResolved", applyFinaleResolved);

    socket.on("gameStopped", () => {
        hasGameStarted = false;
        idCurrentTurnPlayer = null;
        isVotingPhase = false;
        hasVotedThisRound = false;
        answersByPlayerThisRound = {};
        isFinalePhase = false;
        finaleIdPlayers = [];
        finaleAnswersByPlayer = {};
        hasSubmittedFinaleAnswer = false;
        listPlayersInGame.classList.remove("votingActive", "voted");
        renderPlayerLists(idPlayer);

        elementGameScreen.hidden = true;
        elementRoomScreen.hidden = false;
        answerInputRow.hidden = true;
        answerReveal.hidden = true;
        textQuestion.textContent = "";
        textVotingHint.hidden = true;
        textFinaleProgress.hidden = true;
        textPlayerAnswer.textContent = "";
        textCorrectAnswer.textContent = "";
        votingResult.hidden = true;
        listVotes.innerHTML = "";
        textVotingOutcome.textContent = "";
        finaleAnswerRow.hidden = true;
        finaleReveal.hidden = true;
        finaleResult.hidden = true;
        clearTimeout(finaleRestartRevealTimeout);
        buttonRestartGame.hidden = true;

        activeTimer = null;
        timerBarFill.style.transition = "none";
        timerBarFill.style.width = "100%";
    });

    socket.on("errorMessage", ({message}) => {
        alert(message);
        window.location.href = "index.html";
    });

    socket.on("gameErrorMessage", ({message}) => {
        alert(message);
    });

    buttonStartGame.addEventListener("click", () => {
        socket.emit("startGame", {roomCode});
    });

    buttonRestartGame.addEventListener("click", () => {
        socket.emit("startGame", {roomCode});
    });

    inputAnswer.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            submitAnswer();
        }
    });

    buttonSubmitAnswer.addEventListener("click", submitAnswer);

    inputFinaleAnswerLeft.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            submitFinaleAnswerFromOwnInput();
        }
    });

    inputFinaleAnswerRight.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            submitFinaleAnswerFromOwnInput();
        }
    });

    buttonSubmitFinaleAnswerLeft.addEventListener("click", submitFinaleAnswerFromOwnInput);

    buttonSubmitFinaleAnswerRight.addEventListener("click", submitFinaleAnswerFromOwnInput);

    listPlayersInGame.addEventListener("click", (event) => {
        if (!isVotingPhase || hasVotedThisRound) {
            return;
        }

        const itemPlayer = event.target.closest("li[data-id-player]");

        if (!itemPlayer || itemPlayer.classList.contains("immuneFromVoting")) {
            return;
        }

        hasVotedThisRound = true;
        itemPlayer.classList.add("votedByMe");
        listPlayersInGame.classList.add("voted");
        socket.emit("submitVote", {roomCode, idVotedFor: itemPlayer.dataset.idPlayer});
    });

    buttonLeaveRoom.addEventListener("click", () => {
        socket.emit("leaveRoom");
        window.location.href = "index.html";
    });
}
