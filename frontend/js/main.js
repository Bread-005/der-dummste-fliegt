import {connectToServer} from "./socketClient.js";
import {getOrCreatePlayerId} from "./playerIdentity.js";

const inputPlayerName = document.getElementById("inputPlayerName");
const inputRoomCode = document.getElementById("inputRoomCode");
const buttonCreateRoom = document.getElementById("buttonCreateRoom");
const buttonJoinRoom = document.getElementById("buttonJoinRoom");

const idPlayer = getOrCreatePlayerId();
const socket = connectToServer();

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
