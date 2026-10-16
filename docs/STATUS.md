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

**T-002 Vorschlag Datenmodell v0 – erledigt.**

Erledigt:
- `docs/datenmodell.md` als Vorschlag (keine Migration): alle geforderten
  Entitäten inkl. Statusmodelle (Fahrzeug, Miete, Kunde, Fahrer, Abweichung) mit
  erlaubten Übergängen, GDP-Flag je Entität, Mandant/Standort/Region (D-003/D-011),
  Berücksichtigung von D-004–D-011, Mengengerüst und Indizes/Partitionen bei
  1.000 Mieten/Tag, ER- und State-Diagramme in Mermaid.

Offen:
- Echter erster CI-Lauf auf GitHub Actions wird nach dem Push bestätigt
  (lokal mit identischen Befehlen bereits grün).
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
