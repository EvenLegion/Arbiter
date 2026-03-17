---
title: Local Development
sidebar_position: 2
---

# Local Development

## Prerequisites

- Node.js 22
- `pnpm` 10.x
- Docker
- a Discord bot token and guild-scoped configuration in `.env`

## First-Time Setup

1. Install dependencies.

```bash
pnpm install
```

`pnpm install` installs repo dependencies and runs `prisma generate`. Use it on first clone and whenever dependencies change.

2. Copy the example env file.

```bash
cp .env.example .env
```

`cp .env.example .env` creates your local config file. Use it once per workspace, then edit `.env` for your bot token, guild ID, and other local settings.

3. Start Postgres and Redis.

```bash
pnpm db:up
pnpm redis:up
```

- `pnpm db:up` starts the local Postgres container. Use it before running migrations, seeds, or any persistence-backed workflow.
- `pnpm redis:up` starts the local Redis container. Use it before event-tracking work, scheduled-task testing, or any flow that depends on Redis-backed state.

4. Start the local observability stack.

```bash
pnpm obs:up
```

`pnpm obs:up` starts Grafana, Loki, and Alloy. Use it when you want the same log-viewing workflow as production instead of relying on terminal output.

5. Apply Prisma migrations and seed if the workflow you are testing needs seed data.

```bash
pnpm db:migrate
pnpm db:seed
```

- `pnpm db:migrate` runs Prisma schema migrations against your local database. Use it after pulling schema changes or before first boot.
- `pnpm db:seed` loads the main seed data. Use it when your workflow needs baseline records rather than a blank database.

6. Run the bot.

```bash
pnpm dev
```

`pnpm dev` runs the bot from TypeScript source with `tsx`. Use it for normal local development.

## Restore A Known Local Database Baseline

Use this flow when you want a predictable starting point for manual Discord testing instead of whatever state your local database currently contains.

Typical use cases:

- resetting local state before testing a multi-step workflow
- reproducing a bug against a known snapshot
- returning to a seeded baseline after experimental local data changes

Recommended sequence:

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
```

What each step is doing:

- `pnpm db:reset`
  Stops the local Postgres container and removes its volume. Use it when you want to wipe the local database completely.
- `pnpm db:up`
  Starts a fresh local Postgres container. Use it immediately after reset so the restore target exists.
- `cat dev.dump | docker exec ... pg_restore ...`
  Restores a PostgreSQL custom-format dump into the running local database. Use it when you have a known-good snapshot such as `dev.dump`.
- `pnpm exec prisma migrate resolve --applied 20260311232110_init`
  Marks the initial Prisma migration as already applied without re-running it. Use it when the dump already contains the objects created by the init migration, but the restored database does not have matching `_prisma_migrations` history.
- `pnpm db:migrate`
  Applies the current Prisma schema migrations after the restore and history repair step. Use it to bring the restored database up to the current schema.
- `pnpm db:generate`
  Regenerates the Prisma client. Use it after schema-related changes or anytime you want to ensure the generated client matches the current repo state.
- `pnpm db:seed`
  Runs the repo seed script. Use it when the restored dump needs the repo's current baseline seed data layered on top.

Notes:

- this assumes `dev.dump` is a `pg_restore`-compatible dump file
- this assumes the local Postgres container name is `arbiter-v3-dev-db`, which comes from `docker-compose.db.yml`
- if your local Postgres credentials differ from the defaults, update the `PGPASSWORD`, `-U`, or `-d` values to match your `.env`
- if your dump is plain SQL instead of a custom-format dump, use `psql` instead of `pg_restore`

### Why `migrate resolve` Is Needed

If the restored dump already contains Prisma-managed schema objects from the initial migration, a direct `pnpm db:migrate` can fail with errors like:

- enum already exists
- table already exists
- index already exists

That usually means:

- the dump contains the schema created by `20260311232110_init`
- the restored database does not have the matching `_prisma_migrations` record Prisma expects

In that case, mark the init migration as already applied first:

```bash
pnpm exec prisma migrate resolve --applied 20260311232110_init
```

Then run:

```bash
pnpm db:migrate
```

Use this only when the restored schema really does match that migration. It is a migration-history repair step, not a replacement for normal migrations.

## Daily Commands

App and tests:

- `pnpm dev`
  Starts the bot from source. Use it for the normal edit-run-debug loop.
- `pnpm typecheck`
  Runs the TypeScript compiler without emitting files. Use it after refactors or interface changes.
- `pnpm eslint src tests`
  Lints runtime and test code. Use it before opening a PR and after structural edits.
- `pnpm test`
  Runs the default Vitest suite. Use it as the main local confidence check before pushing changes.
- `pnpm test:unit`
  Runs only the fast unit-test layer. Use it while iterating on pure logic, presenters, or service branching.
- `pnpm test:integration`
  Runs the Testcontainers-backed integration suite. Use it when Prisma, Redis, or storage-backed workflows change.

Infra:

- `pnpm db:up`
  Starts the local Postgres container. Use it before migrations, seeds, or integration work.
- `pnpm db:down`
  Stops the local Postgres container. Use it when you are done or need a clean restart.
- `pnpm db:reset`
  Stops Postgres and removes its volume. Use it when you need a fresh local database.
- `pnpm redis:up`
  Starts the local Redis container. Use it for event-tracking and scheduled-task development.
- `pnpm redis:down`
  Stops the local Redis container. Use it when you are done or need a clean restart.
- `pnpm redis:reset`
  Stops Redis and removes its volume. Use it when you need to discard local Redis state.
- `pnpm obs:up`
  Starts Grafana, Loki, and Alloy. Use it when you want the full log UI locally.
- `pnpm obs:down`
  Stops the observability containers. Use it when you no longer need the local log stack.
- `pnpm obs:reset`
  Stops the observability containers and removes their volumes. Use it when local Grafana or Loki state needs a clean reset.
- `pnpm obs:logs`
  Tails the observability containers. Use it when Grafana, Loki, or Alloy itself is misbehaving.

Release:

- `pnpm release:plan`
  Generates a release-plan file from your branch commits. Use it before opening a PR into `dev`.
- `pnpm release:publish`
  Consumes release plans and writes release output. Use it only when you are working on the release automation flow itself.

Docs:

- `pnpm docs:dev`
  Starts the Docusaurus dev server with live reload. Use it while editing docs pages.
- `pnpm docs:build`
  Builds the static docs site. Use it to catch broken links, bad routes, and config issues before merging docs changes.
- `pnpm docs:serve`
  Serves the already-built static docs locally. Use it when you want to inspect the production-like output rather than the live dev server.

## Docs Site Notes

The Docusaurus site lives in `website/`, not at repo root.

That is intentional:

- the bot already uses root `src/` for runtime code
- Docusaurus can also use its own `src/` when customized later
- keeping the site isolated avoids toolchain collisions

With the current GitHub Pages configuration, local doc serving is rooted under `/Arbiter/`. If you use `pnpm docs:serve`, which serves the static built site, open the site at `/Arbiter/`, not `/`.

## Local Logging And Grafana

Development uses the same file-first logging model as production:

- Arbiter writes JSON logs to `logs/arbiter.log`
- Alloy tails that file
- Loki stores the logs
- Grafana is the preferred log UI

By default:

- Grafana runs on `http://localhost:3001`
- Loki runs on `http://localhost:3100`

Grafana now provisions a starter dashboard named `Arbiter Logs`. Use it as the default entrypoint for log inspection before dropping into Explore.

When you are debugging a real workflow, prefer:

1. reproduce the flow
2. open Grafana
3. search by `requestId`, `flow`, or Discord identifiers

Read [Logging And Observability](/architecture/logging-and-observability) for the full model.

## Test Runtime Notes

Unit tests always run locally.

Integration tests are gated on a working container runtime because they use Testcontainers-backed Postgres and Redis. If Docker is unavailable, `pnpm test:integration`, which runs only that integration layer, exits cleanly without running suites.

Use this rule of thumb:

- changing pure logic, presenters, or service branching:
  start with `pnpm test:unit`, which is the fastest targeted test layer
- changing Prisma, Redis, or repository-backed workflows:
  run `pnpm test:integration`, which exercises real Postgres and Redis-backed behavior with Testcontainers

## Runtime Assumptions

Development is guild-scoped:

- commands are registered to `DISCORD_GUILD_ID`
- command iteration is fast because there is no global propagation delay

Most local debugging assumes:

- one configured guild
- one configured bot token
- local Postgres and Redis

## When You Change Code

Use this loop:

1. run `pnpm typecheck`, which catches TypeScript contract drift quickly
2. run the smallest relevant test target first
3. run `pnpm test`, which is the main default test pass
4. if you changed docs or navigation, run `pnpm docs:build`, which validates the doc site routes and links

If you change architecture, contributor workflows, feature entrypoints, or code placement rules, update the docs in the same change. Read [Maintaining Docs](/contributing/maintaining-docs) for the checklist.
