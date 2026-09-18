const LOGIN_PAGE_STORAGE_KEY = "login-page";

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

/**
 * Shows the logged-in user's name and a logout button in the top-right corner of the page when
 * a "login-page" localStorage session exists. Intended for use on index.html only.
 */
function renderLoginStatus() {
    const loggedInName = readLoggedInName();
    const sectionLoginStatus = document.getElementById("loginStatus");
    const textLoggedInName = document.getElementById("textLoggedInName");

    if (!loggedInName) {
        sectionLoginStatus.hidden = true;
        return;
    }

    textLoggedInName.textContent = `Dein Name: ${loggedInName}`;
    sectionLoginStatus.hidden = false;
}

document.getElementById("buttonLogout").addEventListener("click", () => {
    clearLoggedInUser();
    renderLoginStatus();
});

renderLoginStatus();
