import {readLoggedInName, clearLoggedInUser} from "./loginState.js";

const LOGIN_PAGE_URL = "https://bread-005.github.io/login-page/index.html";

/**
 * Shows the logged-in user's name and a logout button in the top-right corner of the page when
 * a "login-page" localStorage session exists. Intended for use on index.html only.
 */
function renderLoginStatus() {
    const loggedInName = readLoggedInName();
    const sectionLoginStatus = document.getElementById("loginStatus");
    const textLoggedInName = document.getElementById("textLoggedInName");
    const buttonCreateQuestions = document.getElementById("buttonCreateQuestions");

    if (!loggedInName) {
        sectionLoginStatus.hidden = true;
        buttonCreateQuestions.hidden = true;
        return;
    }

    textLoggedInName.textContent = `Dein Name: ${loggedInName}`;
    sectionLoginStatus.hidden = false;
    buttonCreateQuestions.hidden = false;
}

document.getElementById("buttonLogout").addEventListener("click", () => {
    clearLoggedInUser();
    window.location.href = LOGIN_PAGE_URL;
});

document.getElementById("buttonCreateQuestions").addEventListener("click", () => {
    window.location.href = "createQuestion.html";
});

renderLoginStatus();
