import {MongoClient} from "mongodb";

let questions = [];
const connectionString = "mongodb+srv://" + process.env.DATABASE_USERNAME + ":" + process.env.DATABASE_PASSWORD + "@clocktowergames.hfnkicc.mongodb.net/?retryWrites=true&w=majority";
const mongoClient = new MongoClient(connectionString);

/**
 * Loads all questions from the "questions" collection of the "derDummsteFliegt" MongoDB database and caches
 * them in memory for the lifetime of the server process.
 * @returns {Promise<void>}
 */
async function loadQuestions() {
    await mongoClient.connect();
    questions = await mongoClient.db("derDummsteFliegt").collection("questions").find().toArray();
}

/**
 * Returns a copy of all cached questions.
 * @returns {Array<{_id: object, text: string, answers: string[], createdAt?: Date, addedAt: Date,
 * tolerance?: number}>} All cached questions. `createdAt` and `addedAt` are the same date for
 * questions inserted via `insertQuestions()` below; older questions can carry an earlier
 * `createdAt`. Questions whose correct answer
 * (`answers[0]`) parses as a number and that carry a numeric `tolerance` are checked as a numeric range: an answer counts
 * as correct if it falls within `tolerance` of `answers[0]` (e.g. correct answer "206" with
 * `tolerance: 10` accepts 196-216) — see `hasNumericToleranceCheck()` in `roomManager.js`. Questions
 * whose `text` starts with "Finish the lyrics" (case-insensitive) are lyrics questions, recognized
 * by that prefix: the client is shown a blank mask for the missing words (one underscore per
 * character, computed from `answers[0]`), and the given answer is checked like any normal text
 * question (see `isAnswerAccepted()`/`getQuestionDisplayText()` in `roomManager.js`).
 */
function getAllQuestions() {
    return [...questions];
}

/**
 * Inserts new question documents into the "questions" collection, stamping each with a fresh
 * `addedAt` and the same value as `createdAt`, and appends them to the in-memory cache so they can
 * be drawn by future rounds without a server restart.
 * @param {Array<{text: string, answers: string[], tolerance?: number}>} newQuestions -
 *   The questions to add, without `_id`/`createdAt`/`addedAt` (all assigned here).
 * @returns {Promise<void>}
 */
async function insertQuestions(newQuestions) {
    if (newQuestions.length === 0) {
        return;
    }

    await mongoClient.connect();
    const addedAt = new Date();
    const questionDocuments = newQuestions.map((newQuestion) => ({
        ...newQuestion,
        createdAt: addedAt,
        addedAt: addedAt,
    }));

    const insertResult = await mongoClient.db("derDummsteFliegt").collection("questions")
        .insertMany(questionDocuments);

    questionDocuments.forEach((questionDocument, indexDocument) => {
        questions.push({...questionDocument, _id: insertResult.insertedIds[indexDocument]});
    });
}

/**
 * Counts how many questions in the active "questions" collection carry the given `creator`.
 * @param {string} creator - The submitting player's name, as stored by the `submitQuestion` event.
 * @returns {Promise<number>} The number of matching questions.
 */
async function countQuestionsCreatedByPlayer(creator) {
    await mongoClient.connect();
    return mongoClient.db("derDummsteFliegt").collection("questions").countDocuments({creator});
}

export {loadQuestions, getAllQuestions, insertQuestions, countQuestionsCreatedByPlayer};
