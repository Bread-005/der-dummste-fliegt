import {drawQuestionsFromPool} from "./questionPoolRepository.js";
import {insertQuestions} from "./questionRepository.js";

const QUESTIONS_TO_ADD_PER_GAME = 10;
const QUESTIONS_TO_ADD_PER_INSTANT_FINALE_GAME = 1;

/**
 * Moves up to `count` random questions from the "unreleasedQuestions" collection into the
 * "questions" collection, called once after every non-test game ends. Does nothing if the pool is
 * empty.
 * @param {number} count - The maximum number of questions to move.
 * @returns {Promise<void>}
 */
async function replenishQuestionsFromPool(count) {
    const drawnQuestions = await drawQuestionsFromPool(count);

    await insertQuestions(drawnQuestions);
}

export {replenishQuestionsFromPool, QUESTIONS_TO_ADD_PER_GAME, QUESTIONS_TO_ADD_PER_INSTANT_FINALE_GAME};
