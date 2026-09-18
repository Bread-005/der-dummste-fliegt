import {connectToServer} from "./socketClient.js";
import {readLoggedInName} from "./loginState.js";

const socket = connectToServer();
const playerName = readLoggedInName();

const inputQuestionText = document.getElementById("inputQuestionText");
const inputDifficulty = document.getElementById("inputDifficulty");
const listCorrectAnswers = document.getElementById("listCorrectAnswers");
const textCreateQuestionMessage = document.getElementById("textCreateQuestionMessage");
const buttonBackToLobby = document.getElementById("buttonBackToLobby");
const buttonSubmitQuestion = document.getElementById("buttonSubmitQuestion");
const buttonAddAnswer = document.getElementById("buttonAddAnswer");

let remainingAllowance = 0;

/**
 * Adds a new correct-answer input row (a minus button next to a text input) to
 * `listCorrectAnswers`.
 */
function addAnswerRow() {
    const answerRow = document.createElement("div");
    answerRow.className = "answerRow";

    const buttonRemoveAnswer = document.createElement("button");
    buttonRemoveAnswer.type = "button";
    buttonRemoveAnswer.className = "buttonRemoveAnswer";
    buttonRemoveAnswer.textContent = "−";
    buttonRemoveAnswer.addEventListener("click", () => {
        answerRow.remove();
        updateRemoveAnswerButtonsState();
    });

    const inputAnswer = document.createElement("input");
    inputAnswer.type = "text";
    inputAnswer.maxLength = 100;
    inputAnswer.className = "inputCorrectAnswer";

    answerRow.append(buttonRemoveAnswer, inputAnswer);
    listCorrectAnswers.append(answerRow);
    updateRemoveAnswerButtonsState();
}

/**
 * Disables every minus button while only one correct-answer row is left, so at least one
 * correct answer always stays on the form.
 */
function updateRemoveAnswerButtonsState() {
    const answerRows = listCorrectAnswers.querySelectorAll(".answerRow");

    answerRows.forEach((answerRow) => {
        answerRow.querySelector(".buttonRemoveAnswer").disabled = answerRows.length <= 1;
    });
}

/**
 * Reads the trimmed, non-empty values out of all correct-answer input rows.
 * @returns {string[]} The entered correct answers.
 */
function readCorrectAnswers() {
    return [...listCorrectAnswers.querySelectorAll(".inputCorrectAnswer")]
        .map((inputAnswer) => inputAnswer.value.trim())
        .filter((answer) => answer !== "");
}

/**
 * Removes every correct-answer row and adds a single empty one back.
 */
function resetAnswerRows() {
    listCorrectAnswers.replaceChildren();
    addAnswerRow();
}

/**
 * Reflects how many more custom questions the player may still submit on the submit button: red
 * and clickable while an allowance is left, gray with a "no entry" cursor once it is used up. The
 * tooltip always shows the current games-played/questions-created counts, on hover in either state.
 * @param {{gamesPlayed: number, questionsCreated: number, remainingAllowance: number}} eligibility -
 *   The player's current question-creation eligibility, as sent by the server.
 */
function applyEligibility(eligibility) {
    remainingAllowance = eligibility.remainingAllowance;
    buttonSubmitQuestion.classList.toggle("buttonSubmitQuestionDisabled", remainingAllowance <= 0);
    buttonSubmitQuestion.dataset.tooltip =
        `Gespielte Spiele: ${eligibility.gamesPlayed}\nErstellte Fragen: ${eligibility.questionsCreated}`;
}

buttonAddAnswer.addEventListener("click", () => {
    addAnswerRow();
});

buttonBackToLobby.addEventListener("click", () => {
    window.location.href = "index.html";
});

buttonSubmitQuestion.addEventListener("click", () => {
    if (remainingAllowance <= 0) {
        return;
    }

    const questionText = inputQuestionText.value.trim();
    const correctAnswers = readCorrectAnswers();
    const difficulty = Number(inputDifficulty.value);

    if (questionText === "" || correctAnswers.length === 0) {
        textCreateQuestionMessage.textContent = "Frage und mindestens eine richtige Antwort dürfen nicht leer sein.";
        return;
    }

    socket.emit("submitQuestion", {playerName, questionText, correctAnswers, difficulty});
});

socket.on("questionSubmitted", () => {
    textCreateQuestionMessage.textContent = "Frage wurde eingereicht!";
    inputQuestionText.value = "";
    inputDifficulty.value = "5";
    resetAnswerRows();
});

socket.on("questionCreationEligibility", (eligibility) => {
    applyEligibility(eligibility);
});

socket.on("errorMessage", ({message}) => {
    textCreateQuestionMessage.textContent = message;
});

socket.on("connect", () => {
    socket.emit("checkQuestionCreationEligibility", {playerName});
});

addAnswerRow();
