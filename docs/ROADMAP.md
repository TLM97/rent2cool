# Roadmap (Arbeitskopie)

Das Original mit allen Arbeitspaketen und dem Regulatorik-Register liegt im Dokument „Roadmap Technik & Automatisierung – Pharma-Kühltransporter-Verleih“ auf claude.ai. Diese Datei ist die Kurzfassung für die Umsetzung und wird von der Planung gepflegt.

## Ziel

In rund 11 Monaten steht eine Systemlandschaft, die jede Vermietung vom Angebot bis zur Rechnung lückenlos, GDP-konform und weitgehend automatisch abwickelt. Übergabe und Rücknahme laufen kontaktlos. Wichtigstes Verkaufsargument: Jeder Kunde bekommt nach jeder Miete automatisch einen lückenlosen, fälschungssicheren Temperaturnachweis.

## Ein System, nicht drei

| Baustein | Nutzer | Aufgabe |
|---|---|---|
| Kern (Backend, Datenbank) | niemand direkt | Datenmodell, Statusmodelle, Buchungsregeln, Fristen, Telematik-Eingang, Audit Trail, Berichte, Rechnungen |
| Admin-Oberfläche | Gründer, Ops-Team | Flotte, Kunden, Buchungen, Freigaben, Alarme, Abweichungen |
| Mobile App | Fahrer der Kunden, eigenes Team | Registrierung, digitaler Schlüssel, Foto-Check, Übergabe, Rückgabe, Alarme, Reinigungs-Checkliste |
| Website | Interessenten, Auditoren | Vertrauen, Anfragen, Rechtstexte |
| Kundenportal | Disposition und QA der Kunden | Buchungen, Verträge, Live-Temperatur, Berichte, Datenexport |

## Architekturregeln

1. Schnittstelle zuerst: Jede Funktion entsteht im Kern mit API, Oberflächen danach.
2. GDP-Grenze: Website getrennt vom Kern, ohne Schreibrechte auf GDP-Daten.
3. Audit Trail und Rollen ab dem ersten Commit.
4. Modularer Monolith, eine Datenbank, ein Deployment.

## Phasen

| Phase | Monate | Kern | App | Website/Portal |
|---|---|---|---|---|
| 0 Fundament | M0–M2 | Datenmodell, Rollen, Audit Trail, Telematik-Test | Klick-Prototyp, kein Code | Website v1 live |
| 1 Kernsysteme | M2–M5 | Fahrzeugakte, Fristen, Telematik, Kunden, Buchung, Rechnung, Temperaturbericht v1 | App-MVP ab M3 | nur Inhalte |
| 2 Validierung, Pilot | M5–M8 | Feature-Freeze, Validierung, Pentest, Pilot | Validierung, Store-Freigabe | Portal entwerfen |
| 3 Go-live | M8–M11 | Automatisierung, Kennzahlen | Bilderkennung, Geofence | Kundenportal |

## Kritischer Pfad

Fahrzeugtyp → Telematik-Box und Testgerät → Fernöffnen und Wegfahrsperre über den Kern → digitaler Schlüssel in der App → Probemiete.

## Aktuelle Phase

Phase 0.
