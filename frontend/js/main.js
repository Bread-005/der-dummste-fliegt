import {connectToServer} from "./socketClient.js";
import {getOrCreatePlayerId} from "./playerIdentity.js";

const connectingScreen = document.getElementById("connectingScreen");
const inputPlayerName = document.getElementById("inputPlayerName");
const inputRoomCode = document.getElementById("inputRoomCode");
const buttonCreateRoom = document.getElementById("buttonCreateRoom");
const buttonJoinRoom = document.getElementById("buttonJoinRoom");

const idPlayer = getOrCreatePlayerId();
const socket = connectToServer();

socket.on("connect", () => {
    connectingScreen.hidden = true;
});

socket.on("disconnect", () => {
    connectingScreen.hidden = false;
});

/**
 * Reads the room code from the "room" query parameter (e.g. "index.html?room=<roomCode>"), so an
 * invite link can prefill the room code field instead of requiring it to be typed in manually.
 * @returns {string|null} The room code from the URL, or null if not present.
 */
function readRoomCodeFromUrl() {
    const roomCode = new URLSearchParams(location.search).get("room");
    return roomCode ? roomCode.toUpperCase() : null;
}

const roomCodeFromUrl = readRoomCodeFromUrl();

if (roomCodeFromUrl) {
    inputRoomCode.value = roomCodeFromUrl;
    inputRoomCode.hidden = true;
    buttonCreateRoom.hidden = true;
    inputPlayerName.focus();

    inputPlayerName.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            buttonJoinRoom.click();
        }
    });
}

buttonCreateRoom.addEventListener("click", () => {
    const playerName = inputPlayerName.value.trim();

    if (playerName === "") {
        return;
    }

    sessionStorage.setItem("playerName", playerName);
    socket.emit("createRoom", {playerName, idPlayer});
});

buttonJoinRoom.addEventListener("click", () => {
    const playerName = inputPlayerName.value.trim();
    const roomCode = inputRoomCode.value.trim().toUpperCase();

    if (playerName === "" || roomCode === "") {
        return;
    }

    sessionStorage.setItem("playerName", playerName);
    socket.emit("joinRoom", {playerName, roomCode, idPlayer});
});

socket.on("roomJoined", ({roomCode}) => {
    window.location.href = `room.html?room=${roomCode}`;
});

socket.on("errorMessage", ({message}) => {
    alert(message);
});
