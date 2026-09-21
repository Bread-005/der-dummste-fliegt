import {readLoggedInName, clearLoggedInUser} from "./loginState.js";

const LOGIN_PAGE_URL = "https://bread-005.github.io/login-page/index.html";

/**
 * Shows either the logged-in user's name with a logout button, or an "Anmelden" button leading
 * to the login-page project, in the top-right corner of the page. Intended for use on
 * index.html only.
 */
function renderLoginStatus() {
    const loggedInName = readLoggedInName();
    const sectionLoginStatus = document.getElementById("loginStatus");
    const textLoggedInName = document.getElementById("textLoggedInName");
    const buttonCreateQuestions = document.getElementById("buttonCreateQuestions");
    const buttonLogin = document.getElementById("buttonLogin");
    const inputPlayerName = document.getElementById("inputPlayerName");

    if (!loggedInName) {
        sectionLoginStatus.hidden = true;
        buttonCreateQuestions.hidden = true;
        buttonLogin.hidden = false;
        inputPlayerName.hidden = false;
        return;
    }

    textLoggedInName.textContent = `Dein Name: ${loggedInName}`;
    sectionLoginStatus.hidden = false;
    buttonCreateQuestions.hidden = false;
    buttonLogin.hidden = true;
    inputPlayerName.hidden = true;
}

document.getElementById("buttonLogout").addEventListener("click", () => {
    clearLoggedInUser();
    window.location.href = LOGIN_PAGE_URL;
});

document.getElementById("buttonCreateQuestions").addEventListener("click", () => {
    window.location.href = "createQuestion.html";
});

document.getElementById("buttonLogin").addEventListener("click", () => {
    window.location.href = LOGIN_PAGE_URL;
});

renderLoginStatus();
