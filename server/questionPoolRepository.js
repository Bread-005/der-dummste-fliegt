import {MongoClient} from "mongodb";

const connectionString = "mongodb+srv://" + process.env.DATABASE_USERNAME + ":" + process.env.DATABASE_PASSWORD + "@clocktowergames.hfnkicc.mongodb.net/?retryWrites=true&w=majority";
const mongoClient = new MongoClient(connectionString);
const questionPoolCollection = mongoClient.db("derDummsteFliegt").collection("unreleasedQuestions");

/**
 * Draws up to `count` random questions out of the "unreleasedQuestions" collection and removes them from
 * it, so the same question is never drawn twice. Each candidate is removed via a `deleteOne` on its
 * own `_id`, which is atomic per document: if two servers happen to sample the same question at the
 * same time, only one of them succeeds in deleting it, and the loser simply samples again excluding
 * that id. Returns fewer than `count` questions (down to none) if the pool runs out.
 * @param {number} count - The maximum number of questions to draw.
 * @returns {Promise<Array<{text: string, answers: string[], tolerance?: number, difficulty: number}>>}
 *   The drawn questions, without their `_id`. `difficulty` (1-10) only guides curation of the pool
 *   and must be stripped before a question is inserted into the "questions" collection (see
 *   `replenishQuestionsFromPool()` in `questionPool.js`).
 */
async function drawQuestionsFromPool(count) {
    await mongoClient.connect();

    const drawnQuestions = [];
    const excludedIds = [];

    while (drawnQuestions.length < count) {
        const [candidate] = await questionPoolCollection
            .aggregate([{$match: {_id: {$nin: excludedIds}}}, {$sample: {size: 1}}])
            .toArray();

        if (!candidate) {
            break;
        }

        const deleteResult = await questionPoolCollection.deleteOne({_id: candidate._id});

        if (deleteResult.deletedCount === 1) {
            const {_id, ...questionWithoutId} = candidate;
            drawnQuestions.push(questionWithoutId);
        } else {
            excludedIds.push(candidate._id);
        }
    }

    return drawnQuestions;
}

export {drawQuestionsFromPool};
