const QUESTIONS_API_URL = "https://hobby-projects-api.onrender.com/questions";

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
 * Returns a copy of all cached questions.
 * @returns {Array<{_id: string, text: string, answer: string, createdAt: string}>} All cached questions.
 */
function getAllQuestions() {
    return [...questions];
}

export {loadQuestions, getAllQuestions};
