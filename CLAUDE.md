# Der Dümmste Fliegt

## Spielprinzip

Ein Echtzeit-Quiz für mehrere Spieler in einem gemeinsamen Raum. Reihum bekommt jeder Spieler
Allgemeinwissensfragen gestellt; wer richtig oder falsch antwortet, ist für alle sichtbar. Nachdem
alle Spieler ihr Soll an Fragen für den Durchgang beantwortet haben, stimmen alle Spieler
gegeneinander ab, wer "der Dümmste" war und ein Herz verlieren soll. Ein Spieler ohne Leben
scheidet aus ("fliegt"); das Spiel läuft in wiederholten Durchgängen aus Fragen und Voting weiter,
bis nur noch zwei Spieler übrig sind. Diese beiden bestreiten ein Finale mit denselben Fragen
gleichzeitig statt abwechselnd, ohne Leben — gewonnen hat, wer davon mehr richtig beantwortet.

## Struktur

Frontend und Backend liegen getrennt und werden auch getrennt gehostet. Das Frontend
(`index.html`, `room.html`, `frontend/`) ist reines statisches HTML/CSS/JavaScript ohne
Build-Schritt oder Framework — je eine Seite pro Ansicht (Lobby, Raum), mit einer eigenen
JavaScript-Datei pro Seite in `frontend/js/`. Das Backend (`server/`) ist ein Node.js-Prozess, der
ausschließlich als Socket.IO-Server läuft: `server.js` verdrahtet die Socket-Events und das
Timer-/Broadcast-Verhalten, `roomManager.js` enthält die eigentliche Spiel- und Raumzustandslogik
(rein, ohne Kenntnis von Sockets), und mehrere `*Repository.js`-Dateien kapseln jeweils den
Zugriff auf eine MongoDB-Collection. Beide Seiten kommunizieren ausschließlich über Socket.IO;
es gibt keine REST-Schnittstelle.

## Projektstatus

- Implementiert: Lobby, Raum erstellen/beitreten, Echtzeit-Spielerliste, Host-Berechtigungen,
  einstellbare Rundenparameter, eine vollständige Runden-Engine (Fragephase, Voting-Phase,
  Stichfrage bei Stimmengleichstand, Finale zwischen den letzten zwei Spielern) sowie ein
  automatisch nachwachsender Fragenpool. Regeln und Ablauf sind direkt an den zuständigen
  Funktionen dokumentiert (v. a. `roomManager.js`, `server.js`), nicht hier.
- Nicht implementiert: Punktevergabe außerhalb des Finales. Bleibt nach einer Voting-Auflösung nur
  noch ein Spieler (oder keiner) übrig, endet das Spiel ohne ermittelten "Sieger" — dieser Fall
  dürfte in der Praxis selten auftreten (z. B. bei einem Unentschieden unter drei Spielern, die
  dadurch gleichzeitig ihr letztes Leben verlieren).

## Architektur

- Echte Mehrseiten-Struktur, kein SPA: `index.html` ist die Lobby-Seite (`frontend/js/main.js`),
  `room.html` die Raum-/späte Spiel-Seite (`frontend/js/room.js`). Navigation zwischen beiden ist
  ein echter Seitenwechsel (`window.location.href`), keine History-API-Simulation.
- Frontend und Backend sind getrennt gehostet: Das Frontend läuft statisch über GitHub Pages,
  `server/server.js` ausschließlich als Socket.IO-Backend über Render. Der Server liefert deshalb
  keine statischen Dateien mehr aus (kein `express.static`, keine `GET /room/:roomCode`-Route) —
  das Docker-Image für Render enthält bewusst nur `server/` (siehe `Dockerfile`/`.dockerignore`).
  Da GitHub Pages kein serverseitiges Routing kennt, liest `readRoomCodeFromUrl()` in `room.js`
  den Raumcode aus dem Query-Parameter `?room=` statt aus dem URL-Pfad; `main.js` navigiert
  entsprechend zu `room.html?room=<roomCode>`. Die Socket.IO-Verbindung
  (`frontend/js/socketClient.js`) zeigt fest codiert auf die Render-URL
  (`https://der-dummste-fliegt.onrender.com`, `SERVER_URL`-Konstante). Der Server erlaubt
  Cross-Origin-Zugriffe nur von den in der Socket.IO-`cors.origin`-Liste in `server.js`
  eingetragenen Origins (`https://bread-005.github.io`, `http://localhost:63342`, hartkodiert),
  mit `methods: ["GET", "POST", "OPTIONS"]` (Socket.IO braucht `POST` für Polling) und
  eingeschränkten `allowedHeaders`. Es gibt keinen Deploy-Workflow mehr: GitHub Pages liefert
  `index.html`, `room.html` und `frontend/` unverändert aus dem Repo-Root nach
  `https://bread-005.github.io/der-dummste-fliegt/` aus. Zum lokalen Testen des Frontends eignet
  sich ein beliebiger statischer Webserver.
- Da ein Seitenwechsel den Socket trennt, hat jeder Spieler eine stabile `idPlayer`
  (`crypto.randomUUID()`, persistiert in `sessionStorage`, siehe `frontend/js/playerIdentity.js`).
  Beim Wechsel Lobby → Raum verbindet sich ein neuer Socket und tritt mit derselben `idPlayer`
  erneut bei (`joinRoom`-Event erkennt das als Rejoin, nicht als neuen Spieler).
- `server/roomManager.js` verzögert das endgültige Entfernen eines getrennten Spielers um
  `DISCONNECT_GRACE_PERIOD_MS` (5000 ms), damit der Raum die kurze Lücke zwischen Disconnect und
  Rejoin übersteht. Ein bewusstes Verlassen läuft über das separate `leaveRoom`-Event ohne
  Gnadenfrist.
- Raumcodes sind vierstellig, uppercase, kollisionsfrei innerhalb der laufenden `Map`.
- Neue Spiellogik sollte als eigenes Modul neben `roomManager.js` entstehen, nicht direkt in
  `server.js`.
- Fragen kommen über eine direkte MongoDB-Anbindung (`server/questionRepository.js`, Treiber
  `mongodb`, Verbindungsdaten ausschließlich über Umgebungsvariablen). `loadQuestions()` lädt beim
  Serverstart einmalig alle Dokumente und cacht sie im Speicher (`getAllQuestions()`); es gibt
  keinen Retry-Mechanismus — schlägt der Verbindungsaufbau fehl, bleibt der Fragenpool für die
  Prozesslebensdauer leer. `insertQuestions()` schreibt neue Fragen sowohl in die
  `questions`-Collection als auch direkt in den In-Memory-Cache, sodass sie ohne Serverneustart in
  künftigen Durchgängen auftauchen können.
- Räume und Spieler werden ausschließlich in-memory gehalten (`roomManager.js`, `Map`) — keine
  Persistenz, bei Server-Neustart (z. B. Render-Redeploy) gehen alle aktiven Räume verloren.
- Der Fragenpool wächst automatisch nach jedem echten Spiel (`replenishQuestionsFromPool()` in
  `questionPool.js`, aufgerufen aus `finalizeGameRecord()` in `roomManager.js`) aus der
  MongoDB-Collection `unreleasedQuestions` in die aktive `questions`-Collection; wie viele Fragen
  das sind (normaler Durchgang vs. reines Sofort-Finale) steht an `finalizeGameRecord()`. Der
  Nachschub selbst wird nicht im laufenden Betrieb befüllt, sondern ausschließlich lokal:
  `server/questionPool.json` (git-/docker-ignoriert) ist eine Staging-Datei, die das ebenfalls
  lokale Skript `server/scripts/addQuestionsLocally.js` per eigenem, im Skript eingetragenem
  Connection-String in `unreleasedQuestions` einspielt und danach wieder leert.
  `plainQuestions.txt` im Repo-Root ist die ursprüngliche Rohtext-Quelle, aus der
  `questionPool.json` geparst wurde. Neue Fragen in `questionPool.json` müssen vorher gegen die
  bereits vorhandenen Fragen in `questions` und `unreleasedQuestions` geprüft werden (abrufbar über
  `https://hobby-projects-api.onrender.com/der-dummste-fliegt/questions` bzw.
  `.../unreleasedQuestions`), um Duplikate im Fragenpool zu vermeiden.
- Runden-Engine lebt direkt in `server/roomManager.js` (Raum-Objekt bekommt ein `game`-Feld mit
  gemischtem Fragenpool, per `shuffleArray()` gewürfelter Zugreihenfolge, aktuellem Index,
  `answeredCounts` je `idPlayer` und einer `phase` ("question" oder "voting")). Die
  Timer-Verwaltung (`setTimeout` pro Raum, `TURN_DURATION_MS`) liegt bewusst in `server.js`, nicht
  in `roomManager.js`, da sie ans Socket.IO-Emitten gekoppelt ist — `roomManager.js` bleibt reine
  Zustandslogik ohne Kenntnis von Sockets/Broadcasts.
- Leben und beantwortete Fragen pro Durchgang liegen pro Raum in `room.settings`
  (`{startingLives, questionsPerPlayerPerRound}`), mit `DEFAULT_STARTING_LIVES = 3` und
  `DEFAULT_QUESTIONS_PER_PLAYER_PER_ROUND = 2` als Startwerte. `advanceTurn()` erhöht beim
  Zugwechsel zuerst `answeredCounts[idPlayer]`; haben danach alle Spieler die geforderte Anzahl
  erreicht, wird `room.game.phase = "voting"` gesetzt und `{phase: "voting"}` statt eines neuen
  Zugs zurückgegeben — `handleTurnResult()` in `server.js` unterscheidet danach `turnStarted`
  (inkl. `scheduleTurnTimeout()`) oder `startVotingPhase()`. `indexQuestion` wird in jedem Fall um
  eins erhöht; `shuffledQuestions` wird nur neu gemischt, wenn dieser Zähler das Ende des Pools
  erreicht — ein Durchgangswechsel allein löst kein Neumischen aus. `lives` steht in
  `toPublicPlayers()`/`getPublicPlayers()` bereit und wird bei jedem `startGame()` auf
  `room.settings.startingLives` zurückgesetzt (nicht bei `startNextRound()`).
- Der Host kann `startingLives`, `questionsPerPlayerPerRound` und `votingDurationMs` direkt im
  Warteraum einstellen: Auf `room.html` sitzt oberhalb des "Spiel starten"-Buttons ein
  `#settingsSection`-Block mit einem 3-Spalten-Raster (`#settingsGrid`), mit "Start-Herzen"
  (`#settingStartingLives`), "Fragen pro Spieler pro Runde" (`#settingQuestionsPerPlayerPerRound`)
  und "Abstimmungszeit (Sek.)" (`#settingVotingDuration`), jede mit +/- Stepper. Die
  Abstimmungszeit betrifft nur die normale Voting-Phase — Finale und Stichfrage-Abstimmung
  (`TIEBREAK_VOTING_DURATION_MS`) bleiben fest codiert. Die +/- Buttons blendet
  `renderStartingLivesSetting()`/`renderQuestionsPerPlayerPerRoundSetting()`/
  `renderVotingDurationSetting()` in `room.js` per `.hidden` nur für den Host ein; zusätzlich
  bleiben sie `disabled`, sobald ein Spiel läuft oder der Min-/Max-Wert erreicht ist
  (`MIN_/MAX_STARTING_LIVES = 1/5`, `MIN_/MAX_QUESTIONS_PER_PLAYER_PER_ROUND = 1/5`,
  `MIN_/MAX_VOTING_DURATION_MS = 10000/120000` in Schritten von `VOTING_DURATION_STEP_MS = 5000`,
  serverseitig dieselben Grenzen in `roomManager.js`). Ein Klick sendet `updateRoomSettings` mit
  genau einem der drei Felder an den Server; die jeweilige `update*()`-Funktion in
  `roomManager.js` prüft serverseitig, dass der Absender Host ist (`isRoomHost()`) und kein Spiel
  läuft (`!room.game`), klemmt den Wert auf die erlaubte Spanne und schreibt ihn in
  `room.settings`. Bei Erfolg broadcastet `server.js` das komplette `settings`-Objekt per
  `roomSettingsUpdated`; `room.js` übernimmt es in Modul-Variablen und rendert neu. Neue
  (`createRoom()`) wie beitretende (`joinRoom()`) Räume bekommen `room.settings` zusätzlich im
  `roomJoined`-Event mitgeschickt. `startVotingPhase()` liest `votingDurationMs` bei jedem Start
  frisch aus `getRoomSettings(roomCode)` statt einer festen Konstante.
- Voting-Logik lebt ebenfalls in `roomManager.js`: `room.game.votes` (idVoter → idVotedFor) und
  `room.game.answersGiven` (idPlayer → Array aus `{questionText, answerGiven, correctAnswer,
  isCorrect}`) werden bei `startGame()`/`startNextRound()` geleert. `recordCurrentAnswer()`
  vergleicht die Antwort per `normalizeAnswerText()` (trim + lowercase) mit der richtigen Antwort
  und schreibt `isCorrect` in den `answersGiven`-Eintrag **vor** `advanceTurn()`; die
  `answerRevealed`-Rückgabe trägt `isCorrect`/`questionText` mit, damit der Client Antwort-Punkte
  schon während der Fragerunde grün einfärben kann. `hasAnsweredAllCorrectlyThisRound()` prüft
  anhand von `answersGiven`, ob ein Spieler ausschließlich richtig geantwortet hat. Sowohl
  `turnStarted` als auch `answerRevealed` tragen deshalb ein `answersByPlayer`-Feld
  (`getAnswersGivenThisRound()`) mit; `room.js` übernimmt es 1:1 als `answersByPlayerThisRound`,
  statt selbst Buch zu führen — eine frühere, rein client-seitige Version leerte die Historie bei
  jedem `turnStarted` versehentlich komplett statt nur beim ersten Zug eines Durchgangs, und ging
  bei einem Reload ganz verloren. `applyGameStateOnRejoin()` wendet das zuletzt gespeicherte
  `gameState` erneut an, sodass die Punkte auch nach einem Reload korrekt bleiben. Zusätzlich
  rendert `renderPlayers()` die Punktezahl als `Math.max(player.answeredCount,
  answerHistory.length)`, da das `turnStarted`-Event den aktualisierten Zähler erst für den
  *nächsten* Zug mitträgt — ohne dieses `Math.max()` würde der soeben beantwortete Punkt während
  der Reveal-Phase kurz verschwinden. `submitVote()` akzeptiert nur einen Vote pro Spieler, nur in
  der Voting-Phase, nur für/von lebende Spieler, und lehnt Stimmen auf einen immunen Spieler ab;
  `haveAllPlayersVoted()` prüft, ob alle lebenden Spieler gevotet haben — `server.js` löst dann
  sofort per `finishVoting()` auf. `resolveVotingPhase()` ergänzt fehlende Votes als Selbst-Votes
  (Stimmen auf einen immunen Spieler zählen nicht mit) und ermittelt die Spitzengruppe. Sind das
  genau zwei, gibt die Funktion `{type: "tiebreak", idPlayers}` zurück; sonst sofort
  `{type: "resolved", ...}` mit den Leben-Verlierern (nie unter 0). `finalizeVotingResolution()`
  in `server.js` bündelt das gemeinsame Auflösen für beide Fälle. `startNextRound()` würfelt
  `playerOrder` neu, setzt `answeredCounts`/`answersGiven`/`votes` zurück und schaltet `phase`
  wieder auf `"question"`, lässt aber den laufenden Fragenpool unangetastet weiterlaufen.
- Zustände in der Spielerliste werden rein per CSS-Klasse markiert statt über Text: grüner/grauer
  Antwort-Punkt (`.correctAnswerDot`, mit Hover-Tooltip über `data-tooltip` statt nativem `title`,
  dessen Anzeigeverhalten unzuverlässig war), goldene Umrandung (`.currentTurn`) für den
  aktuellen Zug, grün (`.votedByMe`) für die eigene abgegebene Stimme, `.immuneFromVoting` für
  Spieler, die in diesem Durchgang bzw. dieser Stichfrage nicht gevotet werden können, sowie
  `.tiebreakCandidate`/`.tiebreakParticipant` für die beiden Stichfrage-Kandidaten.
- `isPlayerAlive()` (`player.lives > 0`) entscheidet, wer noch teilnimmt: `getCurrentTurn()`
  überspringt tote Spieler bei der Zugvergabe, `advanceTurn()` fordert Pflichtfragen nur von
  lebenden Spielern ein, `submitVote()`/`haveAllPlayersVoted()`/`resolveVotingPhase()` beziehen
  tote Spieler weder als Wähler noch als Ziel ein. Client-seitig teilt `renderPlayerLists()` in
  `room.js` `currentPlayers` anhand von `lives > 0` in die normale Spielerliste und die Box
  `#deadPlayersBox` ("Tote Spieler", nur Namen) auf.
- `toPublicPlayers()` nimmt das ganze Raum-Objekt entgegen (nicht nur Spielerliste + Host-Id),
  damit `lives` und `answeredCount` (aus `room.game.answeredCounts`) mit reingerechnet werden.
  `turnStarted` und `votingStarted` tragen deshalb die aktuelle Spielerliste inklusive dieser
  Felder mit, ohne auf ein separates `playersUpdated`-Event zu warten.
- Zugwechsel läuft über zwei Pfade, die beide in `revealAnswerAndAdvance()` (`server.js`) münden:
  (1) `submitAnswer`-Event des dran befindlichen Spielers (per `idSocket` über
  `isCurrentPlayerSocket()` verifiziert), (2) serverseitiger Timeout nach 30 Sekunden ("(keine
  Antwort)"). Beide Pfade zeigen erst 5 Sekunden die Antwort + korrekte Antwort
  (`answerRevealed`, `REVEAL_DURATION_MS`), bevor `advanceTurn()` den nächsten Zug startet.
- Die Zeitleiste wird nicht rein clientseitig animiert; der Server schickt einen
  `turnStartedAt`-Zeitstempel (`Date.now()`) mit. Grund: Der clientseitige Reflow-Trick zum
  Neustarten einer CSS-Transition hängt von einem Browser-Paint ab, das bei Hintergrund-Tabs
  verzögert wird — die Leiste schien dort zu warten und startete beim Zurückwechseln fälschlich
  neu. `restartTimerBar()` berechnet beim Empfang die verstrichene Zeit
  (`Date.now() - startedAt`) und setzt die Leiste direkt auf den korrekten Rest-Prozentsatz.
  Voraussetzung: Server- und Client-Uhr laufen synchron. Der Zeitstempel behebt aber nur die
  Client-Drift, nicht das Einfrieren innerhalb eines Hintergrund-Tabs selbst: `room.js` merkt sich
  deshalb in `activeTimer` (`{durationMs, startedAt}`) den zuletzt gestarteten Abschnitt und
  registriert `visibilitychange` → `resyncTimerBarToNow()`, das beim Sichtbarwerden erneut
  `restartTimerBar()` mit den gemerkten Werten aufruft. `stopTimerBar()` und der
  `gameStopped`-Handler setzen `activeTimer = null`.
- Verlässt ein Spieler mitten im Spiel den Raum, überspringt `getCurrentTurn()` automatisch dessen
  Position in der Zugreihenfolge.
- Ein Disconnect (Reload, Tab-Schließen) stoppt die laufende Runde nicht sofort:
  `socket.on("disconnect", ...)` ruft `stopGameIfActive()` erst aus dem `onRemoved`-Callback von
  `scheduleRemovalOnDisconnect()` auf, also erst nach Ablauf der `DISCONNECT_GRACE_PERIOD_MS` ohne
  Rejoin. Damit ein zurückkehrender Client nicht im leeren Warteraum landet, merkt sich
  `server.js` in `gameDisplayStates` (`roomCode → zuletzt gesendetes Event`) das jeweils letzte
  `turnStarted`-, `answerRevealed`-, `votingStarted`-, `votingResolved`-, `finaleStarted`-,
  `finaleAnswerRevealed`- oder `finaleResolved`-Payload pro Raum und hängt es als `gameState` an
  `roomJoined` an. `room.js` extrahiert die sieben Payload-Anwendungen in eigene Funktionen
  (`applyTurnStarted()`, `applyAnswerRevealed()`, `applyVotingStarted()`, `applyVotingResolved()`,
  `applyFinaleStarted()`, `applyFinaleAnswerRevealed()`, `applyFinaleResolved()`), die sowohl von
  laufenden Events als auch von `applyGameStateOnRejoin()` aufgerufen werden.
- Weder ein bewusstes Verlassen noch ein endgültiger Disconnect stoppt die laufende Runde für die
  übrigen Spieler — der Spieler wird nur aus `room.players` entfernt. `removePlayerFromRoom()`
  gibt dafür ein `removalEffect` (`{wasCurrentQuestionTurn, phaseAtRemoval}`) zurück, das bis zu
  `handlePlayerRemovedDuringGame()` in `server.js` durchgereicht wird. War der entfernte Spieler
  gerade dran (letztes Display-State war `turnStarted`), springt `resyncQuestionTurn()` sofort
  weiter statt den sinnlosen Timeout abzuwarten — bewusst von `advanceTurn()` getrennt: Es zählt
  keinen `answeredCounts`-Eintrag, prüft aber dieselbe `hasEveryPlayerAnsweredEnough()`-Bedingung.
  War der Spieler mitten in der Voting-Phase und hatten dadurch bereits alle übrigen gevotet, wird
  `finishVoting()` sofort ausgelöst; `removePlayerFromRoom()` löscht zuvor dessen eigenen Vote
  sowie alle Stimmen auf ihn. Ein Entfernen während der Reveal-Phase oder laufender
  Voting-Auflösung wird bewusst *nicht* sofort resynct — der laufende Timeout macht von selbst
  weiter. Dafür nimmt `advanceTurn()` die `idFinishedPlayer` explizit als Parameter entgegen
  (übergeben von `revealAnswerAndAdvance()`), statt sie erneut über `getCurrentTurn()` zu
  bestimmen — sonst hätte ein Disconnect während der Reveal-Phase den *nächsten* statt des
  tatsächlich antwortenden Spielers den Fortschritt gutschreiben lassen. `stopGameIfActive()`
  bleibt nur als Notfall-Rückfallebene, falls `resyncQuestionTurn()` niemanden mehr findet.
- Sowohl `main.js` als auch `room.js` blenden bei einem Socket-`disconnect` wieder den
  `connectingScreen` ein (z. B. bei einem Render-Neustart). In `room.js` wird `joinRoom` dafür im
  `connect`-Handler ausgelöst statt nur einmalig, damit ein automatischer Reconnect den
  Raum-Beitritt eigenständig wiederholt.
- Verlässt der Host den Raum, erhält automatisch ein verbleibender Spieler die Krone:
  `removePlayerFromRoom()` setzt `room.idHost = room.players[0].idPlayer`. Das ist der einzige Ort,
  an dem Spieler aus `room.players` entfernt werden (deckt `leaveRoom()` und
  `scheduleRemovalOnDisconnect()` ab). Welcher Spieler die neue Krone bekommt, ist beliebig
  (erster Eintrag im Array), keine Priorisierung.
- `MINIMUM_PLAYERS_TO_START` liegt bei 2, nicht bei 3 — ein Raum mit genau zwei Spielern kann
  direkt starten. In diesem Fall überspringt `startGame()` den normalen Fragedurchgang komplett
  und ruft nach dem Leben-Reset sofort `startFinale()` auf; der Rückgabewert trägt schon
  `phase: "finale"`. `handleTurnResult()` erkennt diesen dritten Fall (neben `"voting"` und dem
  impliziten Frage-Fall) und reicht ihn an `handleFinaleAdvanceResult()` durch — clientseitig
  ändert sich dadurch nichts.
- In `style.css` müssen Container, die per `element.hidden = true`/`false` ein-/ausgeblendet
  werden (`#answerReveal`, `#votingResult`, `#finaleReveal`, `#finaleResult` usw.), ihre
  `display`-Deklaration mit `:not([hidden])` scopen (siehe `#answerInputRow:not([hidden])`). Eine
  ID-Regel wie `#finaleReveal { display: flex; }` ohne dieses Scoping gewinnt sonst gegenüber der
  `[hidden] { display: none; }`-Regel des User-Agent-Stylesheets, wodurch das Element trotz
  `hidden`-Attribut sichtbar bleibt.
