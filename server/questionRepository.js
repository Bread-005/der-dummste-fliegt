const QUESTIONS_API_URL = "https://hobby-projects-api.onrender.com/questions";
const QUESTIONS_RETRY_DELAY_MS = 30000;

let questions = [];

/**
 * Loads all questions from the external questions API and caches them in memory for the
 * lifetime of the server process.
 * @returns {Promise<void>}
 */
async function loadQuestions() {
    const response = await fetch(QUESTIONS_API_URL);

    if (!response.ok) {
        throw new Error(`Fragen-API antwortete mit Status ${response.status}`);
    }

    questions = await response.json();
}

/**
 * Loads all questions, retrying with a fixed delay until it succeeds. Used at server start so a
 * transient failure (e.g. the external API being rate-limited or cold-starting) does not leave
 * the question pool empty for the rest of the server's lifetime.
 * @returns {Promise<void>}
 */
async function loadQuestionsWithRetry() {
    while (true) {
        try {
            await loadQuestions();
            return;
        } catch (error) {
            console.error("Fragen konnten nicht geladen werden:", error.message);
            await new Promise((resolve) => setTimeout(resolve, QUESTIONS_RETRY_DELAY_MS));
        }
    }
}

/**
 * Returns a copy of all cached questions.
 * @returns {Array<{_id: string, text: string, answer: string, createdAt: string}>} All cached questions.
 */
function getAllQuestions() {
    return [...questions];
}

export {loadQuestions, loadQuestionsWithRetry, getAllQuestions};
