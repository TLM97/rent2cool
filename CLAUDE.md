# Rent2Cool – Arbeitsanweisung für Claude Code

Rent2Cool ist ein Verleih von Kühltransportern für die Pharmaindustrie. In diesem Repo entsteht die gesamte Software: Kern (Backend und Datenbank), interne Admin-Oberfläche, Mobile App, öffentliche Website und Kundenportal.

## Zwei Rollen, ein Repo

- **Planung** ist der Claude-Chat im Projekt „Rent2Cool“ auf claude.ai. Er hält das große Bild, schreibt Aufgaben und trifft mit Tom die Architekturentscheidungen.
- **Umsetzung** bist du, Claude Code. Du baust, testest und berichtest zurück.

Ihr kommuniziert ausschließlich über die Dateien in `docs/`. Es gibt keinen anderen Kanal.

## Bei jedem Sessionstart

1. `docs/ROADMAP.md` lesen: Phasen, Gates, Architekturregeln.
2. `docs/TASKS.md` lesen: Nimm die oberste Aufgabe mit Status `offen` oder `in Arbeit`.
3. `docs/DECISIONS.md` lesen, bevor du etwas an Architektur, Stack oder Datenmodell änderst.
4. `docs/STATUS.md` lesen: Was zuletzt passiert ist und welche Fragen offen sind.

## Umgebung

Das Repo wird lokal (Toms Mac, `~/Developer/rent2cool`) und in Cloud-Sessions bearbeitet. GitHub ist die einzige Wahrheit.

- Vor der Arbeit `git pull`, nach der Arbeit committen und pushen. Nie Arbeit nur lokal liegen lassen.
- Lokale Dienste laufen über `docker compose`. In einer Cloud-Session ist Docker installiert, der Dienst aber eventuell nicht gestartet: Wenn `docker info` fehlschlägt, `sudo dockerd > /tmp/dockerd.log 2>&1 &` ausführen und kurz warten.
- Arbeit, die einen echten Mac braucht (iOS-Simulator, Tests auf dem eigenen Handy), in `STATUS.md` als „braucht lokale Session“ markieren.

## Während der Arbeit

- Arbeite nur an Aufgaben aus `TASKS.md`. Wenn dir etwas fehlt oder unklar ist, schreib eine Frage in `STATUS.md` unter „Fragen an Planung“ und mach mit etwas anderem weiter, statt zu raten.
- Setze den Status der Aufgabe in `TASKS.md` auf `in Arbeit`, wenn du anfängst, und auf `erledigt` oder `blockiert`, wenn du aufhörst.
- Neue Architekturentscheidungen nur als Vorschlag in `DECISIONS.md` mit Status `vorgeschlagen`. Freigegeben wird in der Planung.
- Ändere keine Aufgaben, Akzeptanzkriterien oder Roadmap-Inhalte. Das ist Sache der Planung.

## Am Ende jeder Session

Trage oben in `docs/STATUS.md` einen neuen Eintrag ein: Datum, bearbeitete Aufgabe, was fertig ist, was offen ist, Fragen an Planung. Dann committen und pushen.

## Nicht verhandelbar (GDP und Validierung)

- Audit Trail und Rollen sind ab dem ersten Commit Pflicht. Jede schreibende Aktion auf GDP-Daten wird protokolliert: wer, wann, was, alter und neuer Wert.
- Messwerte aus der Telematik sind unveränderbar. Kein Update, kein Delete.
- Alle Zeitstempel in UTC mit synchronisierter Uhr.
- Jede Funktion bekommt automatisierte Tests. Ohne Test gilt eine Aufgabe nicht als erledigt.
- Die öffentliche Website hat keinen Schreibzugriff auf GDP-Daten.
- Keine echten Kundendaten, Zugangsdaten oder Schlüssel ins Repo.

## Auslegung: 1.000 Mieten pro Tag (D-003)

Baue jede Funktion so, als liefen schon 1.000 Mieten am Tag mit rund 4.000 sendenden Fahrzeugen, auch wenn heute nur Testdaten existieren. Konkret:

- Telematik nur über eine Warteschlange annehmen; jede Nachricht mit eindeutiger ID, Duplikate erkennen.
- Messwerte in Zeitreihen-Tabellen, nach Zeit partitioniert und komprimiert. Nie eine unbegrenzte Abfrage über alle Messwerte.
- Fotos und Dateien in einen Objektspeicher, nie in die Datenbank.
- Anwendungsserver zustandslos; alles, was länger als eine Anfrage dauert, als Hintergrundjob.
- Schreibende APIs idempotent (Idempotency-Key), weil die App bei schlechtem Netz wiederholt.
- Listen immer mit Pagination, Abfragen mit passenden Indizes; Standort und Mandant in jedem relevanten Datensatz.
- Infrastruktur als Code, Monitoring und strukturierte Logs ab dem ersten Deployment.
- Kein Over-Engineering: keine Microservices. Modularer Monolith, aber Telematik-Eingang und Berichtsdienst als klar getrennte Module, die später herausgelöst werden können.

Wenn eine Lösung bei dieser Last nicht trägt, ist sie keine Lösung. Halte in `STATUS.md` fest, wo du eine Abkürzung genommen hast, die vor dem Go-live ersetzt werden muss.

R-Nummern verweisen auf das Regulatorik-Register, AP-Nummern auf die Arbeitspakete der Roadmap.
