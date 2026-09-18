import {connectToServer} from "./socketClient.js";

const socket = connectToServer();

const inputQuestionText = document.getElementById("inputQuestionText");
const inputCorrectAnswer = document.getElementById("inputCorrectAnswer");
const inputDifficulty = document.getElementById("inputDifficulty");
const textCreateQuestionMessage = document.getElementById("textCreateQuestionMessage");
const buttonBackToLobby = document.getElementById("buttonBackToLobby");
const buttonSubmitQuestion = document.getElementById("buttonSubmitQuestion");

buttonBackToLobby.addEventListener("click", () => {
    window.location.href = "index.html";
});

buttonSubmitQuestion.addEventListener("click", () => {
    const questionText = inputQuestionText.value.trim();
    const correctAnswer = inputCorrectAnswer.value.trim();
    const difficulty = Number(inputDifficulty.value);

    if (questionText === "" || correctAnswer === "") {
        textCreateQuestionMessage.textContent = "Frage und richtige Antwort dürfen nicht leer sein.";
        return;
    }

    socket.emit("submitQuestion", {questionText, correctAnswer, difficulty});
});

socket.on("questionSubmitted", () => {
    textCreateQuestionMessage.textContent = "Frage wurde eingereicht!";
    inputQuestionText.value = "";
    inputCorrectAnswer.value = "";
    inputDifficulty.value = "5";
});

socket.on("errorMessage", ({message}) => {
    textCreateQuestionMessage.textContent = message;
});
