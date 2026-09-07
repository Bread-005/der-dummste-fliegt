// TODO: Nach dem ersten Render-Deploy die tatsächliche Service-URL eintragen.
const SERVER_URL = "https://REPLACE_WITH_RENDER_URL.onrender.com";

/**
 * Establishes the Socket.IO connection to the game server.
 * @returns {import("socket.io-client").Socket} The connected socket instance.
 */
function connectToServer() {
    return io(SERVER_URL);
}

export {connectToServer};
