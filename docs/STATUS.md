# Status

Gepflegt von Claude Code. Neueste Einträge oben.

## Vorlage

```
### JJJJ-MM-TT – T-xxx
Erledigt:
Offen:
Fragen an Planung:
```

---

### 2026-10-16 – Temperaturnachweis v1

**Hinweis an die Planung:** Auch diese Aufgabe stand noch nicht in `TASKS.md`.
Tom hat sie beauftragt, nachdem die Freigabe des Datenmodells (T-002) aktuell
nicht möglich ist und die Fahrzeugakte daran hängt. Der Temperaturnachweis läuft
unabhängig vom offenen Datenmodell (nutzt die Messreihe aus T-003). **Bitte als
Aufgabe (z. B. T-005) formal in `TASKS.md` aufnehmen.** Vorgabe von Tom:
„Hauptsache wir kommen weiter und alles möglichst modular, Formate etc. ohne
Weiteres änderbar."

**Temperaturnachweis v1 – erledigt.**

Gebaut (Kern-API, Schnittstelle zuerst):
- `GET /v1/temperaturnachweis` berechnet den Nachweis (Kennzahlen min/max/mittel,
  Grenzverletzungen ggü. Temperaturprofil, Lücken/Funklöcher, Signatur) und gibt
  JSON zurück. `POST` erzeugt + rendert + legt ab und gibt die Referenz zurück
  (auditiert, auf dem T-004-Fundament; Rollen gesetzt).
- **Modular** (Toms Vorgabe): austauschbar über Interfaces —
  `NachweisRenderer` (Format; v1 JSON, PDF/CSV später als weiterer Renderer),
  `BerichtSpeicher` (Ablage; v1 In-Memory, S3/MinIO als Austausch) und
  `Signierer` (Fälschungssicherheit; v1 HMAC-Platzhalter, später PKI). Wechsel
  erfordert keine Änderung an Service/Controller.
- Berechnung ist eine reine Funktion (`berechneNachweis`) → gut testbar; DB-Zugriff
  gefiltert nach Fahrzeug/Messgröße/Zeit mit Reihenfolge (D-003: nie unbegrenzt).
- **Tests:** Unit grün in CI (Berechnung inkl. Grenzverletzung/Lücke/leer/Signatur,
  JSON-Renderer, Registry). Integration lokal gegen den Stack grün: Messwerte
  eingefügt → Nachweis mit Grenzverletzung, Lücke und Signatur, abgelegt.

Bewusste Entscheidungen/Abkürzungen (bis Go-live bzw. Planungs-Freigabe):
- **Bezug Fahrzeug + Zeitraum**, noch nicht Miete (Miete gehört zum offenen
  Datenmodell T-002). Bindung an Miete folgt nach Freigabe – API-Form bleibt.
- **Temperaturprofile aus Konfiguration** (`KonfigProfilQuelle`, Profile 2–8/
  15–25 °C, D-008), nicht aus einer DB-Tabelle, um das Datenmodell (F-4) nicht
  vorwegzunehmen. Quelle ist ein Interface → später DB-gestützt ohne Umbau.
- **Ablage v1 In-Memory**: Der produktive Weg ist S3/MinIO (D-003). Die
  `S3BerichtSpeicher`-Implementierung steckt man über dasselbe Interface ein;
  das MinIO-Image ließ sich in dieser Umgebung derzeit nicht ziehen (Registry
  verweigert), daher S3 noch nicht integrationsgetestet.
- **Ausgabeformat v1 JSON**; PDF ist ein weiterer Renderer (bewusst später).
- Signatur-Schlüssel ist ein gemeinsamer HMAC-Platzhalter (D-015).

Fragen an Planung:
- **F-15:** Pflichtinhalte/Layout des Nachweises für die QA-Abteilungen der
  Kunden (was muss drin sein, welches Format – PDF?), damit v2 passt?
- **F-16:** Wird der Nachweis je Miete automatisch nach Rückgabe erzeugt und dem
  Kunden zugestellt (Roadmap-Verkaufsargument) – welcher Auslöser/Kanal?
- Weiterhin: F-2 (Aufbewahrung) betrifft auch die Nachweis-Ablage; F-4
  (Temperaturprofil als Entität).

---

### 2026-10-16 – T-004 (Rollen + Audit Trail)

**Hinweis an die Planung:** Diese Aufgabe stand noch nicht in `TASKS.md`. Tom
hat sie in der Umsetzungs-Session beauftragt (nächster Roadmap-Schritt, Phase 0:
„Rollen, Audit Trail"; zugleich CLAUDE.md „ab dem ersten Commit Pflicht"). Ich
lege in `TASKS.md` regelkonform selbst keine Aufgaben an – **bitte T-004 dort
formal mit Akzeptanzkriterien aufnehmen.** Gebauter Scope und Akzeptanz siehe
unten.

**T-004 Rollen + Audit Trail – erledigt (Fundament).**

Erledigt:
- **Authentifizierung** (`apps/core/src/auth`): Keycloak-Zugriffstoken (JWT)
  werden geprüft (RS256 über JWKS des Issuers, Issuer + Ablauf). Daraus entsteht
  der `Principal` (Akteur, Rollen, optional Mandant aus Claim `mandant_id`).
  Der Key-Resolver ist injizierbar → ohne echten Keycloak testbar.
- **Autorisierung**: Rollenmodell in `@rent2cool/shared` (admin, ops, dpo,
  qa_approver, kunde_dispo, kunde_qa, fahrer – deckungsgleich mit dem
  Keycloak-Realm). `JwtAuthGuard` + `RolesGuard` **global** via `APP_GUARD`
  erzwungen; `@Public()` nur für `/health*`, `@Roles(...)` je Route.
- **Audit Trail**: Migration `0002_audit` legt `audit_event` an (append-only
  per Trigger). `AuditService.protokolliere()` für präzise alt/neu-Einträge aus
  dem Fachmodul; `AuditInterceptor` als Backstop protokolliert jede erfolgreiche
  `@Audited(...)`-Route **vor** der Antwort (kein Verlust).
- **Nachweis**: geschützter, auditierter Demo-Endpunkt
  `POST /v1/admin/audit-demo` (Rolle `admin`). Klar als temporär markiert
  (TODO), nimmt das noch offene Datenmodell (T-002) nicht vorweg.
- **Tests:** Unit grün in CI (JWT-Verifikation inkl. Ablauf/Issuer/Rollenfilter,
  RolesGuard, AuditService). Integration lokal gegen den Stack grün (5 Tests):
  `/health` bleibt öffentlich (200), ohne Token 401, falsche Rolle 403, admin
  202 **mit geschriebener Audit-Zeile** (korrekter Akteur, neuer Wert),
  `audit_event` lehnt UPDATE ab (append-only).

Offen / Abkürzungen bis Go-live:
- Der **Demo-Endpunkt** ersetzt noch kein echtes GDP-Modul; er wird mit der
  ersten Fachfunktion (z. B. Fahrzeugakte) abgelöst. Die automatische
  Audit-Protokollierung ist dort je schreibender Aktion über `@Audited` bzw.
  `AuditService` anzuwenden.
- **Mandant im Audit** kommt aus dem Token-Claim `mandant_id` (noch Platzhalter,
  hängt an F-1). `audit_event.mandant_id` ist bewusst `text`, damit der
  Audit-Sink nie am Claim-Format scheitert.
- `audit_event` wächst stark (jede Schreibaktion); Partitionierung/Retention wie
  bei `messwert` später als Policy (F-2).

Fragen an Planung:
- **F-13:** Verbindlicher Katalog der Audit-`aktion`-Werte und `entitaet_typ`-
  Namen (für auswertbare, revisionssichere Audit-Trails)?
- **F-14:** Soll auch **lesender** Zugriff auf besonders sensible GDP-Daten
  auditiert werden (Zugriffsprotokoll), oder nur schreibender?
- Weiterhin offen: F-1 (Mandantenbegriff) bestimmt `mandant_id` im Audit.

---

### 2026-10-16 – T-003

**T-003 Telematik-Simulator und Eingang – erledigt.**

Gebauter Datenweg: Simulator → Eingang (`apps/ingest`) → Warteschlange
(Kafka/Redpanda) → Verarbeiter (Kern) → unveränderbare Messreihe
(TimescaleDB-Hypertable).

Erledigt:
- **Neutrales Adapter-Format + Signatur** in `packages/shared`
  (`telemetry.ts`): Zod-Schemas, HMAC-SHA256 über die exakte Payload, reine
  Prüffunktion. Schlüssel ist Platzhalter bis Anbieterwahl (D-015).
- **`apps/ingest`** (Fastify, eigener Prozess): nimmt Nachrichten an, prüft
  Format (400) und Signatur (401), vergibt **keine eigenen IDs**, schreibt nur
  in die Warteschlange (keyed nach `fahrzeugId`), antwortet mit 202. Health/
  Readiness vorhanden. `publish` ist injizierbar → ohne Kafka testbar.
- **Verarbeiter im Kern** (`apps/core/src/telemetry`): Kafka-Consumer liest aus
  `telemetry.raw`, erkennt Duplikate über `nachrichtId` und schreibt Messwerte
  append-only in die Hypertable `messwert`. Dedup-Eintrag und Messwerte in
  **einer Transaktion** (atomar) → at-least-once + idempotent = effektiv
  exactly-once-Speicherung. Consumer über `TELEMETRY_CONSUMER_ENABLED`
  schaltbar (aus in Tests/CI).
- **Migration `0001_telemetrie`**: `messwert` als TimescaleDB-Hypertable
  (Tages-Chunks), Dedup-Ledger `telemetrie_nachricht`, Indizes, und ein
  **Append-only-Trigger** (UPDATE/DELETE je Zeile werden abgewiesen).
- **`tools/simulator`**: virtuelle Fahrzeuge (Profile 2–8 °C und 15–25 °C,
  D-008), Türöffnungen, **Funklöcher mit Nachlieferung**, **Ausreißer** für
  Alarmtests, gezielte Duplikate; Lasttest-/Burst-Modus mit Durchsatzmessung.
- **Tests:** Unit grün in der CI (shared Signatur/Format, Eingang 202/400/401,
  Simulator-Generator). Integration lokal gegen den Stack grün (Dedup:
  zweimal dieselbe Nachricht → 1× gespeichert, 2× Duplikat; Append-only:
  UPDATE wird abgewiesen).

**Lasttest-Ergebnis (lokaler Docker-Stack, Einzelinstanz je Dienst):**
- Eingang: 8.389 Nachrichten (8.000 eindeutig + 389 Duplikate, 10 %
  Funkloch-Anteil) in 5,9 s angenommen, 0 abgelehnt, 0 Fehler →
  **~1.400 Nachrichten/s** Annahmedurchsatz (bis ~1.740/s im reinen Senden).
- Verarbeiter: 8.000 eindeutige Nachrichten → **80.000 Messwerte** in ~26 s
  gedrängt (**~300 Nachr./s** Schreibpfad, Einzel-Consumer). Die 389 Duplikate
  wurden verworfen (keine Doppelspeicherung).
- Einordnung D-003: Eine Minute Last von 4.000 Fahrzeugen = 4.000 Nachrichten;
  Annahme in ~2,3 s, Verarbeitung in ~13 s – also weit unter 60 s, klare
  Reserve. Skaliert horizontal über mehr Consumer auf den 6 Partitionen
  (zustandslos) und mehr Partitionen.

**Verlustfreiheit / keine Doppelung bei Neustart (nachgewiesen):**
- Eingang aus → 4.000 Nachrichten gesendet, in Kafka gehalten, DB blieb 0
  (nichts verloren, nichts verarbeitet).
- Verarbeiter gestartet, mitten im Drain **hart gekillt** (`kill -9` bei
  635/4.000), neu gestartet → Endstand exakt **4.000 Nachrichten / 40.000
  Messwerte / 4.000 eindeutige IDs / 0 Nachrichten mit ≠10 Werten**. Kein
  Verlust, keine Doppelung.
- Der Eingang ist zustandslos (schreibt nur in Kafka); ein Neustart verliert
  nichts bereits Angenommenes. In-flight-HTTP-Anfragen während eines
  Eingang-Absturzes bekommen kein 202 und werden vom Client (App/Simulator)
  wiederholt.

Offen / Abkürzungen bis Go-live (in der Reihenfolge der Dringlichkeit):
- **Kompression + Aufbewahrung** der Hypertable noch nicht als Policy gesetzt
  (hängt an den Fristen, Frage F-2). Beim Aktivieren der Kompression ist der
  Append-only-Trigger zu berücksichtigen (Timescale re-komprimiert intern).
- **Alarme** (Temperatur außerhalb Profil, Tür offen, Funkloch, Grenzübertritt
  ohne Tacho) werden noch nicht erzeugt/gespeichert – der Simulator liefert
  bereits Ausreißer dafür. Eigene Aufgabe (Alarmauswertung, Abweichungen).
- **Signatur-Schlüsselverwaltung**: aktuell ein gemeinsamer HMAC-Platzhalter
  (D-015). Für echte Boxen pro-Gerät-Schlüssel/PKI nötig.
- Reihenfolge je Fahrzeug ist über Partition-Key `fahrzeugId` gewahrt; eine
  echte Mehr-Consumer-Messung steht noch aus (Einzel-Consumer getestet).

Fragen an Planung:
- **F-11:** Welche Messgrößen/Einheiten sind verbindlich (Katalog)? Aktuell
  frei als Text (`temperatur_laderaum`, `position_lat`, …). Soll das ein
  festes Enum/Register werden?
- **F-12:** Soll der Eingang zusätzlich pro Gerät authentifizieren (mTLS/Token)
  oder reicht die HMAC-Signatur der Nachricht?
- Weiterhin offen aus T-002: F-2 (Aufbewahrungsfristen) betrifft direkt die
  Hypertable-Retention.

---

### 2026-10-16 – T-001, T-002

**T-001 Repo-Grundgerüst – erledigt.**

Erledigt:
- Monorepo (pnpm Workspaces + Turborepo, TypeScript strikt, D-001): `apps/core`,
  `apps/ingest`, `apps/admin`, `apps/web`, `apps/mobile`, `packages/shared`.
  Die vier letztgenannten Apps sind bewusst leere Gerüste (Ausbau in eigenen
  Aufgaben; `apps/ingest` in T-003).
- `apps/core` als lauffähiges NestJS-Grundgerüst mit Fastify-Adapter:
  Liveness `GET /health` und Readiness `GET /health/ready`, Konfiguration
  ausschließlich aus Env mit Zod-Validierung (startet nur mit gültiger Env),
  strukturierte JSON-Logs (pino) und OpenTelemetry-Grundkonfiguration (nur aktiv,
  wenn `OTEL_EXPORTER_OTLP_ENDPOINT` gesetzt ist).
- `docker-compose.yml`: PostgreSQL+TimescaleDB, Redpanda (Kafka-API), Valkey,
  MinIO (+ Bucket-Setup), Keycloak (Realm-Import). Ein Befehl: `pnpm stack:up`.
- Migrationswerkzeug (drizzle-kit) eingerichtet, erste **leere** Baseline-Migration
  `0000_baseline` (Schema folgt erst nach T-002-Freigabe). Runner `db:migrate`.
- Platzhalter nach D-015 als Konfiguration: `.env.example` (nur lokale
  Platzhalterwerte, keine echten Secrets; Domain `rent2cool.example`), Seed mit
  `PLACEHOLDER_HQ` und `PLACEHOLDER_DPO`.
- ESLint + Prettier + Vitest, Beispieltests (Health-Controller, Platzhalter-Seed,
  `shared`). GitHub-Actions-CI (`.github/workflows/ci.yml`): bei jedem Push
  install → lint → typecheck → test → build.
- README mit lokalem Start in wenigen Befehlen.
- **Lokal verifiziert grün** mit denselben Befehlen wie die CI (install
  `--frozen-lockfile`, lint, typecheck, test: 9 Tests, build) und zusätzlich echter
  App-Boot mit funktionierenden Health-/Readiness-Antworten (JSON, UTC).
- **CI auf GitHub Actions nach dem Push bestätigt grün** (Lauf 38871685328:
  install → lint → typecheck → test → build alle erfolgreich). Akzeptanz-
  kriterium „CI ist grün“ erfüllt.

**T-002 Vorschlag Datenmodell v0 – erledigt.**

Erledigt:
- `docs/datenmodell.md` als Vorschlag (keine Migration): alle geforderten
  Entitäten inkl. Statusmodelle (Fahrzeug, Miete, Kunde, Fahrer, Abweichung) mit
  erlaubten Übergängen, GDP-Flag je Entität, Mandant/Standort/Region (D-003/D-011),
  Berücksichtigung von D-004–D-011, Mengengerüst und Indizes/Partitionen bei
  1.000 Mieten/Tag, ER- und State-Diagramme in Mermaid.

Offen:
- Aufbewahrungsfristen GDP/Steuer offen gelassen (siehe Fragen F-2).
- Abkürzung/Technische Schuld bis Go-live: Readiness prüft derzeit nur, dass die
  Konfiguration geladen ist – echte Checks auf DB/Warteschlange/Objektspeicher
  kommen mit den jeweiligen Modulen. OIDC/Keycloak-Realm, Identitätsprüfung,
  Signatur und Zahlung sind Platzhalter/Fakes (D-015).
- T-003 noch nicht begonnen (wie beauftragt).

Fragen an Planung (aus T-002, Details in `docs/datenmodell.md` Abschnitt 7):
- **F-1 Mandantenbegriff:** `mandant_id` = Betreiber (so vorgeschlagen) oder =
  Firmenkunde?
- **F-2 Aufbewahrungsfristen:** Fristen für GDP-Nachweise (Messreihe, Kalibrierung,
  Übergabe, Alarm, Abweichung, AuditEvent) und für Rechnungen (Steuerrecht, R-63)?
- **F-3 Fahrer-Personendaten:** zulässiger Umfang, Speicherdauer und Löschkonzept
  (Datenminimierung; abhängig vom DSB, D-015-Platzhalter `dpo`)?
- **F-4 Temperaturprofil** als eigene Entität (nötig wegen D-008) ok?
- **F-5 Aggregat ↔ Fahrzeug:** fest verbaut (1:1) oder wechselnder Aufbau mit
  Historie (1:n über Zeit)?
- **F-6 Messreihe-Dedup:** separater Dedup-Ledger oder Unique-Constraint auf
  `(nachricht_id, messgroesse)`? (betrifft auch T-003)
- **F-7 Rechnung ↔ Miete:** 1:1 oder Sammelrechnung?
- **F-8 Alarm-Volumen:** erwartete Rate – normale Tabelle oder zeit-partitioniert?
- **F-9 Region/EU-Zonen (D-003):** `region` als Attribut je Datensatz vs. getrennte
  DB je Zone?
- **F-10 Geofence:** einfacher Kreis vs. PostGIS-Polygon mit räumlichem Index?

Außerdem zur Umgebung:
- Beim Sessionstart war kein Repository eingebunden; `TLM97/rent2cool` wurde nach
  Rückfrage nachgezogen. Für künftige Cloud-Sessions das Repo direkt beim Start
  auswählen.

---

### 2026-10-16 – Setup

Erledigt: Repo angelegt, Übergabedateien und CLAUDE.md eingerichtet (durch Planung).
Offen: T-001, T-002.
Fragen an Planung: keine.
