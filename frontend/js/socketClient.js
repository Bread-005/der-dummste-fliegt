const SERVER_URL = "https://der-dummste-fliegt.onrender.com";

/**
 * Establishes the Socket.IO connection to the game server.
 * @returns {import("socket.io-client").Socket} The connected socket instance.
 */
function connectToServer() {
    return io(SERVER_URL);
}

export {connectToServer};
