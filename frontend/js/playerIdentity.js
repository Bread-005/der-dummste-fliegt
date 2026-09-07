/**
 * Returns the persistent player id for the current browser tab, creating one on first use.
 * The id survives page navigations within the tab (via sessionStorage) so a player can be
 * recognized as the same person after moving from the lobby page to the room page.
 * @returns {string} The player's persistent id.
 */
function getOrCreatePlayerId() {
    let idPlayer = sessionStorage.getItem("idPlayer");

    if (!idPlayer) {
        idPlayer = crypto.randomUUID();
        sessionStorage.setItem("idPlayer", idPlayer);
    }

    return idPlayer;
}

export {getOrCreatePlayerId};
