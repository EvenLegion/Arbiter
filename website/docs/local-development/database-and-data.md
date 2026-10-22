---
title: Database And Data
sidebar_position: 2
---

# Database And Data

Postgres owns durable application truth. Redis owns transient coordination such as live event tracking, API sessions, and short-lived locks. Treat changes to either authority as separate from merely starting local services.

## Prisma Ownership

| Source                                                                                                 | Owns                                                             |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [`prisma/schema/`](https://github.com/EvenLegion/Arbiter/tree/dev/prisma/schema)                       | Split canonical Prisma models and datasource schema              |
| [`prisma/schema/migrations/`](https://github.com/EvenLegion/Arbiter/tree/dev/prisma/schema/migrations) | Ordered deploy migration history                                 |
| [`prisma.config.ts`](https://github.com/EvenLegion/Arbiter/blob/dev/prisma.config.ts)                  | Prisma schema location and development datasource selection      |
| [`prisma/seed.ts`](https://github.com/EvenLegion/Arbiter/blob/dev/prisma/seed.ts)                      | Normal reference-data seed entrypoint                            |
| [`prisma/migration/`](https://github.com/EvenLegion/Arbiter/tree/dev/prisma/migration)                 | Legacy-data import, verification, backfill, and repair utilities |

`prisma/migration/` is not the normal deploy migration path. Do not run those utilities as first-boot, routine seed, or schema commands. They can depend on migration-specific credentials, Discord access, legacy data assumptions, or one-time repair ordering.

## Normal Local Flow

| Task                               | Command            | Prerequisite                         | Success signal                               |
| ---------------------------------- | ------------------ | ------------------------------------ | -------------------------------------------- |
| Generate the Prisma client         | `pnpm db:generate` | Installed workspace                  | Prisma reports that the client was generated |
| Start local Postgres               | `pnpm db:up`       | Docker                               | The Compose service becomes healthy          |
| Apply checked-in deploy migrations | `pnpm db:migrate`  | Reachable target database            | Prisma reports no failed migration           |
| Seed reference data                | `pnpm db:seed`     | Migrated database and `DATABASE_URL` | Seed command exits successfully              |
| Inspect data locally               | `pnpm db:studio`   | Reachable database                   | Prisma Studio opens                          |

Generate reads the checked-in schema and does not author a migration. `db:migrate` runs `prisma migrate deploy`: it applies repository-owned migration files and does not infer schema changes. Schema or migration authoring requires its own approved ticket; do not improvise it during onboarding.

The development Prisma CLI datasource comes from [`prisma.config.ts`](https://github.com/EvenLegion/Arbiter/blob/dev/prisma.config.ts). The running bot, API, and seed entrypoint use their runtime database configuration. Keep those targets aligned before interpreting a successful migration as proof that a runtime points at the same database.

## Testcontainers

`pnpm test:integration` starts isolated Postgres and Redis containers through Testcontainers. The suite applies its own test setup and uses small scenario fixtures; it does not use the daily development Compose volumes or a production dump.

The runner deliberately exits successfully with a clear skip message when neither Docker nor Podman is available. A skip proves only that the runner handled missing infrastructure; it is not completed integration coverage. See [Testing And Validation](./testing-and-validation.md).

## Local Dump Restore

The normal contributor path is migrations plus repository seeds. Restore a dump only when a sanitized, trusted dataset is necessary and the seed path cannot represent the scenario.

:::danger Destructive, local-only procedure

This procedure removes the local Postgres volume and may require clearing local Redis so transient state does not disagree with restored durable data. It assumes:

- `.env` points at the disposable `docker-compose.db.yml` database on localhost
- the dump is sanitized, trusted, and compatible with `pg_restore`
- no other worktree or process relies on the named local Compose volumes
- you have identified which checked-in deploy migrations the dump already contains

Do not use this procedure with real data, shared environments, or production. Stop if the dump's schema provenance is unknown.

:::

1. Inspect the exact directory names under the canonical [deploy migration history](https://github.com/EvenLegion/Arbiter/tree/dev/prisma/schema/migrations). If the dump contains Prisma's `_prisma_migrations` table, preserve that history rather than inventing a baseline.
2. Remove and recreate only the disposable local database.

```bash
pnpm db:reset
pnpm db:up
```

3. Restore the sanitized custom-format dump through the Compose service. Replace the example path with the reviewed local file.

```bash
docker compose -f docker-compose.db.yml exec -T arbiter-dev-db sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges' \
  < ./path/to/sanitized.dump
```

4. Check migration state before applying anything else.

```bash
pnpm exec prisma migrate status
```

If the dump lacks `_prisma_migrations`, compare its schema to the checked-in SQL and mark only migrations proven to be present with `pnpm exec prisma migrate resolve --applied <migration-directory-name>`. Do not copy a fixed baseline from an old runbook.

5. Apply later checked-in migrations, regenerate the client, and optionally layer repository reference seeds.

```bash
pnpm db:migrate
pnpm db:generate
pnpm db:seed
```

6. If the restored scenario uses Redis-backed workflows, clear only the disposable local Redis volume before restarting it.

```bash
pnpm redis:reset
pnpm redis:up
```

After restore, prove the relevant runtime's known-good signal and run the narrowest storage-backed tests. A successful `pg_restore` alone does not prove schema compatibility, Redis alignment, or application readiness.
