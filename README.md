# Rent2Cool

Software für den Verleih von Kühltransportern für die Pharmaindustrie.
Ein modularer Monolith (ein Repo, eine Datenbank, ein Deployment) nach den
Entscheidungen in [`docs/DECISIONS.md`](docs/DECISIONS.md).

> Arbeitsweise, Rollen (Planung ↔ Umsetzung) und die nicht verhandelbaren
> GDP-/Validierungsregeln stehen in [`CLAUDE.md`](CLAUDE.md). Status und offene
> Fragen in [`docs/STATUS.md`](docs/STATUS.md), Aufgaben in
> [`docs/TASKS.md`](docs/TASKS.md).

## Monorepo

| Paket | Zweck |
|---|---|
| `apps/core` | Kern: Backend + Datenbank (NestJS + Fastify, Drizzle/PostgreSQL+TimescaleDB). Gesundheits-Endpunkte, Config aus Env, Logs, OpenTelemetry, **Telematik-Verarbeiter** (T-003). |
| `apps/ingest` | Telematik-Eingang (eigener Prozess, prüft Format + Signatur, schreibt nur in die Warteschlange). |
| `apps/admin` | Interne Admin-Oberfläche (Next.js, Keycloak-Login) für Ops und QA – siehe „Admin-Oberfläche". |
| `apps/web` | Öffentliche Website + Kundenportal (Next.js), ohne Schreibzugriff auf GDP-Daten. *Gerüst.* |
| `apps/mobile` | App für Fahrer (React Native/Expo). *Gerüst.* |
| `packages/shared` | Geteilte Typen für alle Pakete (inkl. neutrales Telematik-Format). |
| `tools/simulator` | Telematik-Simulator: virtuelle Fahrzeuge als erster Adapter, inkl. Lasttest (T-003). |

Werkzeuge: **pnpm Workspaces + Turborepo**, **TypeScript** (strikt) überall.

## Voraussetzungen

- [Node.js 22](https://nodejs.org) und [pnpm 10](https://pnpm.io) (`corepack enable`)
- [Docker](https://www.docker.com) mit Docker Compose (für die lokale Infrastruktur)

## Lokaler Start

```bash
# 1. Abhängigkeiten installieren
pnpm install

# 2. Umgebungsdatei anlegen (nur lokale Platzhalterwerte, keine echten Secrets)
cp .env.example .env

# 3. Infrastruktur starten: PostgreSQL+TimescaleDB, Redpanda, Valkey, MinIO, Keycloak
pnpm stack:up

# 4. Datenbank-Migrationen anwenden (derzeit leere Baseline)
pnpm --filter @rent2cool/core db:migrate

# 5. Kern im Entwicklungsmodus starten
pnpm --filter @rent2cool/core dev
```

Der Kern lauscht dann auf `http://localhost:3000`.

- Liveness: `curl http://localhost:3000/health`
- Readiness: `curl http://localhost:3000/health/ready`

Infrastruktur stoppen: `pnpm stack:down`. Logs: `pnpm stack:logs`.

> In einer Cloud-Session ist Docker installiert, aber eventuell nicht
> gestartet. Falls `docker info` fehlschlägt:
> `sudo dockerd > /tmp/dockerd.log 2>&1 &` und kurz warten (CLAUDE.md).

### Lokale Dienste

| Dienst | Adresse | Hinweis |
|---|---|---|
| Kern (API) | http://localhost:3000 | |
| PostgreSQL/Timescale | localhost:5432 | DB/User `rent2cool` |
| Redpanda (Kafka-API) | localhost:19092 | |
| Valkey (Redis-API) | localhost:6379 | BullMQ |
| MinIO (S3-API) | http://localhost:9000 | Konsole: http://localhost:9001 |
| Keycloak (OIDC) | http://localhost:8080 | Realm `rent2cool` (Platzhalter) |

## Nützliche Befehle (Repo-weit)

```bash
pnpm lint         # ESLint über das ganze Repo
pnpm typecheck    # TypeScript prüfen (alle Pakete)
pnpm test         # Vitest (alle Pakete)
pnpm build        # alle Pakete bauen
pnpm format       # Prettier
```

## Telematik-Pfad (T-003)

Datenweg ohne echtes Fahrzeug:
**Simulator → Eingang (`apps/ingest`) → Warteschlange (Kafka/Redpanda) → Verarbeiter (Kern) → unveränderbare Messreihe (TimescaleDB-Hypertable).**

- Nachrichten sind **herstellerneutral** (`@rent2cool/shared`) und **HMAC-signiert**;
  der Eingang prüft Format und Signatur, vergibt **keine eigenen IDs** und schreibt
  nur in die Warteschlange.
- Der Verarbeiter erkennt **Duplikate** über die mitgelieferte `nachrichtId`
  (idempotent) und schreibt Messwerte **nur anhängend** (kein Update/Delete,
  per DB-Trigger erzwungen).

Lokal ausprobieren (Stack läuft, `.env` vorhanden):

```bash
# DB-Schema anlegen (Hypertable + Dedup-Ledger)
pnpm --filter @rent2cool/core db:migrate

# Topic anlegen
docker compose exec redpanda rpk topic create telemetry.raw -p 6

# Eingang starten (Port 3001)
pnpm --filter @rent2cool/ingest dev

# Verarbeiter im Kern mit aktivem Consumer starten
TELEMETRY_CONSUMER_ENABLED=true pnpm --filter @rent2cool/core dev

# Simulator / Lasttest: 4000 Fahrzeuge, 1 Runde (= 1 Nachricht/Minute je Fahrzeug)
pnpm --filter @rent2cool/simulator start -- --vehicles 4000 --rounds 1 \
  --funkloch-rate 0.1 --duplikat-rate 0.05
```

Integrationstests (Dedup, Append-only) gegen den laufenden Stack:

```bash
RUN_INTEGRATION=1 pnpm --filter @rent2cool/core test
```

Lasttest-Ergebnisse stehen in [`docs/STATUS.md`](docs/STATUS.md).

## Rollen & Audit Trail (T-004)

Fundament für alle GDP-Schreibzugriffe (CLAUDE.md, „nicht verhandelbar"):

- **Authentifizierung**: Alle Routen des Kerns außer `/health*` verlangen ein
  gültiges **Keycloak-Zugriffstoken** (Bearer-JWT, Signatur über JWKS geprüft).
  Aus dem Token entsteht der `Principal` (Akteur, Rollen, Mandant).
- **Autorisierung**: Rollenmodell (`admin`, `ops`, `dpo`, `qa_approver`,
  `kunde_dispo`, `kunde_qa`, `fahrer`); Routen schützen sich mit `@Roles(...)`,
  global erzwungen.
- **Audit Trail**: append-only-Tabelle `audit_event` (per DB-Trigger
  unveränderbar): wer (Konto-ID, Anmeldename, alle Rollen), wann, was, alter
  und neuer Wert. Zwei Wege:
  - **Präzise (`@AuditImService`)**: Statuswechsel, Stammdaten-Änderungen und
    Sensortausch schreiben den Eintrag selbst – nur geänderte Felder, alt und
    neu, in derselben Transaktion wie die Änderung. Statuswechsel laufen
    über einen gemeinsamen Baustein (`apps/core/src/audit/statuswechsel.ts`)
    mit Zeilensperre, damit zwei gleichzeitige Wechsel nicht beide gelingen.
  - **Rückfallebene (`@Audited`)**: übrige schreibende Routen (z. B. Anlegen)
    protokolliert ein Interceptor vor der Antwort.
  - Ein Test stellt sicher, dass jede schreibende Route einen der beiden Wege hat.
- **Verlauf**: `GET /v1/audit?entitaetId=…&typ=miete,miete_status` (nur interne
  Rollen); die Admin-Oberfläche zeigt ihn auf den Detailseiten.

Ein geschützter, auditierter Demo-Endpunkt (`POST /v1/admin/audit-demo`,
Rolle `admin`) weist die Kette Guard → Rolle → Audit nach; er wird ersetzt,
sobald echte GDP-Module existieren.

## Temperaturnachweis v1

Das zentrale Verkaufsargument: ein lückenloser, fälschungssicherer
Temperaturnachweis aus der Messreihe (T-003). API im Kern (Schnittstelle
zuerst):

- `GET /v1/temperaturnachweis?fahrzeugId=…&von=…&bis=…&profil=2-8` — berechnet
  den Nachweis (Kennzahlen, Grenzverletzungen ggü. Profil, Lücken/Funklöcher,
  Signatur) und gibt ihn als JSON zurück. Rollen: `ops`, `admin`, `kunde_qa`,
  `kunde_dispo`.
- `POST /v1/temperaturnachweis?…&format=json` — erzeugt, rendert und **legt den
  Nachweis ab**, gibt die Referenz zurück. Rollen: `ops`, `admin`; auditiert.

**Modular** aufgebaut, damit Formate und Ablage ohne Umbau wechselbar sind:
- **Format** über `NachweisRenderer` (v1: JSON; PDF/CSV = weiterer Renderer).
- **Speicher** über `BerichtSpeicher` (v1: In-Memory; S3/MinIO als Austausch).
- **Signatur** über `Signierer` (v1: HMAC-Platzhalter, D-015; später PKI).

> v1 bezieht sich auf **Fahrzeug + Zeitraum**; sobald die Entität *Miete*
> freigegeben ist (Datenmodell T-002), wird der Nachweis an eine Miete gebunden.

## Fahrzeugakte

Digitale Stammakte jedes Kühltransporters und Grundlage für Telematik-Zuordnung,
Buchung und Temperaturnachweis. Entitäten: **Fahrzeug**, **Aggregat**
(Kühlaufbau), **Sensor**, **Kalibrierung** (EN 12830) – dazu die
Stammdaten-Basis **Mandant** und **Standort** (D-011, Platzhalter `PLACEHOLDER_HQ`).

API im Kern (rollengeschützt, Schreibzugriffe auditiert – T-004):
- `POST /v1/fahrzeuge` — Akte anlegen (optional mit Aggregat + Sensoren). `ops`/`admin`.
- `GET /v1/fahrzeuge` — paginierte Liste (Filter: Status, Standort).
- `GET /v1/fahrzeuge/:id` — vollständige Akte (Aggregate + Sensoren).
- `POST /v1/fahrzeuge/:id/status` — Statuswechsel mit geprüften Übergängen
  (Statusmodell in `@rent2cool/shared`).
- `POST /v1/sensoren/:sensorId/kalibrierungen` — Kalibrierung erfassen.
- `GET /v1/fahrzeuge/:id/buchbarkeit` — ist das Fahrzeug buchbar? (nur
  `verfuegbar` **und** jeder Sensor gültig kalibriert).
- `GET /v1/fahrzeuge/faellige-kalibrierungen?bis=…` — Fristenüberwachung.

**Fristen (GDP):** Ein Messwert ist nur beweiskräftig, wenn der Sensor gültig
kalibriert ist. Läuft die Kalibrierung ab, ist das Fahrzeug nicht mehr buchbar.

## Kunden & Fahrer

Firmenkunden (D-010) und ihre Fahrer (gehören zum Kunden, D-004). Kernfunktion
ist die **Fahrerlaubnis-Prüfung (R-22)**: Status, Führerschein-Gültigkeit und
Klasse gegen das Fahrzeuggewicht.

API im Kern (rollengeschützt, Schreibzugriffe auditiert):
- `POST /v1/kunden`, `GET /v1/kunden` (paginiert), `GET /v1/kunden/:id`,
  `POST /v1/kunden/:id/status` (geprüfte Übergänge).
- `POST /v1/kunden/:kundeId/fahrer`, `GET /v1/kunden/:kundeId/fahrer`.
- `POST /v1/fahrer/:id/status`.
- `GET /v1/fahrer/:id/einsatzbereit?fahrzeugId=…` — darf der Fahrer dieses
  Fahrzeug fahren? (freigegeben **und** Führerschein gültig **und** Klasse deckt
  die geforderte Klasse).
- `GET /v1/fahrer/faellige-fuehrerscheine?bis=…` — Fristenüberwachung (Sperre bei
  Ablauf).

> Statusmodelle und Führerscheinklassen-Abdeckung liegen in
> `@rent2cool/shared`. Fahrerdaten sind personenbezogen – nur erfundene
> Testdaten, solange der DSB ein Platzhalter ist (D-015).

## Buchung/Miete

Bringt Fahrzeugakte und Kunden/Fahrer zusammen (D-009). Beim Anlegen prüft der
Kern die **Buchungsregeln** und bestätigt bei Erfolg:
- Kunde ist `freigegeben` (D-010),
- Auslandsfahrt ⇒ nur Fahrzeuge mit Fahrtenschreiber (D-006),
- Fahrzeug buchbar (verfügbar + gültige Kalibrierung),
- zugewiesener Fahrer einsatzbereit (R-22),
- keine Doppelbuchung im Zeitraum.

Buchungen sind **idempotent** über `idempotencyKey` (D-003). Der
**Temperaturnachweis** lässt sich direkt an eine Miete binden.

API im Kern (rollengeschützt, auditiert):
- `POST /v1/mieten` — buchen (Regelprüfung + Bestätigung; idempotent).
- `GET /v1/mieten` (paginiert, Filter), `GET /v1/mieten/:id`.
- `POST /v1/mieten/:id/status` — Status (geprüfte Übergänge; setzt
  Ist-Zeiten bei `aktiv`/`beendet`).
- `GET /v1/mieten/:id/temperaturnachweis` — Nachweis für Fahrzeug + Zeitfenster
  der Miete.

## Rechnung

Rechnung aus einer **beendeten Miete** (R-63). Beträge in ganzen Cent;
Umsatzsteuer über konfigurierbaren Satz (`RECHNUNG_STEUERSATZ`, Standard 19 %,
vom Steuerberater zu bestätigen). **Fortlaufende Rechnungsnummer** je Mandant und
Jahr (`JAHR-00001`, atomar vergeben). Eine Rechnung je Miete (v1).

API im Kern (rollengeschützt, auditiert):
- `POST /v1/rechnungen` — Rechnung zu einer Miete (Netto in Euro; Steuer/Brutto
  berechnet). `ops`/`admin`.
- `GET /v1/rechnungen` (paginiert, Filter), `GET /v1/rechnungen/:id`.
- `POST /v1/rechnungen/:id/status` — `entwurf → gestellt → bezahlt`, bzw.
  `storniert`. Beim Stellen wird die Miete auf `abgerechnet` gesetzt.

## Alarme & Abweichungen

Der Telematik-Verarbeiter wertet jede neu gespeicherte Nachricht gegen das
Temperaturprofil des Fahrzeugs aus (D-008) und legt **Alarme** an
(Temperatur über/unter Grenze, Tür offen). Idempotent: dieselbe Nachricht erzeugt
denselben Alarm nie doppelt. Die Auswertung ist best-effort und blockiert die
Ingestion nicht.

Aus Alarmen (oder Mieten/Fahrzeugen) entstehen **GDP-Abweichungen** mit
CAPA-Verfahren (`erfasst → in_bewertung → bewertet → massnahmen_offen →
geschlossen`, bzw. `verworfen`), bearbeitet von `qa_approver`.

API im Kern (rollengeschützt, Schreibzugriffe auditiert):
- `GET /v1/alarme` (paginiert, Filter Status/Fahrzeug/Miete), `GET /v1/alarme/:id`,
  `POST /v1/alarme/:id/quittieren`, `POST /v1/alarme/:id/schliessen`.
- `POST /v1/abweichungen`, `GET /v1/abweichungen`, `GET /v1/abweichungen/:id`,
  `POST /v1/abweichungen/:id/status` (inkl. Bewertung/Maßnahmen, Rolle
  `qa_approver`).

## Admin-Oberfläche

Interne Oberfläche für Gründer, Ops und QA (`apps/admin`, Next.js, Port 3002).
Anmeldung über **Keycloak** (Authorization Code + PKCE); Zugang nur mit interner
Rolle (`admin`, `ops`, `qa_approver`, `dpo`). Die Oberfläche spricht
ausschließlich serverseitig mit der Kern-API – Rechte und Audit Trail setzt der
Kern durch.

Bereiche: Übersicht (Kennzahlen, offene Alarme, fällige Kalibrierungen),
Fahrzeuge inkl. Akte/Buchbarkeit/Statuswechsel, Kunden & Fahrer inkl.
Führerschein-Fristen, Mieten inkl. Temperaturnachweis, Rechnungen, Alarme
(quittieren/schließen), Abweichungen – jeweils mit Formularen (siehe unten).

```bash
pnpm stack:up                                   # u. a. Keycloak mit Realm-Import
pnpm --filter @rent2cool/core db:migrate
pnpm --filter @rent2cool/core dev               # Kern auf :3000
pnpm --filter @rent2cool/admin dev              # Oberfläche auf http://localhost:3002
```

Lokale Testnutzer (nur erfundene Konten, D-015): `admin.dev`, `ops.dev`,
`qa.dev`, `kunde.dev` (kein Zugang), Passwort `PLACEHOLDER_dev_passwort`.

Browser-Test gegen den laufenden Stack (nicht Teil der CI):
`pnpm --filter @rent2cool/admin test:e2e`

### Formulare

Anlegen und Bearbeiten für den ganzen Ablauf: Fahrzeug anlegen → Kalibrierung
erfassen → Kunde anlegen und freigeben → Fahrer anlegen und freigeben →
Buchung anlegen → Mietstatus → Rechnung erstellen, stellen, bezahlt →
Abweichung erfassen und bewerten.

Aufbau (bewusst austauschbar):

- **Eingaberegeln** liegen einmal in `packages/shared/src/eingaben.ts` (Zod).
  Kern und Oberfläche prüfen mit denselben Schemas – eine Regel ändern heißt,
  sie an einer Stelle ändern.
- **Feldbausteine** in `apps/admin/src/components/formular.tsx` (`Feld`,
  `Auswahl`, `Haken`, `Textfeld`, `Gruppe`, `FormularRahmen`). Fehler stehen am
  Feld, Eingaben bleiben bei Fehlern erhalten, Doppelabsenden ist gesperrt.
- **Server Actions** in `apps/admin/src/app/(app)/formulare.ts` (Anlegen) und
  `aktionen.ts` (Statuswechsel). Statuswechsel bieten nur die laut
  Statusmodell erlaubten Folgestatus an.
- **Formate** in `apps/admin/src/lib/formular.ts`: Eingabe in deutscher
  Ortszeit, Speicherung in UTC (Sommer-/Winterzeit getestet); Beträge mit
  Komma oder Punkt.
- Buchungen tragen je geöffnetem Formular einen Idempotency-Key – doppeltes
  Absenden legt keine zweite Miete an (D-003).

### Stammdaten bearbeiten

Kunde, Fahrer und Fahrzeug lassen sich ändern (`PATCH` im Kern). Anlegen und
Bearbeiten nutzen dieselben Feldgruppen (`apps/admin/src/components/stammdaten.tsx`).
Gespeichert werden nur geänderte Felder, jeweils mit altem und neuem Wert im
Audit Trail. Hat zwischenzeitlich jemand anderes gespeichert, lehnt der Kern ab,
statt zu überschreiben (Vorschlag D-016).

### Sensortausch

In der Fahrzeugakte je eingebautem Sensor „Tauschen“: Der alte Sensor wird
ausgebaut und bleibt mit Kalibrierungen in der Akte, der neue misst ab dem
gleichen Zeitpunkt weiter (`POST /v1/sensoren/:id/tausch`). Die Kalibrierung
des neuen Sensors kann gleich mit erfasst werden – ohne sie ist das Fahrzeug
nicht buchbar. Wiederholte Anfragen sind idempotent.

## Betrieb und Cloud

Lokal mit Docker Compose; der Umzug in die Cloud ist reine Konfiguration
(D-005): nur Standard-Schnittstellen (PostgreSQL, Kafka-API, S3-API,
OpenID Connect), zustandslose Anwendung, Konfiguration aus Umgebungsvariablen.
Infrastruktur als Code (OpenTofu) kommt, sobald der Anbieter feststeht.

## Platzhalter (D-015)

Offene fachliche Punkte blockieren die Entwicklung nicht. Platzhalter sind im
Code und in der Konfiguration an `PLACEHOLDER_` bzw. `TODO(D-015)` erkennbar
(z. B. Standort `PLACEHOLDER_HQ`, Domain `rent2cool.example`) und müssen vor
dem Go-live ersetzt werden.
