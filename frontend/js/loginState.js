const LOGIN_PAGE_STORAGE_KEY = "login-page";

export {LOGIN_PAGE_STORAGE_KEY, readLoggedInName, clearLoggedInUser};

/**
 * Reads the logged-in user's name from the shared "login-page" localStorage entry written by
 * the separate login-page project (same GitHub Pages origin, different path).
 * @returns {string} The logged-in user's name, or an empty string if not logged in or the
 * stored value is missing/invalid.
 */
function readLoggedInName() {
    const rawStoredUser = localStorage.getItem(LOGIN_PAGE_STORAGE_KEY);

    if (!rawStoredUser) {
        return "";
    }

    try {
        const storedUser = JSON.parse(rawStoredUser);
        return storedUser.name || "";
    } catch {
        return "";
    }
}

/**
 * Clears the shared "login-page" localStorage entry, logging the user out for both this
 * project and the login-page project.
 */
function clearLoggedInUser() {
    localStorage.setItem(LOGIN_PAGE_STORAGE_KEY, JSON.stringify({name: "", token: "", message: ""}));
}
