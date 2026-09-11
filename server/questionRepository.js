import {MongoClient} from "mongodb";

let questions = [];
const connectionString = "mongodb+srv://" + process.env.DATABASE_USERNAME + ":" + process.env.DATABASE_PASSWORD + "@clocktowergames.hfnkicc.mongodb.net/?retryWrites=true&w=majority";
const mongoClient = new MongoClient(connectionString);

/**
 * Loads all questions from the "questions" collection of the "Misc" MongoDB database and caches
 * them in memory for the lifetime of the server process.
 * @returns {Promise<void>}
 */
async function loadQuestions() {
    await mongoClient.connect();
    questions = await mongoClient.db("Misc").collection("questions").find().toArray();
}

/**
 * Returns a copy of all cached questions.
 * @returns {Array<{_id: object, text: string, answers: string[], createdAt: string, type?: string,
 * tolerance?: number}>} All cached questions. Questions with `type === "numeric"` are checked as a
 * numeric range: an answer counts as correct if it falls within `tolerance` of `answers[0]`
 * (e.g. correct answer "206" with `tolerance: 10` accepts 196-216). Questions whose `text` starts
 * with "Finish the lyrics" (case-insensitive) are lyrics questions, recognized by that prefix
 * rather than a dedicated `type` value: the client is shown a blank mask for the missing words
 * (one underscore per character, computed from `answers[0]`), and the given answer is checked like
 * any normal text question (see `isAnswerAccepted()`/`getQuestionDisplayText()` in `roomManager.js`).
 */
function getAllQuestions() {
    return [...questions];
}

export {loadQuestions, getAllQuestions};
