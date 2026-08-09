---
title: Getting Started
sidebar_position: 2
---

# Getting Started

This is the one onboarding page a new contributor should read before diving into a feature area.

It covers:

- how to boot Arbiter locally
- what each major part of the repo owns
- how to trace a flow without getting lost
- what to do when the normal seed-based setup is not enough

## Local Setup

Arbiter expects:

- Node.js 22.12.0 or newer, but earlier than Node.js 23
- the `pnpm` version declared by the root `packageManager` field
- Docker
- a Discord bot token plus guild-specific IDs in `.env`

The repository is a pnpm workspace. The existing root package remains the Discord bot, while `apps/api` is an independently startable HTTP process. Both runtimes can talk to the same local dependencies:

- Postgres for durable application state
- Redis for event tracking and short-lived coordination state
- optional Grafana, Loki, and Alloy for production-like log inspection

## First Boot

1. Install dependencies.

```bash
pnpm install
```

This also generates the Prisma client.

2. Create your local env file.

```bash
cp .env.example .env
```

Use `.env.example` as the source of truth for supported configuration. The most important local values are the Discord token, configured guild ID, and the role and channel IDs Arbiter expects.

3. Start Postgres and Redis.

```bash
pnpm db:up
pnpm redis:up
```

Most real workflows need both. Postgres holds durable truth. Redis is required for scheduled tasks and event tracking.

4. Apply schema migrations.

```bash
pnpm db:migrate
```

5. Seed baseline data when the workflow depends on reference data.

```bash
pnpm db:seed
```

Seeding is usually helpful for event, division, and merit work.

6. Start the bot.

```bash
pnpm dev
```

Development mode also enables the `dev` command group for repair and migration-style helpers.

7. Start the health-only API independently when working on the API surface.

```bash
pnpm dev:api
```

The API exposes `GET /api/v1/health` for liveness and `GET /api/v1/readiness` for Postgres-and-Redis readiness. It does not expose a business route yet. Stopping the API closes only its own bounded Postgres pool and Redis client; it does not control the bot process or the shared services.

See [Standalone API](../api/standalone-api.md) for its current purpose, complete configuration, response contract, Docker workflow, and observability path.

To run the API as its own local container against the already-running development Postgres and Redis services:

```bash
docker compose -f docker-compose.api.yml up --build
```

`docker-compose.api.yml` defines only the API service. It does not create Postgres or Redis. Set `API_CREDENTIAL_PEPPER` to a private value of at least 32 characters before starting it. On Docker Desktop it reaches the host-published development services through `host.docker.internal`; set `API_DATABASE_URL` when your existing database is reachable through a different container-safe address.

## Optional Local Services

Start the observability stack when you want production-like log inspection:

```bash
pnpm obs:up
```

Both the bot's `logs/arbiter.log` and the API's `logs/api.log` flow through Alloy into Loki. The provisioned Grafana dashboard can correlate API requests by `X-Request-Id`; filter the API stream with `{app="arbiter", service="arbiter-api"}`.

Docs workflow commands:

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:serve
```

When using `pnpm docs:serve`, remember that the built site is served under `/Arbiter/`, not `/`.

## Daily Validation Loop

For most code changes, this is the safe default:

```bash
pnpm check
```

`pnpm check` is the repository-owned local and CI contract. It lints GitHub workflow files, typechecks, lints application code, runs unit and integration tests, and builds the documentation. Use `pnpm workflow:lint` by itself when editing files under `.github/workflows/`.

Useful narrower loops:

```bash
pnpm test:unit
pnpm test:integration
pnpm build:api
pnpm api:container:smoke
```

- `pnpm test:unit` is the fast loop for pure logic, presenters, and service branching
- `pnpm test:integration` is the storage-backed loop for Prisma and Redis work

Integration tests require Docker. If container runtime support is missing, the integration runner reports that it skipped coverage and exits cleanly instead of failing with infrastructure noise; do not treat that result as completed integration coverage.

## How The Repo Is Organized

The important question is not "where is every file?" The important question is "what kind of responsibility belongs in each layer?"

### Top-Level Directories

| Path                     | What it owns                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| `src/`                   | Existing Discord bot runtime application code                        |
| `apps/api/`              | Standalone HTTP API process and API-owned dependency lifecycle       |
| `packages/api-contracts` | Versioned transport schemas, safe envelopes, and scope names         |
| `packages/domain`        | Pure canonical rules shared by runtimes, starting with merit ranking |
| `tests/`                 | Bot and cross-runtime integration tests                              |
| `prisma/`                | Canonical split schema, migrations, seeds, and repair utilities      |
| `observability/`         | Loki, Alloy, and Grafana config                                      |
| `website/`               | This Docusaurus site                                                 |
| `scripts/`               | Repository automation, including release tooling                     |
| `.github/workflows/`     | CI, docs publish, and release automation                             |
| `docker-compose.*.yml`   | Local and production infrastructure entrypoints                      |

### Runtime Layout

| Path                       | What belongs there                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/commands`             | Slash command registration and top-level dispatch                                                                        |
| `src/interaction-handlers` | Button and modal routing, including custom ID decode                                                                     |
| `src/listeners`            | Gateway lifecycle listeners such as startup and guild-member events                                                      |
| `src/scheduled-tasks`      | Recurring maintenance and event-tracking jobs                                                                            |
| `src/preconditions`        | Coarse transport-level permission gates                                                                                  |
| `src/lib/discord`          | Shared Discord transport helpers such as response handling, actor resolution, autocomplete routing, and custom ID codecs |
| `src/lib/features`         | Feature-facing handlers, presenters, gateways, and dependency assembly                                                   |
| `src/lib/services`         | Business workflows, state transitions, reconciliation logic, and typed outcomes                                          |
| `src/integrations`         | Concrete boundaries such as Prisma, Redis, Sapphire runtime access, and logging                                          |
| `src/utilities`            | Long-lived runtime utilities, especially utilities Sapphire scans or app-lifetime helpers depend on                      |

## Naming Patterns That Matter

Arbiter gets easier to navigate once you learn the recurring names:

| Search pattern                                                        | Usually means                                              |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `handle*`                                                             | A transport-facing or feature-facing entrypoint            |
| `create*Deps` or `*Runtime`                                           | Dependency assembly                                        |
| `build*Payload`, `build*Embed`, `build*Row`, `present*`               | Presentation or result mapping                             |
| `*Repository`                                                         | Domain-shaped storage access                               |
| `sync*`, `reconcile*`, `finalize*`, `initialize*`, `load*`, `record*` | Service verbs that usually tell you what the workflow owns |

## How To Trace A Flow

When you are new to an area, trace from the public surface inward:

1. find the command name, button action, modal action, listener event, or scheduled task that starts the flow
2. find the handler that owns that ingress
3. find the service call made by that handler
4. inspect the presenter if the result is rendered back to Discord
5. inspect repositories or gateways only after you understand the workflow contract
6. open the matching tests to see what behavior is already considered important

That order keeps you from confusing transport details with the actual business rule.

## Where New Code Usually Belongs

| Change type                         | Usually start here                                                     |
| ----------------------------------- | ---------------------------------------------------------------------- |
| New slash command or subcommand     | Command layer plus a feature handler                                   |
| New button or modal action          | Interaction handler plus custom ID protocol plus feature handler       |
| New business rule                   | Service layer                                                          |
| New embed, buttons, or message copy | Presenter or payload builder                                           |
| New storage scenario                | Repository surface plus aggregate-specific Prisma modules              |
| New Discord side effect             | Gateway or feature-local runtime dependency assembly                   |
| New long-lived app utility          | `src/utilities`, but only when it truly owns runtime-lifetime behavior |

## Working With Live Discord Behavior

Automated tests are the default confidence mechanism, but some things still need manual validation in Discord:

- permission and precondition behavior
- autocomplete ergonomics
- embed and component layout
- button and modal wiring
- guild-member listeners that depend on real role changes

Use automated tests for business logic, persistence, and deterministic result mapping. Use manual Discord testing for transport and client behavior.

## Practical Onboarding Advice

- Start with one narrow workflow and get it working end to end before touching multiple domains.
- If a command appears broken, check `.env` before changing code. Wrong role IDs or channel IDs often look like runtime bugs.
- If event workflows look partially broken, verify Redis is running and the configured guild is correct.
- If division-aware behavior looks inconsistent, remember that the division cache is warmed at startup and refreshed on a schedule.
- If you are editing docs, treat `pnpm docs:build` as mandatory.

## When You Need More Than Seed Data

The normal onboarding path is migrations plus repo seeds. If you need a more realistic local dataset, rebuild Postgres, restore a dump, tell Prisma which baseline migration is already present, then reapply repo-managed migrations and seeds.

One working local rebuild flow is:

```bash
pnpm db:reset
pnpm db:up
cat dev.dump | docker exec -e PGPASSWORD=arbiter -i arbiter-v3-dev-db pg_restore \
  -U arbiter \
  -d arbiter \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges
pnpm exec prisma migrate resolve --applied 20260311232110_init
pnpm db:migrate
pnpm db:generate
pnpm db:seed
pnpm redis:reset
pnpm redis:up
```

What each command does:

- `pnpm db:reset` removes the local Postgres container and volume so you are not restoring on top of stale state
- `pnpm db:up` recreates the Postgres container and starts the database service
- `cat dev.dump | docker exec ... pg_restore ...` streams a local dump into the running database and replaces conflicting objects during restore
- `pnpm exec prisma migrate resolve --applied 20260311232110_init` tells Prisma the restored dump already contains that baseline schema
- `pnpm db:migrate` applies repo migrations created after that baseline
- `pnpm db:generate` regenerates the Prisma client against the schema now present locally
- `pnpm db:seed` layers repo-owned seed data on top of the restored dump
- `pnpm redis:reset` clears Redis volume state so short-lived coordination data does not drift from the restored Postgres snapshot
- `pnpm redis:up` recreates and starts Redis

Notes:

- This restore flow assumes your dump is named `dev.dump`, is compatible with `pg_restore`, and your Postgres container is named `arbiter-v3-dev-db`.
- If you only need Redis restarted and do not care about wiping its data, skip `pnpm redis:reset` and run `pnpm redis:up`.
- If the dump was taken from a newer migration state than `20260311232110_init`, adjust the `prisma migrate resolve --applied ...` step to match the baseline already present in the dump.
