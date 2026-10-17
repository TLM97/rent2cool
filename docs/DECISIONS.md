# Entscheidungen

Jede Architektur- oder Technikentscheidung bekommt einen Eintrag. Claude Code darf Einträge mit Status `vorgeschlagen` anlegen, freigegeben wird in der Planung. Dient zugleich als Nachweis für die Validierung (R-10).

Status: `vorgeschlagen` · `freigegeben` · `verworfen` · `ersetzt durch D-xxx`

---

## D-001 Technik-Stack

- **Status:** freigegeben (von Tom an die Planung delegiert, 2026-10-16; Vorgabe: skalierbar und robust)
- **Sprache:** TypeScript überall, strikter Modus. Ein Typsystem von der Datenbank bis zur App, geteilte Typen und Validierung statt doppelter Modelle.
- **Monorepo:** pnpm Workspaces + Turborepo.
- **Backend (`apps/core`):** Node.js LTS, NestJS mit Fastify-Adapter. NestJS erzwingt Module, das passt zum modularen Monolithen (D-002). Eingabevalidierung mit Zod.
- **Datenbank:** PostgreSQL mit TimescaleDB für Messreihen (Partitionierung, Kompression, Aufbewahrung). Zugriff mit Drizzle ORM, Schemaänderungen nur als versionierte SQL-Migrationen im Repo (nachvollziehbar für die Validierung).
- **Warteschlange:** Kafka-API. Lokal Redpanda als ein Container; in der Cloud jeder verwaltete Kafka-Dienst ohne Codeänderung.
- **Hintergrundjobs:** BullMQ auf Valkey (Redis-kompatibel).
- **Objektspeicher:** S3-API. Lokal MinIO; in der Cloud jeder S3-kompatible Speicher.
- **Anmeldung und Rollen:** Keycloak (selbst betrieben, OpenID Connect, Mehrfaktor). Eigene Passwortlogik bauen wir nicht; das ist das größte Sicherheitsrisiko bei Eigenentwicklung. Rollen und Rechte selbst im Kern.
- **Web (`apps/web`, `apps/admin`):** Next.js. Website und Portal in `web`, interne Oberfläche getrennt in `admin`.
- **App (`apps/mobile`):** React Native mit Expo.
- **Telematik-Eingang:** eigener Prozess im selben Repo (`apps/ingest`), schreibt nur in die Warteschlange. Protokoll (z. B. MQTT oder HTTPS) folgt aus der Box-Auswahl.
- **Beobachtbarkeit:** OpenTelemetry, strukturierte JSON-Logs. Lokal Grafana-Stack als optionale Container.
- **Tests:** Vitest, später Playwright für Oberflächen; Testcontainers für Tests gegen echte Datenbank und Warteschlange.
- **Begründung:** Alle Bausteine sind Open Source, laufen lokal in Containern und haben in der Cloud einen verwalteten Gegenpart mit derselben Schnittstelle. Kein Baustein bindet uns an einen Anbieter. Python wäre beim Backend gleichwertig gewesen; den Ausschlag gibt eine Sprache für Kern, Web und App.

## D-002 Architekturform

- **Status:** freigegeben
- **Inhalt:** Modularer Monolith mit einer Datenbank und einem Deployment. Website ohne Schreibzugriff auf GDP-Daten.
- **Begründung:** Kleines Team, einfacher zu validieren und zu betreiben.

## D-003 Auslegung auf 1.000 Mieten pro Tag

- **Status:** freigegeben (Vorgabe Tom, 2026-10-16)
- **Inhalt:** Die gesamte IT wird ab Tag 1 für 1.000 Mieten pro Tag ausgelegt. Annahmen für die Dimensionierung: 3.500–4.000 Fahrzeuge, 1 Telematik-Nachricht pro Minute je Fahrzeug mit ca. 10 Messwerten (rund 6 Mio. Nachrichten am Tag), rund 120 GB Fotos am Tag, Betrieb rund um die Uhr.
- **Folgen:** Warteschlange vor dem Telematik-Eingang, partitionierte Zeitreihen, Objektspeicher mit Speicherklassen, zustandslose Server, idempotente APIs, offline-fähige App bei Übergabe und Rückgabe, Standort und Mandant im Datenmodell, Infrastruktur als Code, Betrieb in mindestens zwei EU-Zonen, Lasttest in Phase 2.
- **Bewusst nicht:** Microservices, aktiv-aktiv über mehrere Regionen.
- **Kosten:** Ausgelegt heißt nicht bezahlt. Die Infrastruktur startet klein und wächst über Konfiguration, nicht über Umbau.

## D-004 Vermietung ohne Fahrer

- **Status:** freigegeben (Entscheidung Gründer, 2026-10-16)
- **Inhalt:** Wir vermieten nur Fahrzeuge, keinen Transport. Der Kunde stellt den Fahrer.
- **Folgen:** Keine Güterkraftverkehrserlaubnis, keine Lenk- und Ruhezeiten für uns (R-24). Die Prüfung der Fahrerlaubnis jedes Fahrers des Kunden ist eine Kernfunktion: Identität, Klasse gegen Fahrzeuggewicht, wiederkehrende Prüfung, Sperre bei Ablauf (R-22). Die GDP-Verantwortung für die Ware bleibt beim Kunden; wir bleiben qualifizierter Dienstleister mit Qualitätsvereinbarung (R-01). Im Datenmodell gibt es keine eigenen Fahrer als Mitarbeiter, nur Fahrer, die zu einem Kunden gehören.

## D-005 Betrieb lokal, Cloud-Umzug als Konfiguration

- **Status:** freigegeben (Tom, 2026-10-16)
- **Inhalt:** Wir starten lokal mit Docker Compose. Jeder Dienst läuft als Container, jede Verbindung kommt aus Umgebungsvariablen, nichts hängt an lokalen Pfaden oder einem bestimmten Rechner.
- **Regeln, damit der Umzug einfach bleibt:** nur Standard-Schnittstellen (PostgreSQL, Kafka-API, S3-API, OpenID Connect); Anwendung zustandslos, Dateien nur im Objektspeicher; Konfiguration nach dem 12-Factor-Prinzip; Container-Images im CI gebaut; Gesundheits- und Bereitschafts-Endpunkte je Dienst. Infrastruktur als Code (OpenTofu) wird angelegt, sobald der Anbieter feststeht.
- **Später zu entscheiden:** Cloud-Anbieter (EU-Rechenzentrum, R-44), spätestens vor Phase 2.

## D-006 Einsatzgebiet und Fahrtenschreiber

- **Status:** freigegeben (Gründer, 2026-10-16)
- **Inhalt:** Wir operieren nur in Deutschland, Kunden dürfen ins Ausland fahren. Etwa die Hälfte der Flotte bekommt einen Smart-Tachographen (R-23).
- **Folgen für das System:** Fahrzeugmerkmal „Fahrtenschreiber ja/nein“. Bei der Buchung fragt das System, ob eine Auslandsfahrt geplant ist; wenn ja, sind nur Fahrzeuge mit Fahrtenschreiber buchbar. Grenzübertritt eines Fahrzeugs ohne Fahrtenschreiber erzeugt eine Meldung. Kurzzeitvermietung mit Übergabe in Deutschland wird in Deutschland besteuert; die Umsatzsteuer-Logik bleibt damit einfach (vom Steuerberater bestätigen lassen, R-63). Versicherungsschutz im Ausland mit dem Makler klären (R-28).

## D-007 Fahrzeugklasse bis 3,5 t (vorläufig)

- **Status:** freigegeben, vorläufig (Gründer, 2026-10-16)
- **Inhalt:** Zunächst nur Fahrzeuge bis 3,5 t zulässiger Gesamtmasse, Führerscheinklasse B.
- **Folgen:** Zulässige Gesamtmasse und benötigte Führerscheinklasse sind Daten am Fahrzeug, keine Annahme im Code. Schwerere Fahrzeuge später ohne Umbau, nur mit zusätzlicher Prüfregel (C1).

## D-008 Temperaturbereiche

- **Status:** freigegeben (Gründer, 2026-10-16)
- **Inhalt:** Zunächst 2–8 °C und 15–25 °C.
- **Folgen:** Temperaturbereiche sind konfigurierbare Profile mit Grenzwerten und Alarmregeln. Tiefkühlung später als weiteres Profil.

## D-009 Mietdauern

- **Status:** freigegeben (Gründer, 2026-10-16)
- **Inhalt:** Zuerst kurze Mieten (Stunden bis Tage, Wochen).
- **Folgen:** Eine Miete hat Start- und Endzeitpunkt mit Tarif; Monats- und Langzeitmieten später als weitere Tarife, nicht als neues Modell.

## D-010 Nur Geschäftskunden

- **Status:** freigegeben (Gründer, 2026-10-16)
- **Inhalt:** Wir vermieten nur an Unternehmen.
- **Folgen:** Kunde ist immer eine Firma mit Prüfung (Handelsregister, Umsatzsteuer-ID), Fahrer gehören zu einem Kunden. Kein Verbraucherrecht, keine Barrierefreiheitspflicht für Verbraucherdienste (R-49) – trotzdem barrierearm bauen.

## D-011 Standorte

- **Status:** freigegeben (Gründer, 2026-10-16)
- **Inhalt:** Übergabe und Rückgabe am Firmenstandort. Der Standort steht noch nicht fest.
- **Folgen:** Standorte sind Datensätze mit Adresse, Geofence und Öffnungsregeln. Im Code steht kein Ort. Testdaten verwenden einen Platzhalter-Standort.

## D-012 Fahrzeugplattform Mercedes-Benz, Telematik ab Werk

- **Status:** freigegeben, Modell offen (Gründer, 2026-10-16)
- **Inhalt:** Kühltransporter auf Mercedes-Benz-Basis, Telematik ab Werk. Genaues Modell und Kühlaufbau noch offen.
- **Zu prüfen vor der Bestellung (Beschaffung mit Händler):** (1) Gibt es eine Schnittstelle (API), über die unser Kern die Fahrzeugdaten live abrufen darf? (2) Lassen sich Türen und Wegfahrsperre aus der Ferne steuern, und gibt es einen digitalen Schlüssel für wechselnde Fahrer? (3) Die Laderaumtemperatur kommt vom Kühlaggregat bzw. Aufbau, nicht vom Fahrzeug: Welcher Temperaturschreiber ist verbaut, ist er kalibriert (EN 12830, R-08, R-09), und wie kommen seine Daten zu uns? (4) Datenrechte nach Data Act (R-46).
- **Folge für die Architektur:** Der Telematik-Eingang wird herstellerneutral gebaut (Adapter je Quelle). Fahrzeugdaten und Temperaturdaten können aus zwei verschiedenen Quellen kommen.

## D-013 Firmenname und Domain

- **Status:** freigegeben (Gründer, 2026-10-16)
- **Inhalt:** Rent2Cool. Domain noch zu sichern (z. B. rent2cool.de und .com).

## D-014 Kontaktlose Übergabe und Rückgabe ab dem ersten Tag

- **Status:** freigegeben (Gründer, 2026-10-16)
- **Inhalt:** Übergabe und Rückgabe laufen von Anfang an ohne Personal.
- **Folge:** App, digitaler Schlüssel und Foto-Check sind Teil des ersten Releases, nicht später. Die Akzeptanz bei den QA-Abteilungen der Kunden fragt der Vertrieb in den ersten Gesprächen ab; ein Fallback mit Personal bleibt als Ausnahmeprozess beschrieben.

## D-015 Platzhalter für offene Punkte

- **Status:** freigegeben (Tom, 2026-10-16)
- **Inhalt:** Offene Punkte blockieren die Entwicklung nicht. Bis zur Klärung gelten diese Platzhalter. Jeder Platzhalter ist im Code und in der Konfiguration als solcher erkennbar (Präfix `PLACEHOLDER_` bzw. Kommentar `TODO(D-015)`), damit er vor dem Go-live gefunden wird.

| Offener Punkt | Platzhalter | Ersetzen, wenn |
|---|---|---|
| Fahrzeugmodell und Kühlaufbau | generisches Fahrzeugprofil „Mercedes Kühltransporter bis 3,5 t“ | Beschaffung bestellt |
| Telematik-Schnittstelle Mercedes | Adapter-Schnittstelle plus **Telematik-Simulator** als erste Quelle (simuliert Position, km, Türen, Wegfahrsperre, Laderaumtemperatur, Funklöcher) | API-Zugang geklärt |
| Temperaturschreiber im Aufbau | eigene Quelle im Simulator, getrennt von den Fahrzeugdaten | Aufbau feststeht |
| Fernöffnung und digitaler Schlüssel | Schnittstelle `KeyProvider` mit Simulator-Implementierung | Mercedes-Lösung oder Nachrüstung entschieden |
| Firmenstandort | Standort `PLACEHOLDER_HQ` mit Fantasieadresse und Geofence | Sitz feststeht |
| Domain | `rent2cool.example` in Konfiguration | Domain gesichert |
| Datenschutzbeauftragter | Rolle `dpo` im System, Kontakt `PLACEHOLDER_DPO` in Datenschutztexten | externer DSB beauftragt |
| Qualitätsverantwortliche Person | Rolle `qa_approver`, im Testsystem einem Testnutzer zugeordnet; Freigaben technisch trotzdem nach Vier-Augen-Prinzip | Person benannt |
| Identitätsprüfung, Signatur, Zahlung | Schnittstellen mit Fake-Implementierung | Anbieter gewählt |
| Teamgröße | Planung mit einem Entwickler (Tom + Claude Code) | Budget entschieden |
| Cloud-Anbieter | lokal per Docker Compose (D-005) | vor Phase 2 |

- **Regel:** Keine echten Personendaten, solange `dpo` ein Platzhalter ist. Nur erfundene Testdaten.

## D-016 Stammdaten ändern: Versionsschutz und Audit in derselben Transaktion

- **Status:** vorgeschlagen (Claude Code, 2026-10-17)
- **Inhalt:** Änderungen an Stammdaten (Kunde, Fahrer, Fahrzeug) laufen über `PATCH` und tragen den Versionsstand (`aktualisiertAm`) mit, den der Bearbeiter gesehen hat. Ist der Datensatz inzwischen geändert, lehnt der Kern mit 409 ab, statt still zu überschreiben (optimistische Sperre, Zeile wird während der Prüfung gesperrt). Gespeichert werden nur tatsächlich geänderte Felder; der Audit-Eintrag mit altem und neuem Wert je Feld wird in **derselben Transaktion** geschrieben – Änderung und Protokoll gelingen oder scheitern gemeinsam. Keine Änderung → kein Update, kein Audit-Eintrag.
- **Begründung:** Audit Trail mit alt/neu ist Pflicht (CLAUDE.md, GDP); verlorene Änderungen bei mehreren Bearbeitern (D-003) wären für die Validierung nicht hinnehmbar. Keine zusätzliche Versionsspalte nötig, keine Migration.
- **Folge:** Ein Wächter-Test stellt sicher, dass jede schreibende Route auditiert ist (`@Audited` als Rückfallebene oder `@AuditImService` für den präzisen Weg). Nachtrag 2026-10-17: Alle Statuswechsel sind auf den präzisen Weg umgestellt (gemeinsamer Ablauf mit Zeilensperre `FOR UPDATE`, Folgeschritte wie „Rechnung gestellt → Miete abgerechnet“ in derselben Transaktion). Nachtrag 2: Auch das Anlegen schreibt den Audit-Eintrag selbst (vollständiger neuer Datensatz, gleiche Transaktion). Auf der Rückfallebene bleiben nur Temperaturnachweis erzeugen (kein DB-Datensatz, Antwort enthält Bewertung und Prüfsumme) und der Demo-Endpunkt.

## D-017 Geschäftsregeln mit Gleichzeitigkeitsrisiko erzwingt die Datenbank

- **Status:** vorgeschlagen (Claude Code, 2026-10-17)
- **Inhalt:** Regeln, die bei gleichzeitigen Anfragen brechen können, werden zusätzlich zur Prüfung im Kern als Datenbank-Regel abgesichert. Erste Anwendung: Exclusion-Constraint `ex_miete_fahrzeug_zeitraum` (Migration 0010) – je Fahrzeug keine überlappenden Zeiträume `[start, ende)` bei Status `bestaetigt`/`aktiv`. Die Prüfung im Kern bleibt für verständliche Ablehnungsgründe; der Kern übersetzt eine Regelverletzung in dieselbe Ablehnung. Datenbank-Fehler werden über SQLSTATE und Constraint-Namen erkannt (`apps/core/src/db/fehler.ts`), nie über den Fehlertext.
- **Begründung:** Bei 1.000 Mieten am Tag und mehreren Kernen (D-003) kommen gleichzeitige Buchungen desselben Fahrzeugs vor; eine Prüfung „erst lesen, dann schreiben“ schützt dann nicht. Die Datenbank-Regel gilt auch für künftige Wege am Kern vorbei (Importe, Skripte).
- **Folge:** Neue Regeln dieser Art (z. B. ein Sensor nur in einem Fahrzeug zugleich) nach demselben Muster prüfen. Migrationen mit solchen Regeln schlagen fehl, wenn Bestandsdaten sie verletzen – das ist gewollt.
- **Nachtrag (2026-10-17):** Gleichzeitige Prüfungen einer Exclusion-Constraint können sich gegenseitig blockieren (PostgreSQL meldet nach ca. 1 s einen Deadlock, der Nutzer sähe einen Serverfehler). Deshalb laufen Buchungen **desselben Fahrzeugs** kurz nacheinander (`pg_advisory_xact_lock` je Fahrzeug, nur innerhalb der Buchungstransaktion; andere Fahrzeuge unberührt). Als Rückfall wiederholt der Kern bei Deadlock/Serialisierungsfehler (`mitWiederholung`). Die Constraint bleibt die Garantie.

## D-018 Digitaler Schlüssel: Der Kern entscheidet, der Anbieter führt aus

- **Status:** vorgeschlagen (Claude Code, 2026-10-17)
- **Inhalt:** Jeder Befehl an ein Fahrzeug (Entriegeln, Verriegeln, Wegfahrsperre ein/aus) läuft über den Kern. Der Kern prüft ihn gegen den digitalen Schlüssel (je Miete und Fahrer, gültig ab 1 h vor Mietbeginn bis Mietende) bzw. die Rolle (Ops/Admin nur mit Grund), protokolliert ihn in `fahrzeug_befehl` – **auch abgelehnte Versuche** – und übergibt ihn erst dann an den `KeyProvider` (heute Simulator, D-015). Die Schnittstelle ist asynchron gedacht: Befehl `gesendet`, Rückmeldung des Anbieters später als `ausgefuehrt`/`fehlgeschlagen` (Statuswechsel mit Audit, Akteur `system:key-provider`). Netzwerkaufrufe an den Anbieter nie innerhalb einer Datenbank-Transaktion. Schlüssel werden mit Mietende oder Storno in derselben Transaktion widerrufen; dem Anbieter wird der Widerruf danach gemeldet. Der Fahrer in der App wird über `fahrer.konto_id` (Keycloak-Benutzer-ID, eindeutig) seinem Datensatz zugeordnet. Wiederholte Befehle (schlechtes Netz) sind über einen Pflicht-Idempotency-Key idempotent.
- **Begründung:** GDP und Sicherheit: Wer wann ein Kühlfahrzeug geöffnet hat, erklärt Temperaturabweichungen und ist bei Diebstahl/Manipulation Beweismittel. Die Hersteller-Lösung (D-012) ist offen; mit dem Kern als Instanz bleiben Regeln und Protokoll gleich, egal welcher Anbieter kommt.
- **Nachtrag (Antworten von Tom, 2026-10-17, eingearbeitet):** Die Wegfahrsperre steuern nur Administratoren (Rolle `admin`; Ops nur Türen) (F-38). Das erste erfolgreiche Entriegeln mit dem Fahrerschlüssel setzt eine bestätigte Miete auf `aktiv` – mit Übergabebereich-Prüfung, Akteur im Audit ist der Fahrer; bei asynchronem Anbieter erst mit dessen Bestätigung (F-39). Gültigkeit ab 1 h vor Mietbeginn bis zum tatsächlichen Mietende bestätigt (F-40); ergänzt um: Hat die Miete nie begonnen (No-Show), endet der Schlüssel mit dem geplanten Mietende. Status bleibt „vorgeschlagen“, bis die Planung ihn setzt.
- **Folge:** Ein Anbieter, der Offline-Schlüssel (Bluetooth am Fahrzeug, ohne Kern) ausgibt, umgeht die Prüfung je Befehl – dann müssen Gültigkeit und Widerruf beim Anbieter zuverlässig nachgezogen werden (Hintergrundjob mit Wiederholung) und dessen Öffnungsprotokoll zurück in den Kern fließen. Vor der Anbieterwahl prüfen (D-012, Frage 2).

## D-019 Lokaler Objektspeicher: SeaweedFS statt MinIO

- **Status:** vorgeschlagen (Claude Code, 2026-10-17)
- **Inhalt:** Lokal und in der CI läuft als S3-kompatibler Objektspeicher SeaweedFS (`chrislusf/seaweedfs`, Dienst `objektspeicher` in `docker-compose.yml`, Bucket per `objektspeicher-setup`) statt MinIO. Der Code spricht ausschließlich die S3-API (AWS SDK v3, `apps/core/src/objektspeicher`); produktiv bleibt es bei „jeder S3-kompatible Speicher“ (D-001). Ändert D-001 nur in der Zeile „Lokal MinIO“.
- **Begründung:** Die MinIO-Images lassen sich nicht mehr beziehen (Docker Hub: „repository does not exist“, quay.io aus der Umgebung nicht erreichbar) – damit gab es lokal keinen Objektspeicher, und Fotos/Berichte lagen nur im Arbeitsspeicher. SeaweedFS ist frei verfügbar (Apache 2.0), produktionsreif und unterstützt signierte Up-/Download-Links.
- **Folge:** SeaweedFS 3.80 prüft vom Client mitgeschickte SHA-256-Prüfsummen bei signierten Uploads nicht. Deshalb rechnet der Kern die Prüfsumme bei der Bestätigung selbst nach (liest das Objekt). Bei echter Last (D-003) auf speicherseitige Prüfsummen (z. B. AWS S3) oder einen Hintergrundjob umstellen – in STATUS als Abkürzung vermerkt.
