import {MongoClient} from "mongodb";

const connectionString = "mongodb+srv://" + process.env.DATABASE_USERNAME + ":" + process.env.DATABASE_PASSWORD + "@clocktowergames.hfnkicc.mongodb.net/?retryWrites=true&w=majority";
const mongoClient = new MongoClient(connectionString);
const gameHistoryCollection = mongoClient.db("Misc").collection("gameHistory");

/**
 * Creates a game's `gameHistory` document with all its fields already present in the desired
 * order (idGame, roomCode, startedAt, settings, players, rounds, endedAt), called once when the
 * host starts the game. Later updates only ever `$set` an already-existing field, so this initial
 * insert is what fixes the field order once and for all; any field added to the shape in the
 * future simply appears at the end.
 * @param {string} idGame - The persistent id of the game.
 * @param {string} roomCode - The room code the game was started in.
 * @param {{startingLives: number, questionsPerPlayerPerRound: number}} settings - The room's
 *   settings this game was started with.
 * @returns {Promise<void>}
 */
async function createGameHistoryDocument(idGame, roomCode, settings) {
    await mongoClient.connect();
    await gameHistoryCollection.insertOne({
        idGame,
        roomCode,
        startedAt: new Date(),
        settings,
        players: [],
        rounds: [],
        endedAt: null,
    });
}

/**
 * Replaces a game's recorded round history with its current state, called after every round
 * (question, tiebreak, or finale question) finishes. Leaves the `players` field untouched.
 * @param {string} idGame - The persistent id of the game.
 * @param {Array<{roundNumber: number, type: "question"|"finale", answers: Array<{playerName: string, questionText: string, answerGiven: string, correctAnswer: string, isCorrect: boolean}>, tiebreaks?: Array<{answers: Array<{playerName: string, questionText: string, answerGiven: string, correctAnswer: string, isCorrect: boolean}>}>, votingResult: {votes: Array<{voter: string, votedFor: string}>, playersLosingLife: string[]}|null}>} rounds -
 *   The full round history so far.
 * @returns {Promise<void>}
 */
async function saveRoundsSnapshot(idGame, rounds) {
    await mongoClient.connect();
    await gameHistoryCollection.updateOne({idGame}, {$set: {rounds}});
}

/**
 * Replaces a game's recorded player roster with its current state. Called whenever the roster
 * actually changes: the game started, or a new player joined mid-game (as a spectator). Leaves the
 * `rounds` field untouched.
 * @param {string} idGame - The persistent id of the game.
 * @param {Array<{idPlayer: string, name: string}>} players - The full player roster as it stands
 *   now.
 * @returns {Promise<void>}
 */
async function savePlayersSnapshot(idGame, players) {
    await mongoClient.connect();
    await gameHistoryCollection.updateOne({idGame}, {$set: {players}});
}

/**
 * Marks a game as finished by recording its end time. Leaves the `players` and `rounds` fields
 * untouched.
 * @param {string} idGame - The persistent id of the game.
 * @param {Date} endedAt - The time the game ended.
 * @returns {Promise<void>}
 */
async function finalizeGameHistory(idGame, endedAt) {
    await mongoClient.connect();
    await gameHistoryCollection.updateOne({idGame}, {$set: {endedAt}});
}

export {createGameHistoryDocument, saveRoundsSnapshot, savePlayersSnapshot, finalizeGameHistory};
