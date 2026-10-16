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
| `apps/core` | Kern: Backend + Datenbank (NestJS + Fastify, Drizzle/PostgreSQL+TimescaleDB). Gesundheits-Endpunkte, Config aus Env, Logs, OpenTelemetry. |
| `apps/ingest` | Telematik-Eingang (eigener Prozess, schreibt nur in die Warteschlange). *Gerüst, Ausbau in T-003.* |
| `apps/admin` | Interne Admin-Oberfläche (Next.js). *Gerüst.* |
| `apps/web` | Öffentliche Website + Kundenportal (Next.js), ohne Schreibzugriff auf GDP-Daten. *Gerüst.* |
| `apps/mobile` | App für Fahrer (React Native/Expo). *Gerüst.* |
| `packages/shared` | Geteilte Typen für alle Pakete. |

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
