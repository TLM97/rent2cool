# Rent2Cool

Software für den Verleih von Kühltransportern für die Pharmaindustrie.
Ein modularer Monolith (ein Repo, eine Datenbank, ein Deployment) nach den
Entscheidungen in [`docs/DECISIONS.md`](docs/DECISIONS.md).

> Arbeitsweise, Rollen (Planung ↔ Umsetzung) und die nicht verhandelbaren
> GDP-/Validierungsregeln stehen in [`CLAUDE.md`](CLAUDE.md). Status und offene
> Fragen in [`docs/STATUS.md`](docs/STATUS.md), Aufgaben in
> [`docs/TASKS.md`](docs/TASKS.md).

## Monorepo

| Paket                  | Zweck                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/core`            | Kern: Backend + Datenbank (NestJS + Fastify, Drizzle/PostgreSQL+TimescaleDB). Gesundheits-Endpunkte, Config aus Env, Logs, OpenTelemetry, **Telematik-Verarbeiter** (T-003). |
| `apps/ingest`          | Telematik-Eingang (eigener Prozess, prüft Format + Signatur, schreibt nur in die Warteschlange).                                                                             |
| `apps/admin`           | Interne Admin-Oberfläche (Next.js, Keycloak-Login) für Ops und QA – siehe „Admin-Oberfläche".                                                                                |
| `apps/web`             | Öffentliche Website + Kundenportal (Next.js, Port 3003) – siehe „Kundenportal“. Keine Datenbank, kein Dienstkonto (GDP-Grenze).                                              |
| `apps/mobile`          | App für Fahrer (React Native/Expo). _Gerüst._                                                                                                                                |
| `packages/shared`      | Geteilte Typen für alle Pakete (inkl. neutrales Telematik-Format).                                                                                                           |
| `packages/oberflaeche` | Reine Bausteine für Admin und Portal: Kern-API-Client, Formatierung, Formular-, Seiten- und Token-Helfer (ohne React, ohne Node-Module).                                     |
| `tools/simulator`      | Telematik-Simulator: virtuelle Fahrzeuge als erster Adapter, inkl. Lasttest (T-003).                                                                                         |

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

# 3. Infrastruktur starten: PostgreSQL+TimescaleDB, Redpanda, Valkey, SeaweedFS (S3), Keycloak
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

| Dienst               | Adresse               | Hinweis                              |
| -------------------- | --------------------- | ------------------------------------ |
| Kern (API)           | http://localhost:3000 |                                      |
| PostgreSQL/Timescale | localhost:5432        | DB/User `rent2cool`                  |
| Redpanda (Kafka-API) | localhost:19092       |                                      |
| Valkey (Redis-API)   | localhost:6379        | BullMQ                               |
| SeaweedFS (S3-API)   | http://localhost:8333 | Bucket per `objektspeicher-setup`    |
| Mailpit (E-Mail)     | http://localhost:8025 | SMTP localhost:1025, fängt alles ab  |
| Keycloak (OIDC)      | http://localhost:8080 | Realm `rent2cool` (Platzhalter)      |
| Admin-Oberfläche     | http://localhost:3002 | `pnpm --filter @rent2cool/admin dev` |
| Website + Portal     | http://localhost:3003 | `pnpm --filter @rent2cool/web dev`   |

## Nützliche Befehle (Repo-weit)

```bash
pnpm format        # Prettier: formatieren (vor dem Commit)
pnpm format:check  # Prettier: nur prüfen (wie die CI)
pnpm lint          # ESLint über das ganze Repo
pnpm typecheck     # TypeScript prüfen, inkl. Tests (tsconfig.test.json je Paket)
pnpm test          # Vitest (alle Pakete)
pnpm build         # alle Pakete bauen
```

Die CI prüft in dieser Reihenfolge Formatierung, Lint, Typen (auch der Tests),
Tests und Build. `docs/` und `CLAUDE.md` sind von Prettier ausgenommen
(Planungsdateien). Reine Formatierungs-Commits stehen in
`.git-blame-ignore-revs`; lokal einmal
`git config blame.ignoreRevsFile .git-blame-ignore-revs`.

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

Integrationstests (Dedup, Append-only u. v. m.) gegen den laufenden Stack:

```bash
pnpm test:integration
```

Sie nutzen eine **eigene Datenbank** (`rent2cool_test` bzw. `TEST_DATABASE_URL`),
die beim Testlauf angelegt und migriert wird – Entwicklungs- und Demo-Daten
bleiben unberührt. Der Name muss auf `_test` enden. Die CI führt sie mit
einem TimescaleDB-Container aus.

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
  - **Präzise (`@AuditImService`)**: Anlegen, Statuswechsel,
    Stammdaten-Änderungen und Sensortausch schreiben den Eintrag selbst, in
    derselben Transaktion wie die Änderung – beim Anlegen der vollständige
    neue Datensatz, beim Ändern nur geänderte Felder (alt und neu). Statuswechsel laufen
    über einen gemeinsamen Baustein (`apps/core/src/audit/statuswechsel.ts`)
    mit Zeilensperre, damit zwei gleichzeitige Wechsel nicht beide gelingen.
  - **Rückfallebene (`@Audited`)**: nur noch Temperaturnachweis erzeugen und
    der Demo-Endpunkt; ein Interceptor protokolliert die Antwort.
  - Ein Test stellt sicher, dass jede schreibende Route einen der beiden Wege hat.
- **Verlauf**: `GET /v1/audit?entitaetId=…&typ=miete,miete_status` (nur interne
  Rollen; mehrere IDs kommagetrennt, z. B. Fahrzeug und seine Sensoren); die
  Admin-Oberfläche zeigt ihn auf den Detailseiten.

Ein geschützter, auditierter Demo-Endpunkt (`POST /v1/admin/audit-demo`,
Rolle `admin`) weist die Kette Guard → Rolle → Audit nach; er wird ersetzt,
sobald echte GDP-Module existieren.

## Datensichtbarkeit je Kunde (F-41)

Kunden-Logins (`kunde_dispo`, `kunde_qa`) sehen **nur Daten ihres eigenen
Kunden**; interne Rollen sehen ihren Mandanten. Welcher Login zu welchem
Kunden gehört, steht im Kern (`kunde_konto`, gepflegt unter „Kunden → Logins
fürs Kundenportal“, nur `admin`, auditiert) – Keycloak meldet nur an. Ohne
Zuordnung wird abgelehnt, nie „alles“ gezeigt; fremde Datensätze sind „nicht
gefunden“. Zentral in `apps/core/src/auth/zugriff.ts`, von jedem Controller
genutzt, den Kunden erreichen.

- Kunden: eigene Mieten, Rechnungen, Alarme, Abweichungen, Nachweise,
  Schlüssel, Fahrer; Fahrzeugakte nur für Fahrzeuge ihrer Mieten, Position nur
  während der laufenden Miete; buchen nur für sich, als Status nur „storniert“.
- Flottenliste und der freie Nachweis über beliebige Fahrzeuge sind intern.
- `GET /v1/ich` zeigt Rollen und den zugeordneten Kunden.
- Lokal ist `kunde.dev` dem Demo-Kunden „Nordlicht“ zugeordnet (als Verwalter).

### Selbstregistrierung und Organisation (F-51)

Kunden legen ihr Konto selbst an und verwalten ihre Organisation;
Rent2Cool gibt nur frei. Keycloak übernimmt Registrierung und
E-Mail-Bestätigung (lokal landen die Mails in Mailpit,
http://localhost:8025). Die Kundenrollen stehen je Login im Kern
(`kunde_konto.rollen`): `kunde_admin` (verwaltet die Organisation),
`kunde_dispo` (bucht), `kunde_qa` (Nachweise).

| Route                                         | Wer                                   | Was                                                                                   |
| --------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /v1/registrierung`                      | angemeldet, noch ohne Kunde           | Kunde anlegen (Status `in_pruefung`), Login wird Verwalter, Betrieb bekommt eine Mail |
| `GET /v1/organisation`                        | Kundenrollen                          | Firmendaten, Freigabe, Mitglieder, offene Einladungen                                 |
| `PATCH /v1/organisation`                      | `kunde_admin`                         | Firmendaten; Name, HR, USt-ID nach der Freigabe nur durch Rent2Cool                   |
| `POST /v1/organisation/einladungen`           | `kunde_admin`                         | Einladung per E-Mail (7 Tage gültig, nur der Hash des Codes wird gespeichert)         |
| `DELETE /v1/organisation/einladungen/:id`     | `kunde_admin`                         | Einladung widerrufen                                                                  |
| `POST /v1/einladungen/annehmen`               | angemeldet, gleiche bestätigte E-Mail | Einladung einlösen                                                                    |
| `PATCH /v1/organisation/mitglieder/:kontoId`  | `kunde_admin`                         | Rollen ändern (mindestens ein Verwalter bleibt)                                       |
| `DELETE /v1/organisation/mitglieder/:kontoId` | `kunde_admin`                         | Mitglied entfernen                                                                    |

Neue Registrierungen erscheinen in der Admin-Oberfläche auf der Startseite
(„Kunden zur Freigabe“); freigegeben wird wie bisher am Kunden. Alles ist
auditiert und im Verlauf des Kunden sichtbar.

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

- **Format** über `NachweisRenderer`: JSON (für Systeme) und PDF (für Kunde und
  Auditor, eine Seite mit Kurve und Ereignissen); weitere Formate = weiterer Renderer.
- **Speicher** über `BerichtSpeicher` (Objektspeicher, S3-API).
- **Signatur** über `Signierer` (HMAC-Platzhalter, D-015; später PKI).

### Automatisch nach jeder Miete

Der **Berichtsdienst** (BullMQ auf Valkey, D-001; eigenes Modul, später als
eigener Prozess herauslösbar) sucht regelmäßig beendete Mieten ohne Nachweis
(`BERICHT_SUCHE_SEK`, Standard 5 Min.) und erzeugt den Nachweis nach einer
Karenzzeit für nachgelieferte Messwerte (`BERICHT_KARENZ_MIN`, Standard 30).
Eingeschaltet mit `BERICHT_WORKER_ENABLED=true` (in `.env.example` an).

Jeder Nachweis landet **unveränderbar im Archiv** (JSON + PDF im Objektspeicher,
SHA-256 beider Dateien, Daten- und Dokumentsignatur; Datenbank-Trigger
verhindert Änderung und Löschung). Neue Erkenntnisse = neue Version.

- `GET /v1/mieten/:id/temperaturnachweise` — Versionen mit Download-Links.
- `POST /v1/mieten/:id/temperaturnachweise` — neue Version anfordern (Job, 202).
- `GET /v1/temperaturnachweise/:id/pruefung` — **Echtheitsprüfung**: Dateien
  unverändert? Signaturen gültig? Messdaten seitdem unverändert (sonst
  Nachlieferung, z. B. aus einem Funkloch)?

In der Mietakte zeigt die Karte „Temperaturnachweis für den Kunden“ alle
Versionen mit PDF/JSON, Siegel, Zustellung und „Prüfen“.

**Elektronisches Siegel (F-47):** Das PDF trägt eine eingebettete digitale
Signatur, prüfbar in jedem PDF-Programm. Ohne Konfiguration ein zur Laufzeit
erzeugtes **Testsiegel ohne Rechtswirkung**; ein eigenes Zertifikat per
`SIEGEL_P12_BASE64`/`SIEGEL_P12_PASSWORT`; das qualifizierte Siegel eines
Vertrauensdiensteanbieters kommt als weitere Umsetzung von `Siegeldienst`.

**Zustellung (F-46):** Jede neue Version geht per E-Mail mit dem PDF an den
QA-Kontakt des Kunden („E-Mail für Temperaturnachweise“ am Kunden) – als
eigener Job, genau einmal, nie mit veränderter Datei; Ergebnis in der
Mietakte. Lokal fängt **Mailpit** alle Mails ab: http://localhost:8025.
Der Download im Kundenportal nutzt `GET /v1/mieten/:id/temperaturnachweise`.

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

## Kundenportal

Website und Kundenportal (`apps/web`, Next.js, Port 3003). Die Startseite ist
öffentlich (Platzhalter bis Website v1); `/portal` verlangt eine Anmeldung über
**Keycloak** (eigener Client `rent2cool-portal`, Authorization Code + PKCE,
eigene Sitzungs-Cookies `r2c-portal.*` und eigenes Secret – getrennt von der
Admin-Oberfläche).

- **Konto anlegen** öffnet direkt die Keycloak-Registrierung (E-Mail als
  Benutzername, Bestätigung per Mail – lokal in Mailpit). Danach registriert
  der Kunde sein Unternehmen (`/portal/registrierung`) und ist dessen
  Verwalter; Status „in Prüfung“, bis wir freigeben.
- **Unternehmen** (`/portal/organisation`): Firmendaten, Personen mit
  Aufgaben (Verwaltung, Disposition, Qualitätssicherung), Einladungen per
  E-Mail. Firmenname, Handelsregister und USt-ID nach der Freigabe nur
  durch Rent2Cool.
- **Einladung** (`/einladung?code=…`, Link aus der Mail): anmelden oder
  Konto mit der eingeladenen Adresse anlegen, annehmen.
- **Buchen** (`/portal/buchen`, Disposition, erst nach Freigabe): Zeitraum,
  Fahrer, Standort, Auslandsfahrt → buchbare Fahrzeuge aus der
  Verfügbarkeitssuche des Kerns (paginiert) → verbindlich buchen (mit
  Idempotency-Key, der Kern prüft alle Regeln erneut). Stornieren bis
  Mietbeginn auf der Mietseite.
- **Fahrer** (`/portal/fahrer`): Fahrer des Unternehmens mit Status; die
  Disposition legt neue an, Rent2Cool prüft Identität und Führerschein.
- **Mieten & Nachweise**: eigene Mieten (paginiert), je Miete die
  Temperaturnachweise als gesiegeltes PDF und JSON mit SHA-256.
  **Rechnungen**: eigene Rechnungen.

**GDP-Grenze (Vorschlag D-021):** Das Paket hat keine Datenbank und kein
Dienstkonto; jede Anfrage trägt das Token der angemeldeten Person, Rechte,
Sichtbarkeit und Audit Trail setzt der Kern durch. Seiten der öffentlichen
Website sprechen nicht mit der Kern-API – ein Test
(`apps/web/src/lib/gdp-grenze.spec.ts`) prüft beides.

Lokal: `kunde.dev` (Verwalter von „Nordlicht“). Browser-Tests mit echter
Registrierung, Mailbestätigung und Einladung: `pnpm --filter @rent2cool/web
test:e2e` (braucht Keycloak, Mailpit, Kern und Portal).

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

### Buchung mit Suche

Buchen in vier Schritten: **Kunde suchen** (Teil des Firmennamens, nur
freigegebene) → **Zeitraum, Fahrer, Auslandsfahrt, optional Kennzeichen** →
**buchbare Fahrzeuge** im Zeitraum → **bestätigen**. Die Fahrzeugsuche
(`GET /v1/fahrzeuge/verfuegbar`) wendet dieselben Regeln an wie die Buchung:
verfügbar, gültig kalibriert zum Mietbeginn, Fahrtenschreiber bei
Auslandsfahrt, vom Fahrer abgedeckte Klasse, keine Überschneidung. Sie läuft
als eine Abfrage mit Blättern im Kern und trägt damit auch bei 4.000
Fahrzeugen (D-003). Läuft eine Kalibrierung während der Miete ab, zeigt die
Trefferliste einen Hinweis.

### Standorte (D-011)

Unter „Standorte“ pflegt die Rolle `admin` Übergabe- und Rückgabeorte: Adresse,
Geofence (Mittelpunkt + Radius) und Öffnungszeiten als Wochenplan in
Ortszeit (bis zu zwei Zeitfenster je Tag, „rund um die Uhr“ für kontaktlose
Übergabe, D-014). Gelöscht wird nicht; deaktivieren geht nur, wenn kein
Fahrzeug und keine laufende oder künftige Miete den Standort mehr nutzt.
Fahrzeuge haben einen Heimatstandort; in der Buchung wählt man den Abhol- und
Rückgabestandort, die Suche zeigt dann nur dessen Fahrzeuge und weist auf
Abholung oder Rückgabe außerhalb der Öffnungszeiten hin.

### Übergabebereich (D-011, D-014)

Steht das Fahrzeug bei Übergabe und Rückgabe im Geofence des Standorts? Der
Kern nimmt die letzte Telematik-Position (Breite und Länge aus derselben
Nachricht, höchstens 24 h zurück, über den Index je Fahrzeug) und vergleicht
sie mit Mittelpunkt und Radius (`packages/shared/src/geo.ts`). Ergebnis:
„im Bereich“, „außerhalb“ (mit Abstand) oder „unbekannt“ mit Grund – kein
Standort, kein Geofence, keine oder eine über 30 Minuten alte Position. Beim
Wechsel auf `aktiv` wird gegen den Abholstandort, beim Wechsel auf `beendet`
gegen den Rückgabestandort geprüft und das Ergebnis an der Miete festgehalten
(im Audit Trail). Heute ist das ein Nachweis und Hinweis, keine Sperre (F-37).

- `GET /v1/fahrzeuge/:id/position[?standortId=]` — letzte Position und
  Prüfung gegen den angegebenen oder den Heimatstandort.
- Fahrzeugakte: Karte „Position“. Mietakte: Übergabe, Rückgabe und bei
  laufender Miete „Jetzt“ mit Hinweis vor dem Beenden.

### Digitaler Schlüssel und Fernzugriff (D-014, Vorschlag D-018)

Jeder Befehl an ein Fahrzeug läuft über den Kern, wird geprüft und
protokolliert – auch abgelehnte Versuche. Ausgeführt wird über die
Schnittstelle `KeyProvider` (`apps/core/src/schluessel/key-provider.ts`), heute
der Simulator (D-015).

- **Schlüssel** je Miete und Fahrer des Mietkunden (Fahrerlaubnis geprüft,
  R-22), gültig ab 1 h vor Mietbeginn bis Mietende; Mietende oder Storno
  widerrufen ihn automatisch; beginnt die Miete nie, endet er mit dem geplanten
  Mietende. `POST/GET /v1/mieten/:id/schluessel`,
  `POST /v1/schluessel/:id/widerruf`.
- **Fahrer (App):** `GET /v1/schluessel/meine`, `POST /v1/schluessel/:id/befehle`
  (Entriegeln, Verriegeln; Pflicht-`idempotencyKey`). Zuordnung des Logins über
  das App-Konto am Fahrer (`kontoId`). Das erste Entriegeln startet die
  bestätigte Miete (kontaktlose Übergabe).
- **Betrieb:** `POST /v1/fahrzeuge/:id/befehle` (Grund Pflicht; Türen Ops und
  Admin, Wegfahrsperre nur Admin), Protokolle `GET /v1/fahrzeuge/:id/befehle`, `GET /v1/mieten/:id/befehle`,
  Status `GET /v1/befehle/:id`.
- Oberfläche: Mietakte „Digitaler Schlüssel“ (ausstellen, widerrufen, Befehle
  der Miete), Fahrzeugakte „Fernzugriff“, App-Konto beim Bearbeiten des Fahrers.

### Übergabe- und Rückgabeprotokoll mit Foto-Check (D-014)

Je Miete ein Übergabe- und ein Rückgabeprotokoll: Pflichtfotos (Front, Heck,
beide Seiten, Laderaum, Kilometerstand/Kühlanzeige), Checkliste,
Kilometerstand, Schäden mit Detailfotos. Pflichtfotos und Checkliste sind
Konfiguration in `packages/shared/src/protokoll.ts`. Abgeschlossen =
unveränderbar (Kern und Datenbank-Trigger).

Fotos gehen **direkt vom Gerät in den Objektspeicher** (D-003), nie durch die
Datenbank: `POST /v1/protokolle/:id/fotos` liefert einen signierten Upload-Link
(15 Min., Dateityp Teil der Signatur), danach prüft
`POST /v1/protokolle/:id/fotos/:fotoId/bestaetigung` Größe, Typ und SHA-256.
Weitere Routen: `POST/GET /v1/mieten/:id/protokolle`, `GET/PATCH
/v1/protokolle/:id`, `POST /v1/protokolle/:id/abschluss`. Schreiben dürfen der
Fahrer (mit Schlüssel zur Miete) und der Betrieb; die QA liest.

In der Mietakte zeigt die Karte „Übergabe- und Rückgabeprotokoll“ Fotos,
Checkliste und Schäden; im Ausnahmeprozess mit Personal protokolliert der
Betrieb dort selbst.

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

## Demo-Daten für Vorführungen

Erfundene, in sich stimmige Daten (D-015): 5 Fahrzeuge (`DEMO-101` …), 3
Kunden mit Zusatz „(Demo)“ und Fahrern, 6 Mieten – abgeschlossen mit
eingehaltener Kühlkette, abgeschlossen mit Temperaturausreißer (Alarme,
Abweichung bewertet und geschlossen), eine laufende mit offenen Alarmen, zwei
künftige –, Rechnungen in verschiedenen Status sowie Fristen-Warnungen
(Kalibrierung, Führerschein).

```bash
docker compose down -v && pnpm stack:up        # frische Datenbank (löscht lokale Daten!)
pnpm --filter @rent2cool/core db:migrate
pnpm --filter @rent2cool/core db:seed           # Platzhalter-Mandant und -Standort
pnpm --filter @rent2cool/core db:seed:demo      # Demo-Daten (einmalig; zweiter Lauf tut nichts)
```

Alles läuft über die echten Services (Regeln, Audit Trail mit Akteur
„Demo-Daten“, Telematik-Verarbeitung, Alarm-Auswertung). Szenarien stehen in
`apps/core/src/db/seed/demo-daten.ts`. Die Integrationstests nutzen eine eigene
Datenbank; die Browser-Tests (`test:e2e`) laufen dagegen gegen den lokalen
Stack und legen dort eigene, klar benannte Testdatensätze an – vor einer
Vorführung also besser nicht ausführen oder danach neu aufsetzen.

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
