# Der Dümmste Fliegt

## Projektstatus

- Implementiert: Lobby-Screen, Raum erstellen/beitreten, Echtzeit-Spielerliste über Socket.IO,
  Host-Kennzeichnung (Krone), sowie eine Runden-Engine: Host startet das Spiel, Fragen werden
  einmalig gemischt, die Zugreihenfolge der Spieler wird pro Spielstart neu zufällig gewürfelt,
  30-Sekunden-Timer pro Zug (serverseitig maßgeblich, Client zeigt nur die visuelle Zeitleiste,
  die während der 5-sekündigen Antwort-Reveal-Phase eingefroren wird). Jeder Spieler startet mit
  3 Leben (rote Herzen über dem Namen) und muss pro Durchgang 2 Fragen beantworten (sichtbar als
  graue Punkte unter dem Namen, die nach jeder beantworteten Frage dazukommen); sind bei allen
  Spielern beide Fragen beantwortet, wechselt der Raum in die Voting-Phase.
  In der Voting-Phase klickt jeder Spieler in der unteren Spielerliste auf eine Person, um sie zu
  voten (30 Sekunden Zeit, `votingDurationMs`/`votingStartedAt` treiben dieselbe Zeitleiste wie im
  Fragemodus); wer bis dahin nicht gevotet hat, votet automatisch sich selbst. Wer die meisten
  Stimmen bekommt, verliert ein Herz; bei Unentschieden verlieren alle daran Beteiligten je ein
  Herz (Minimum 0 Leben). Danach wird 15 Sekunden lang aufgelöst, wer für wen gevotet hat und wer
  ein Herz verliert (`votingResolved`, ebenfalls mit eigener `resultDurationMs`/`resultStartedAt`
  auf derselben Zeitleiste), bevor automatisch ein neuer Durchgang mit neu gewürfelter
  Zugreihenfolge gestartet wird — die Auflösungs-Anzeige wird dabei wieder ausgeblendet. Sind nach
  der Stimmauszählung nur noch genau zwei Spieler am Leben, wird die `votingResolved`-Anzeige
  bewusst übersprungen (kein 15-sekündiges Auflösungs-Zwischenspiel) und stattdessen sofort das
  Finale gestartet (`startFinale()` in `roomManager.js`, siehe `finishVoting()` in `server.js`):
  Der komplette Fragenpool wird einmal neu gemischt und von vorne begonnen, beide verbleibenden
  Spieler beantworten dieselben 5 Fragen (`FINALE_QUESTION_COUNT`) gleichzeitig statt abwechselnd
  — links und rechts stehen jeweils ein eigenes Eingabefeld samt Absenden-Button an der Stelle, wo
  sonst das einzelne Antwortfeld steht, nur das eigene ist aktiv, das andere zeigt
  schreibgeschützt die Gegenseite. Ein gemeinsamer 30-Sekunden-Timer (`finaleDurationMs`/
  `finaleStartedAt`) läuft pro Frage; haben beide vor Ablauf geantwortet, wird sofort ausgewertet,
  sonst gilt für die fehlende Antwort der Platzhalter "(keine Antwort)". Danach werden 5 Sekunden
  lang beide Antworten plus die richtige Antwort angezeigt (`finaleAnswerRevealed`, dieselbe
  `REVEAL_DURATION_MS`), bevor automatisch die nächste Frage startet. Der Punktestand selbst
  bekommt keine eigene Text-Anzeige, sondern nutzt dieselben grauen/grünen Antwort-Punkte wie in
  einem normalen Durchgang: Client-seitig zählt `finaleAnswersByPlayer` in `room.js` pro Finalist
  die bereits ausgewerteten Finalfragen mit, `renderPlayers()` zeigt für Finalisten während der
  `isFinalePhase` diese Historie statt der normalen `answeredCount`/`answersByPlayerThisRound` an
  derselben Stelle unter dem Namen an (siehe unten). Leben spielen im Finale keine Rolle mehr —
  gewertet wird ausschließlich, wer von den 5 Fragen mehr richtig beantwortet hat. Nach der
  letzten Frage wird nur noch der Sieger angezeigt (`finaleResolved`, bei Gleichstand
  ausdrücklich kein Gewinner: "Unentschieden!") und die Zeitleiste dabei bewusst eingefroren
  (`timerBarFill` wird in `applyFinaleResolved()` auf 0 % gesetzt statt per `restartTimerBar()`
  zu laufen) — anders als bei den übrigen Auflösungs-Anzeigen gibt es hier keinen automatischen
  Fortgang. Stattdessen bekommt einzig der Host nach `resultDurationMs` (5000 ms ab
  `resultStartedAt`, `FINALE_RESULT_DURATION_MS` in `server.js`) den Button "Spiel neu starten"
  eingeblendet (`#buttonRestartGame` in `finaleResult`, dieselbe Verzögerungslogik wie beim
  Rejoin: verstrichene Zeit wird abgezogen, sodass ein später beitretender Host den Button ggf.
  sofort sieht); ein Klick darauf löst exakt dasselbe `startGame`-Event aus wie der reguläre
  "Spiel starten"-Button und startet dadurch ganz normal ein komplett neues Spiel (Leben-Reset,
  neue Zugreihenfolge, siehe `startGame()`). Solange der Host nicht klickt, bleibt der
  Sieger-Bildschirm für alle unverändert stehen; es gibt keinen serverseitigen Timeout mehr, der
  das Spiel nach dem Finale von selbst beendet. Verlässt einer der beiden Finalisten den Raum
  (Verlassen-Button oder Disconnect nach Ablauf der Gnadenfrist), wird das Spiel sofort beendet,
  da das Finale zwingend zwei Spieler voraussetzt; sind nach einer normalen Voting-Auflösung
  dagegen weniger als zwei Spieler übrig (die reguläre `votingResolved`-Anzeige lief in diesem
  Fall ganz normal durch), endet das Spiel ebenfalls direkt, ohne Finale oder automatischen
  Neustart. Während
  der Voting-Phase zeigt ein Hover über die grauen Antwort-Punkte per CSS-Tooltip (`::after` mit
  `content: attr(data-tooltip)`, siehe `.answeredDot[data-tooltip]:hover::after` in `style.css`)
  Frage, gegebene Antwort und richtige Antwort der jeweiligen Frage — bewusst kein natives
  `title`-Attribut mehr, da dessen Browser-Verzögerung/Anzeigeverhalten unzuverlässig war; sobald
  man selbst gevotet hat,
  verschwinden Mauszeiger und Hover-Effekt über der Spielerliste (CSS-Klasse `voted` auf
  `#listPlayersInGame`, siehe `:not(.voted)`-Selektoren in `style.css`). Die goldene Umrandung
  (`.currentTurn`) zeigt ausschließlich, wer während der Fragerunde gerade dran ist —
  `idCurrentTurnPlayer` wird beim Start der Voting-Phase auf `null` gesetzt, daher erscheint dort
  kein Gold. Beim Hovern während des Votens wird die Kachel stattdessen orange (`#f97316`, bewusst
  weder blau noch gold); eine bestätigte eigene Stimme bleibt grün (`.votedByMe`).
  Antworten werden direkt bei Abgabe ausgewertet (Vergleich mit der hinterlegten richtigen
  Antwort, whitespace-getrimmt und case-insensitive): der Antwort-Punkt einer richtig
  beantworteten Frage ist grün (`.correctAnswerDot`), sonst grau. Spieler, die in einem Durchgang
  alle ihre Fragen richtig beantwortet haben, sind für diesen Durchgang vom Voting geschützt —
  ihre Kachel ist in der Voting-Phase abgedunkelt und nicht anklickbar (`.immuneFromVoting`), und
  auch serverseitig lehnt `submitVote()` Stimmen auf sie ab (siehe Architektur-Abschnitt).
  Spieler mit 0 Leben gelten als tot: Sie werden nicht mehr aus der regulären Spielerliste
  angezeigt, sondern unten rechts in einer eigenen Box unter der Überschrift "Tote Spieler" nur
  mit ihrem Namen (ohne Herzen/Punkte) gelistet, sind bei der Zugvergabe nicht mehr an der Reihe
  und können weder voten noch gevotet werden.
- Nicht implementiert: Punktevergabe außerhalb des Finales. Bleibt nach einer Voting-Auflösung nur
  noch ein Spieler (oder keiner) übrig, endet das Spiel schlicht, ohne dass ein "Sieger" ermittelt
  wird — dieser Fall dürfte in der Praxis selten auftreten (z. B. bei einem Unentschieden unter
  drei Spielern, die dadurch gleichzeitig ihr letztes Leben verlieren).
- Räume und Spieler werden ausschließlich in-memory gehalten (`server/roomManager.js`, `Map`).
  Es gibt keine Persistenz — bei Server-Neustart (z. B. Render-Redeploy) gehen alle aktiven
  Räume verloren.

## Architektur

- Echte Mehrseiten-Struktur, kein SPA: `public/index.html` ist die Lobby-Seite
  (`frontend/js/main.js`), `public/room.html` die Raum-/späte Spiel-Seite (`frontend/js/room.js`).
  Navigation zwischen beiden ist ein echter Seitenwechsel (`window.location.href`), keine
  History-API-Simulation.
- Frontend (`public/`, `frontend/`) und Backend sind getrennt gehostet: Das Frontend läuft
  statisch über GitHub Pages, `server/server.js` ausschließlich als Socket.IO-Backend über
  Render. Der Server liefert deshalb keine statischen Dateien mehr aus (kein `express.static`,
  keine `GET /room/:roomCode`-Route) — das Docker-Image für Render enthält bewusst nur
  `server/` (siehe `Dockerfile`/`.dockerignore`), `public/`/`frontend/` werden separat über
  GitHub Pages ausgeliefert. Da GitHub Pages kein serverseitiges Routing kennt, liest
  `readRoomCodeFromUrl()` in `room.js` den Raumcode aus dem Query-Parameter `?room=` statt aus
  dem URL-Pfad; `main.js` navigiert entsprechend zu `room.html?room=<roomCode>`. Die
  Socket.IO-Verbindung (`frontend/js/socketClient.js`) und das `socket.io.js`-Client-Script in
  `index.html`/`room.html` zeigen fest codiert auf die Render-URL
  (`https://der-dummste-fliegt.onrender.com`, `SERVER_URL`-Konstante). Der Server erlaubt
  Cross-Origin-Zugriffe nur von der GitHub-Pages-Origin (`FRONTEND_ORIGIN`-Umgebungsvariable in
  `server.js`, auf Render zu setzen).
- Da ein Seitenwechsel den Socket trennt, hat jeder Spieler eine stabile `idPlayer`
  (`crypto.randomUUID()`, persistiert in `sessionStorage`, siehe `frontend/js/playerIdentity.js`).
  Beim Wechsel Lobby → Raum verbindet sich ein neuer Socket und tritt mit derselben `idPlayer`
  erneut bei (`joinRoom`-Event erkennt das als Rejoin, nicht als neuen Spieler).
- `server/roomManager.js` verzögert das endgültige Entfernen eines getrennten Spielers um
  `DISCONNECT_GRACE_PERIOD_MS` (5000 ms), damit der Raum die kurze Lücke zwischen Disconnect
  (alte Seite) und Rejoin (neue Seite) übersteht. Ein bewusstes Verlassen über den
  "Verlassen"-Button läuft über das separate `leaveRoom`-Event ohne Gnadenfrist.
- Raumcodes sind vierstellig, uppercase, kollisionsfrei innerhalb der laufenden `Map`.
- Neue Spiellogik sollte als eigenes Modul neben `roomManager.js` entstehen, nicht direkt in
  `server.js`.
- Fragen kommen **nicht** aus einer eigenen MongoDB-Anbindung in diesem Projekt, sondern von
  einer externen API eines anderen Hobby-Projekts:
  `https://hobby-projects-api.onrender.com/questions` (Format: `{_id, text, answer, createdAt}`).
  `server/questionRepository.js` lädt sie einmalig beim Serverstart und cacht sie im Speicher
  (`getAllQuestions()`). Neue Fragen aus der externen DB werden erst nach einem Neustart dieses
  Servers sichtbar. Da der externe Service auf Render Hobby-Tier läuft, kann der erste Request
  nach Inaktivität durch einen Kaltstart verzögert sein.
- Runden-Engine lebt direkt in `server/roomManager.js` (Raum-Objekt bekommt ein `game`-Feld mit
  gemischtem Fragenpool, per `shuffleArray()` zufällig gewürfelter Zugreihenfolge, aktuellem
  Index, `answeredCounts` je `idPlayer` und einer `phase` ("question" oder "voting")). Die
  Timer-Verwaltung (`setTimeout` pro Raum, `TURN_DURATION_MS`) liegt bewusst in `server.js`, nicht
  in `roomManager.js`, da sie ans Socket.IO-Emitten gekoppelt ist — `roomManager.js` bleibt reine
  Zustandslogik ohne Kenntnis von Sockets/Broadcasts.
- Leben (`STARTING_LIVES = 3`) und beantwortete Fragen pro Durchgang (`QUESTIONS_PER_PLAYER_PER_ROUND = 2`)
  sind Konstanten in `roomManager.js`. `advanceTurn()` erhöht beim Zugwechsel zuerst
  `answeredCounts[idPlayer]` des gerade beendeten Zugs; haben danach alle aktuellen Spieler die
  geforderte Anzahl erreicht, wird `room.game.phase = "voting"` gesetzt und `{phase: "voting"}`
  statt eines neuen Zugs zurückgegeben — `handleTurnResult()` in `server.js` unterscheidet danach,
  ob `turnStarted` (inkl. `scheduleTurnTimeout()`) oder die Voting-Phase (`startVotingPhase()`)
  gestartet wird. `indexQuestion` wird dabei in jedem Fall um eins erhöht (auch beim letzten Zug
  eines Durchgangs, der in die Voting-Phase mündet), damit der nächste Durchgang mit der nächsten
  statt der gerade gestellten Frage weitermacht; `shuffledQuestions` wird nur dann komplett neu
  gemischt, wenn dieser Zähler das Ende des Pools erreicht (also wirklich jede Frage einmal
  gestellt wurde) — ein Durchgangswechsel allein löst kein Neumischen aus. `lives` steht in der
  öffentlichen Spieler-Repräsentation
  (`toPublicPlayers()`/`getPublicPlayers()`) bereit und wird bei jedem `startGame()` auf
  `STARTING_LIVES` zurückgesetzt (nicht bei `startNextRound()`, das nur einen neuen
  Fragedurchgang ohne Lebensreset beginnt).
- Voting-Logik lebt ebenfalls in `roomManager.js`: `room.game.votes` (idVoter → idVotedFor) und
  `room.game.answersGiven` (idPlayer → Array aus `{questionText, answerGiven, correctAnswer,
  isCorrect}`, eine Zeile pro beantworteter Frage) werden bei `startGame()`/`startNextRound()`
  geleert. `recordCurrentAnswer()` vergleicht dabei die gegebene Antwort per `normalizeAnswerText()`
  (trim + lowercase) mit der richtigen Antwort und schreibt das Ergebnis als `isCorrect` in den
  neuen `answersGiven`-Eintrag, **bevor** `advanceTurn()` den Zustand weiterschaltet; die Reveal-
  Rückgabe (und damit das `answerRevealed`-Event) trägt `isCorrect` sowie `questionText` seither mit,
  damit der Client die Antwort-Punkte schon während der Fragerunde grün einfärben kann, statt erst
  beim Start der Voting-Phase. `hasAnsweredAllCorrectlyThisRound()` prüft anhand von
  `answersGiven`, ob ein Spieler in diesem Durchgang ausschließlich richtig geantwortet hat.
  Sowohl das `turnStarted`- als auch das `answerRevealed`-Event tragen deshalb (wie schon
  `votingStarted`) ein `answersByPlayer` genanntes Feld mit `getAnswersGivenThisRound()` mit;
  `room.js` übernimmt dieses serverseitige Objekt bei jedem dieser Events 1:1 als
  `answersByPlayerThisRound`, statt selbst Buch zu führen. Das ist bewusst so gelöst (statt
  client-seitig nur bei Antworten zu ergänzen): Zum einen leerte eine frühere, rein
  client-seitige Version bei *jedem* `turnStarted` versehentlich die ganze Historie statt nur
  beim ersten Zug eines Durchgangs, wodurch bereits beantwortete Fragen anderer Spieler ihre
  grüne Einfärbung und ihren Hover-Tooltip verloren, sobald der nächste Spieler an der Reihe war.
  Zum anderen ging die Historie beim Neuladen der Seite komplett verloren, da sie nur im
  Browser-Speicher existierte — `applyGameStateOnRejoin()` in `room.js` wendet das zuletzt
  gespeicherte `gameState` (inklusive dessen `answersByPlayer`) erneut an, sodass die
  Antwort-Punkte auch nach einem Reload korrekt eingefärbt bleiben und ihren Tooltip behalten.
  Zusätzlich rendert `renderPlayers()` die Punktezahl eines Spielers als
  `Math.max(player.answeredCount, answerHistory.length)`, nicht nur `player.answeredCount`: Das
  serverseitige `turnStarted`-Event trägt den aktualisierten Zähler erst für den *nächsten* Zug
  mit, das `answerRevealed`-Event des gerade abgeschlossenen Zugs dagegen nicht — ohne dieses
  `Math.max()` würde der soeben erst beantwortete Punkt für die Dauer der 5-sekündigen
  Reveal-Phase kurz verschwinden.
  `submitVote()` akzeptiert nur einen Vote pro Spieler, nur in der Voting-Phase, nur für/von
  lebende Spieler (siehe unten) und lehnt Stimmen auf einen so "immunen" Spieler ab;
  `haveAllPlayersVoted()` prüft, ob alle aktuellen *lebenden* Spieler gevotet haben — `server.js`
  löst dann sofort per `finishVoting()` auf, statt auf den 30-Sekunden-Timeout zu warten.
  `resolveVotes()` ergänzt fehlende Votes lebender Spieler als Selbst-Votes, zählt aus (Stimmen auf
  einen immunen Spieler — auch dessen eigener Fallback-Selbst-Vote — zählen dabei nicht mit),
  ermittelt alle Spieler mit der höchsten Stimmenzahl (bei Gleichstand mehrere) und zieht ihnen je
  ein Leben ab (nie unter 0; sind alle verbleibenden Stimmen immun, verliert niemand ein Leben).
  `startNextRound()` würfelt danach `playerOrder` neu, setzt `answeredCounts`/`answersGiven`/
  `votes` zurück und schaltet `phase` wieder auf `"question"`, lässt aber den laufenden
  gemischten Fragenpool (`shuffledQuestions`/`indexQuestion`) unangetastet weiterlaufen.
- `isPlayerAlive()` (`player.lives > 0`) entscheidet in `roomManager.js`, wer noch am Spiel
  teilnimmt: `getCurrentTurn()` überspringt tote Spieler bei der Zugvergabe genauso wie
  ausgeschiedene, `advanceTurn()` fordert die pflichtigen Fragen pro Durchgang nur noch von
  lebenden Spielern ein, und `submitVote()`/`haveAllPlayersVoted()`/`resolveVotes()` beziehen tote
  Spieler weder als Wähler noch als Wahlziel mit ein. Client-seitig teilt `renderPlayerLists()` in
  `room.js` `currentPlayers` anhand von `lives > 0` in die normale Spielerliste
  (`#listPlayersInGame`) und die neue Box `#deadPlayersBox` ("Tote Spieler", nur Namen, keine
  Herzen/Punkte) auf.
- `toPublicPlayers()` nimmt seit der Lebens-/Fortschrittsanzeige das ganze Raum-Objekt entgegen
  (nicht mehr nur die Spielerliste + Host-Id), damit `lives` und `answeredCount` (aus
  `room.game.answeredCounts`, 0 falls kein aktives Spiel) mit reingerechnet werden können. Die
  `turnStarted`- und `votingStarted`-Events tragen deshalb jeweils die aktuelle Spielerliste
  inklusive dieser Felder mit, damit der Client Herzen und Punkte pro Zug aktualisieren kann,
  ohne auf ein separates `playersUpdated`-Event zu warten.
- Zugwechsel läuft über zwei Pfade, die beide in `revealAnswerAndAdvance()` (`server.js`) münden:
  (1) `submitAnswer`-Event des aktuell dran befindlichen Spielers (per `idSocket` verifiziert über
  `isCurrentPlayerSocket()`, inkl. eingegebenem Antworttext), (2) serverseitiger Timeout nach
  30 Sekunden ohne Antwort (Platzhaltertext "(keine Antwort)"). Beide Pfade zeigen erst 5 Sekunden
  lang die gegebene Antwort + die korrekte Antwort (`answerRevealed`-Event, `REVEAL_DURATION_MS`),
  bevor `advanceTurn()` den nächsten Zug startet (siehe `recordCurrentAnswer()` oben).
- Die Zeitleiste wird nicht rein clientseitig ab Empfangszeitpunkt animiert, sondern der Server
  schickt einen `turnStartedAt`-Zeitstempel (`Date.now()`) im `turnStarted`-Event mit. Grund: Der
  clientseitige "Reflow-Trick" zum Neustarten einer CSS-Transition (`transition:none` → Breite
  setzen → erzwungener Reflow → Transition wieder aktivieren) hängt von einem tatsächlichen
  Browser-Paint ab, den Browser bei Hintergrund-Tabs verzögern — dadurch schien die Leiste bei
  inaktiven Tabs "zu warten" und startete beim Zurückwechseln fälschlich wieder bei voller Dauer.
  `restartTimerBar()` in `room.js` berechnet jetzt beim Empfang die tatsächlich verstrichene Zeit
  (`Date.now() - startedAt`) und setzt die Leiste direkt auf den korrekten Rest-Prozentsatz, bevor
  die Transition weiterläuft — dadurch konvergiert sie unabhängig von Verzögerungen auf denselben
  realen Endzeitpunkt bei jedem Spieler. Voraussetzung: Server- und Client-Uhr laufen einigermaßen
  synchron (in der Praxis unproblematisch, da beide auf derselben Maschine/im selben Netz laufen).
  Der Server-Zeitstempel behebt aber nur die Drift zwischen Clients, nicht das Einfrieren
  innerhalb eines einzelnen Hintergrund-Tabs: Browser pausieren das Repainting versteckter Tabs
  komplett, sodass eine laufende CSS-Transition dort optisch stehen bleibt, bis wieder ein neues
  Server-Event eintrifft. `room.js` merkt sich deshalb in `activeTimer` (`{durationMs, startedAt}`)
  den zuletzt per `restartTimerBar()` gestarteten Abschnitt (Frage-Zug, Voting, Voting-Auflösung)
  und registriert `document.addEventListener("visibilitychange", resyncTimerBarToNow)`.
  `resyncTimerBarToNow()` ruft bei `document.visibilityState === "visible"` erneut
  `restartTimerBar()` mit den gemerkten Werten auf und springt die Leiste damit sofort auf den
  tatsächlich korrekten Reststand, statt auf das nächste Server-Event zu warten. `stopTimerBar()`
  (Antwort-Reveal-Freeze) und der `gameStopped`-Handler setzen `activeTimer = null`, damit ein
  Tab-Wechsel während des Freezes oder nach Spielende keinen Countdown fälschlich fortsetzt.
- Verlässt ein Spieler mitten im Spiel den Raum, überspringt `getCurrentTurn()` in
  `roomManager.js` automatisch dessen Position in der Zugreihenfolge.
- Ein Disconnect (Reload, Tab-Schließen) mitten im Spiel stoppt die laufende Runde nicht mehr
  sofort: `socket.on("disconnect", ...)` in `server.js` ruft `stopGameIfActive()` nur noch aus dem
  `onRemoved`-Callback von `scheduleRemovalOnDisconnect()` auf, also erst wenn der Spieler die
  `DISCONNECT_GRACE_PERIOD_MS` (5000 ms) ganz verstreichen lässt, ohne mit derselben `idPlayer`
  zurückzukehren. Rejoint er rechtzeitig, läuft die Runde für alle unverändert weiter (sein
  eigener Zug/Timeout inbegriffen, falls gerade er dran war). Damit ein zurückkehrender Client
  nicht im leeren Warteraum landet, merkt sich `server.js` in `gameDisplayStates`
  (`roomCode → zuletzt gesendetes Event`) das jeweils letzte `turnStarted`-, `answerRevealed`-,
  `votingStarted`-, `votingResolved`-, `finaleStarted`-, `finaleAnswerRevealed`- oder
  `finaleResolved`-Payload pro Raum (gesetzt über `setGameDisplayState()`, gelöscht in
  `stopGameIfActive()`) und hängt es als `gameState` an das `roomJoined`-Event an. `room.js`
  extrahiert die sieben Payload-Anwendungen dafür in eigene Funktionen (`applyTurnStarted()`,
  `applyAnswerRevealed()`, `applyVotingStarted()`, `applyVotingResolved()`, `applyFinaleStarted()`,
  `applyFinaleAnswerRevealed()`, `applyFinaleResolved()`), die sowohl von den laufenden Events als
  auch von `applyGameStateOnRejoin()` beim `roomJoined`-Handler aufgerufen werden, um
  Spielbildschirm, Phase und Zeitleiste sofort korrekt wiederherzustellen, statt auf das nächste
  Server-Event zu warten. Ein bewusstes Verlassen über den "Verlassen"-Button läuft weiterhin ohne
  Gnadenfrist über das separate `leaveRoom`-Event.
- Weder ein bewusstes Verlassen noch ein endgültiger Disconnect (nach Ablauf der Gnadenfrist)
  stoppt die laufende Runde noch für die übrigen Spieler — der betreffende Spieler wird nur aus
  `room.players` entfernt, das Spiel läuft für alle anderen unverändert weiter.
  `removePlayerFromRoom()` in `roomManager.js` gibt dafür ein `removalEffect`
  (`{wasCurrentQuestionTurn, phaseAtRemoval}`) zurück, das über `leaveRoom()` bzw. den
  `onRemoved`-Callback von `scheduleRemovalOnDisconnect()` bis zu
  `handlePlayerRemovedDuringGame()` in `server.js` durchgereicht wird. War der entfernte Spieler
  gerade dran und wartet die Fragerunde noch auf seine Antwort (erkennbar daran, dass
  `gameDisplayStates` zuletzt `turnStarted` war, siehe oben), springt diese Funktion sofort per
  `resyncQuestionTurn()` weiter, statt den jetzt sinnlosen 30-Sekunden-Timeout dieses Spielers
  abzuwarten — `resyncQuestionTurn()` ist dabei bewusst von `advanceTurn()` in `roomManager.js`
  getrennt: Es zählt keinen `answeredCounts`-Eintrag (der Spieler hat schlicht nie geantwortet),
  prüft aber dieselbe `hasEveryPlayerAnsweredEnough()`-Bedingung, damit ein Entfernen auch direkt
  in die Voting-Phase auslösen kann, falls alle verbliebenen Spieler ihr Soll bereits erfüllt
  hatten. War der Spieler stattdessen mitten in der Voting-Phase (`gameDisplayStates` zuletzt
  `votingStarted`) und hatten dadurch bereits alle übrigen lebenden Spieler gevotet, wird
  `finishVoting()` sofort ausgelöst statt auf den 30-Sekunden-Voting-Timeout zu warten;
  `removePlayerFromRoom()` löscht dafür zuvor dessen eigenen Vote sowie alle Stimmen, die auf ihn
  abgegeben wurden (die betroffenen Voter gelten danach wieder als "noch nicht gevotet"). Ein
  Entfernen während der 5-sekündigen Antwort-Reveal-Phase oder während die Voting-Auflösung schon
  angezeigt wird, wird bewusst *nicht* sofort resynct (jeweils erkennbar daran, dass
  `gameDisplayStates` zuletzt `answerRevealed` bzw. `votingResolved` war) — der ohnehin schon
  laufende Timeout dieser Phase macht in beiden Fällen von selbst weiter. Damit das für die
  Reveal-Phase korrekt bleibt, nimmt `advanceTurn()` seit dieser Änderung die `idFinishedPlayer`
  explizit als Parameter entgegen (übergeben von `revealAnswerAndAdvance()` in `server.js`, aus dem
  bei Zugbeginn ermittelten `reveal.idPlayer`), statt sie beim Auslösen des Timeouts erneut über
  `getCurrentTurn()` zu bestimmen — sonst hätte ein Disconnect während der Reveal-Phase dazu
  geführt, dass der *nächste* statt des tatsächlich antwortenden Spielers den Zug- und
  Fragenzähler-Fortschritt gutgeschrieben bekommt. `stopGameIfActive()` bleibt nur als
  Notfall-Rückfallebene übrig, falls `resyncQuestionTurn()` niemanden mehr findet, der am Zug sein
  könnte (z. B. wenn niemand mehr im Raum lebt oder verbleibt).
- Verlässt der Host den Raum (expliziter "Verlassen"-Klick oder Disconnect-Timeout nach
  `DISCONNECT_GRACE_PERIOD_MS`), erhält automatisch ein verbleibender Spieler die Krone:
  `removePlayerFromRoom()` in `roomManager.js` setzt `room.idHost = room.players[0].idPlayer`,
  falls der entfernte Spieler der Host war. Das ist der einzige Ort, an dem Spieler aus
  `room.players` entfernt werden, daher deckt diese eine Stelle beide Entfernungspfade
  (`leaveRoom()` und `scheduleRemovalOnDisconnect()`) ab. Welcher der verbleibenden Spieler neue
  Krone bekommt, ist bewusst beliebig (erster Eintrag im Array), keine Wahl oder Priorisierung.
- In `style.css` müssen Container, die per `element.hidden = true`/`false` ein- und ausgeblendet
  werden (`#answerReveal`, `#votingResult`, `#finaleReveal`, `#finaleResult` usw.), ihre
  `display`-Deklaration mit `:not([hidden])` scopen (siehe `#answerInputRow:not([hidden])` als
  Vorbild). Eine ID-Regel wie `#finaleReveal { display: flex; }` ohne dieses Scoping gewinnt sonst
  gegenüber der `[hidden] { display: none; }`-Regel des User-Agent-Stylesheets (höhere
  Spezifität), wodurch das Element trotz gesetztem `hidden`-Attribut sichtbar bleibt — sichtbar
  wurde das dadurch, dass die zuletzt in `#finaleReveal` angezeigten Antworten/richtige Antwort
  einer Finalfrage optisch über der Sieger-Anzeige in `#finaleResult` hängen blieben, obwohl beide
  Elemente korrekt `hidden` gesetzt bekamen.

## Nächste Schritte (fachlich offen)

- Punktevergabe/Statistiken über eine einzelne Partie hinaus.
- Render-Service (`https://der-dummste-fliegt.onrender.com`) läuft bereits für `server/`.
  GitHub-Repository anlegen, GitHub Pages für `public/`/`frontend/` einrichten und die
  `FRONTEND_ORIGIN`-Umgebungsvariable in Render mit der tatsächlichen GitHub-Pages-URL
  belegen (Platzhalter `REPLACE_WITH_GITHUB_PAGES_URL` in `server.js`, siehe
  Architektur-Abschnitt).
