# Der Dümmste Fliegt

Online-Version des Partyspiels "Der Dümmste fliegt". Spieler treten über einen Raumcode einem
gemeinsamen Spiel bei, das über WebSockets (Socket.IO) in Echtzeit synchronisiert wird.

## Projektstruktur

```
├── index.html          Lobby-Seite
├── room.html           Raum-/Spiel-Seite
├── frontend/
│   ├── css/           Stylesheets
│   └── js/            Client-seitige Logik
├── server/
│   ├── server.js       Express- und Socket.IO-Server
│   └── roomManager.js  Raum- und Spielerverwaltung
├── package.json
└── README.md
```

## Lokale Entwicklung

Alle Befehle werden im Docker-Container ausgeführt, nicht direkt auf dem Host.

```bash
npm install
npm start
```

Der Server läuft anschließend standardmäßig auf Port 3000.

## Deployment

Gehostet über [Render](https://render.com), aber ohne automatisches Deploy aus GitHub. Render
zieht stattdessen das Docker-Image `bread005/der-dummste-fliegt:latest` von Docker Hub. Um eine
Änderung live zu bringen, muss nach jedem Code-Änderung an `server/` das Image manuell neu gebaut
und gepusht werden:

```bash
docker buildx build --platform linux/amd64 -t bread005/der-dummste-fliegt:latest --push .
```

Anschließend muss auf Render ein manuelles Redeploy ausgelöst werden, damit das neue Image gezogen
wird. Die Umgebungsvariable `PORT` wird von Render automatisch gesetzt.
