---
title: Local Development
sidebar_position: 2
---

# Local Development

This page gets a new contributor from clone to a working local bot without assuming prior Arbiter context.

## Prerequisites

- Node.js 22
- `pnpm` 10.x
- Docker
- a Discord bot token plus guild-specific IDs in `.env`

Arbiter talks to three local dependencies:

- Postgres for durable application state
- Redis for event tracking and short-lived coordination state
- optional Grafana, Loki, and Alloy for production-like log inspection

## First Boot

1. Install dependencies.

```bash
pnpm install
```

This installs repo dependencies and runs Prisma client generation.

2. Create your local env file.

```bash
cp .env.example .env
```

Use `.env.example` as the source of truth for supported configuration. The most important local values are the Discord token, the configured guild ID, and the channel and role IDs that the bot expects.

3. Start Postgres and Redis.

```bash
pnpm db:up
pnpm redis:up
```

You need both for most real workflows. Postgres holds durable state. Redis is required for scheduled tasks and event tracking.

4. Apply schema migrations.

```bash
pnpm db:migrate
```

This brings your local database to the current schema.

5. Seed baseline data if the workflow you are testing depends on it.

```bash
pnpm db:seed
```

Seeding is not mandatory for every task, but it is usually useful for event, division, and merit work because those workflows depend on existing reference data.

6. Start the bot.

```bash
pnpm dev
```

This runs the TypeScript source directly. In development mode, the `dev` command group is also available for repair and migration-style helpers.

## Optional Local Services

Start the observability stack if you want production-like log inspection instead of relying on terminal output:

```bash
pnpm obs:up
```

Start the docs site while editing docs:

```bash
pnpm docs:dev
```

Build the docs site to catch broken links and route issues:

```bash
pnpm docs:build
```

Serve the static built output:

```bash
pnpm docs:serve
```

When using `pnpm docs:serve`, remember that the built site is served under `/Arbiter/`, not `/`.

## What Each Local Service Is For

### Postgres

Postgres is the durable source of truth for users, divisions, name-change requests, merits, event sessions, event review state, and stored message references. If a behavior must survive bot restarts, it should almost certainly land here.

### Redis

Redis is intentionally narrower. It holds active event-tracking session metadata, per-session attendance counters, and other short-lived coordination state. If Redis disappears, the bot can rebuild its durable truth from Postgres, but in-flight tracking state may be lost.

### Observability

Arbiter uses a file-first logging model in both development and production:

- the bot writes structured logs to `LOG_FILE_PATH`
- Alloy tails the log file
- Loki stores the logs
- Grafana reads from Loki

That parity is useful because the same request and flow identifiers show up locally and in production.

## Daily Validation Loop

For most code changes, this is the safe default:

```bash
pnpm typecheck
pnpm exec eslint src tests
pnpm test
pnpm docs:build
```

What each command gives you:

- `pnpm typecheck` verifies TypeScript contracts without emitting build output
- `pnpm exec eslint src tests` validates runtime and test code
- `pnpm test` runs the main Vitest suite
- `pnpm docs:build` catches broken docs links and Docusaurus config issues

Useful narrower commands while iterating:

```bash
pnpm test:unit
pnpm test:integration
```

- `pnpm test:unit` is the fast loop for pure logic, presenters, and service branching
- `pnpm test:integration` is the storage-backed loop for Prisma and Redis work

Integration tests require a container runtime. If Docker is unavailable, the integration runner exits cleanly instead of failing with noisy infrastructure errors.

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
- If event workflows appear partially broken, verify Redis is running and the configured guild is correct.
- If division-aware behavior looks inconsistent, remember that the division cache is warmed at startup and refreshed on a schedule.
- If you are editing docs, treat `pnpm docs:build` as mandatory, not optional.

## When You Need More Than Seed Data

The normal onboarding path is migrations plus repo seeds. If you need a more realistic local dataset, the workflow changes: you rebuild Postgres, restore a dump, tell Prisma which baseline migration is already represented by that dump, then reapply repo-managed migrations and seeds.

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

- `pnpm db:reset` removes the local Postgres container and its volume so you are not restoring on top of stale state.
- `pnpm db:up` recreates the Postgres container and starts the database service.
- `cat dev.dump | docker exec ... pg_restore ...` streams a local Postgres dump into the running database and replaces conflicting objects as part of the restore.
- `pnpm exec prisma migrate resolve --applied 20260311232110_init` tells Prisma that the restored dump already includes the baseline schema represented by the `20260311232110_init` migration.
- `pnpm db:migrate` applies any repo migrations created after that baseline.
- `pnpm db:generate` regenerates the Prisma client against the schema now present in your local database.
- `pnpm db:seed` layers repo-owned seed data on top of the restored dump so reference data and local assumptions stay aligned with the current codebase.
- `pnpm redis:reset` clears Redis volume state so in-memory coordination data does not drift from the freshly restored Postgres snapshot.
- `pnpm redis:up` recreates and starts Redis.

Notes:

- This restore command assumes your dump file is named `dev.dump`, is compatible with `pg_restore`, and your Postgres container is named `arbiter-v3-dev-db`.
- If you only need to restart Redis and do not care about wiping its data, you can skip `pnpm redis:reset` and just run `pnpm redis:up`.
- If the dump was taken from a newer migration state than `20260311232110_init`, adjust the `prisma migrate resolve --applied ...` step to match the baseline already present in the dump.
