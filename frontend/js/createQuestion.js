import {connectToServer} from "./socketClient.js";

const socket = connectToServer();

const inputQuestionText = document.getElementById("inputQuestionText");
const inputDifficulty = document.getElementById("inputDifficulty");
const listCorrectAnswers = document.getElementById("listCorrectAnswers");
const textCreateQuestionMessage = document.getElementById("textCreateQuestionMessage");
const buttonBackToLobby = document.getElementById("buttonBackToLobby");
const buttonSubmitQuestion = document.getElementById("buttonSubmitQuestion");
const buttonAddAnswer = document.getElementById("buttonAddAnswer");

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

buttonAddAnswer.addEventListener("click", () => {
    addAnswerRow();
});

buttonBackToLobby.addEventListener("click", () => {
    window.location.href = "index.html";
});

buttonSubmitQuestion.addEventListener("click", () => {
    const questionText = inputQuestionText.value.trim();
    const correctAnswers = readCorrectAnswers();
    const difficulty = Number(inputDifficulty.value);

    if (questionText === "" || correctAnswers.length === 0) {
        textCreateQuestionMessage.textContent = "Frage und mindestens eine richtige Antwort dürfen nicht leer sein.";
        return;
    }

    socket.emit("submitQuestion", {questionText, correctAnswers, difficulty});
});

socket.on("questionSubmitted", () => {
    textCreateQuestionMessage.textContent = "Frage wurde eingereicht!";
    inputQuestionText.value = "";
    inputDifficulty.value = "5";
    resetAnswerRows();
});

socket.on("errorMessage", ({message}) => {
    textCreateQuestionMessage.textContent = message;
});

addAnswerRow();
