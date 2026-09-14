import {drawQuestionsFromPool} from "./questionPoolRepository.js";
import {insertQuestions} from "./questionRepository.js";

const QUESTIONS_TO_ADD_PER_GAME = 10;

/**
 * Moves up to `QUESTIONS_TO_ADD_PER_GAME` random questions from the "unreleasedQuestions" collection
 * into the "questions" collection, called once after every non-test game ends. The pool's `difficulty`
 * field is stripped before insertion, since it only guides curation of the pool and is not part of
 * the "questions" schema used during gameplay. Does nothing if the pool is empty.
 * @returns {Promise<void>}
 */
async function replenishQuestionsFromPool() {
    const drawnQuestions = await drawQuestionsFromPool(QUESTIONS_TO_ADD_PER_GAME);
    const questionsToAdd = drawnQuestions.map(({difficulty, ...question}) => question);

    await insertQuestions(questionsToAdd);
}

export {replenishQuestionsFromPool};
