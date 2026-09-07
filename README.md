# Der Dümmste Fliegt

Online-Version des Partyspiels "Der Dümmste fliegt". Spieler treten über einen Raumcode einem
gemeinsamen Spiel bei, das über WebSockets (Socket.IO) in Echtzeit synchronisiert wird.

## Projektstruktur

```
├── public/            Statische Einstiegsseite (index.html)
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

Gehostet über [Render](https://render.com). Build-Befehl `npm install`, Start-Befehl `npm start`.
Die Umgebungsvariable `PORT` wird von Render automatisch gesetzt.
