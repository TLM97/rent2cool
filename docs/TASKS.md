# Aufgaben

Gepflegt von der Planung. Claude Code ändert hier nur das Feld **Status**.

Status: `offen` · `in Arbeit` · `erledigt` · `blockiert`

---

## T-001 Repo-Grundgerüst

- **Status:** erledigt
- **Bezug:** AP 0.6, R-10
- **Ziel:** Ein lauffähiges, leeres Projektgerüst, auf dem alle weiteren Aufgaben aufbauen.
- **Umfang:**
  - Monorepo-Struktur mit Platz für `core` (Backend), `admin`, `web` (Website und Portal), `app` (Mobile)
  - Stack nach `DECISIONS.md` D-001, Betrieb nach D-005
  - `docker-compose.yml` für die lokale Umgebung: PostgreSQL mit TimescaleDB, Redpanda, Valkey, MinIO, Keycloak; ein Befehl startet alles
  - `apps/core` als NestJS-Grundgerüst mit Gesundheits-Endpunkt, Konfiguration nur aus Umgebungsvariablen (`.env.example` im Repo, keine echten Werte)
  - Leere Gerüste für `apps/ingest`, `apps/admin`, `apps/web`, `apps/mobile` und `packages/shared` für geteilte Typen
  - Migrationswerkzeug eingerichtet, erste leere Migration
  - Strukturierte Logs und OpenTelemetry-Grundkonfiguration im Kern
  - Platzhalter nach D-015 als Konfiguration angelegt (`.env.example`, Seed-Daten mit `PLACEHOLDER_HQ`)
  - Linting, Formatierung, Testrunner, ein Beispieltest
  - CI auf GitHub Actions: bei jedem Push Lint und Tests
  - README mit lokalem Start in wenigen Befehlen
- **Fertig, wenn:** CI ist grün, `README` beschreibt den Start, Eintrag in `STATUS.md`.

## T-002 Vorschlag Datenmodell v0

- **Status:** erledigt
- **Bezug:** AP 0.4, AP 0.6, R-06, R-11
- **Ziel:** Ein Entwurf des Datenmodells, den die Planung prüfen kann. Noch keine Migration.
- **Umfang:**
  - Entitäten: Fahrzeug, Aggregat, Sensor, Kalibrierung, Kunde, Fahrer, Vertrag, Miete, Übergabe, Messreihe, Alarm, Abweichung, Rechnung, AuditEvent
  - Statusmodelle für Fahrzeug, Miete, Kunde, Fahrer, Abweichung mit erlaubten Übergängen
  - Je Entität: GDP-relevant ja/nein, Aufbewahrungsfrist offen lassen, wenn unbekannt
  - Standort, Region und Mandant überall dort, wo sie hingehören (D-003, D-011)
  - Entscheidungen D-004 bis D-011 berücksichtigen: Fahrer gehören zu Kunden, Fahrtenschreiber als Fahrzeugmerkmal mit Buchungsregel, Gewicht und Führerscheinklasse als Daten, Temperaturprofile konfigurierbar, nur Firmenkunden
  - Je Entität: erwartete Menge bei 1.000 Mieten pro Tag und welche Indizes und Partitionen das braucht
  - Ablage als `docs/datenmodell.md` mit einem Mermaid-Diagramm
- **Fertig, wenn:** Datei liegt vor, offene Punkte stehen als Fragen in `STATUS.md`.

## T-003 Telematik-Simulator und Eingang

- **Status:** offen
- **Bezug:** AP 1.2, D-003, D-012, D-015, R-11
- **Ziel:** Ohne echtes Fahrzeug den kompletten Datenweg testen: Fahrzeug sendet → Eingang → Warteschlange → unveränderbare Messreihe.
- **Umfang:**
  - `apps/ingest`: nimmt Nachrichten an, prüft Format und Signatur, vergibt keine eigenen IDs (die Nachricht bringt eine eindeutige ID mit), schreibt in die Warteschlange, antwortet schnell
  - Verarbeiter im Kern: liest aus der Warteschlange, erkennt Duplikate, schreibt Fahrzeugdaten und Temperaturwerte in TimescaleDB-Hypertables (nur anhängen, kein Update, kein Delete)
  - Herstellerneutrales Adapter-Format; Simulator als erster Adapter
  - Simulator (`tools/simulator`): beliebig viele virtuelle Fahrzeuge, Temperaturprofile 2–8 °C und 15–25 °C, Türöffnungen, Funklöcher mit Nachlieferung, Ausreißer für Alarmtests
  - Lasttest-Modus: 4.000 Fahrzeuge, 1 Nachricht pro Minute je Fahrzeug, Ergebnis in `STATUS.md`
- **Fertig, wenn:** Tests grün; Lasttest-Ergebnis dokumentiert; Nachrichten gehen bei Neustart von Eingang oder Verarbeiter nicht verloren und werden nicht doppelt gespeichert.
