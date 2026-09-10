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
 * @returns {Array<{_id: object, text: string, answers: string[], createdAt: string}>} All cached questions.
 */
function getAllQuestions() {
    return [...questions];
}

export {loadQuestions, getAllQuestions};
