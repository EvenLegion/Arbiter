---
title: Data and Storage
sidebar_position: 4
---

# Data And Storage

## PostgreSQL And Prisma

PostgreSQL is the system of record. Prisma access lives in `src/integrations/prisma/`.

The intended public surface is the repository layer:

- `eventRepository`
- `eventReviewRepository`
- `divisionRepository`
- `meritRepository`
- `nameChangeRepository`
- `userRepository`

Repositories should expose domain-shaped operations. Feature code should not reach directly for `prisma.*`.

The current Prisma shape is:

- repositories as the only application-facing entrypoint
- concrete scenario files grouped by aggregate under `src/integrations/prisma/<aggregate>/`
- helper modules kept local to the aggregate family that uses them

See [Prisma Integration](/architecture/prisma-integration) for the contributor-facing rules.

## Redis

Redis is used for:

- active event tracking state
- scheduled task coordination for event tracking

Current Redis event-tracking modules live in:

- `src/integrations/redis/eventTracking/`

The owning workflow is service-backed:

- `src/lib/services/event-tracking/`

## Operational Logs

Operational logs are not business state, but they are part of the runtime storage story.

Current ownership:

- the bot writes newline-delimited JSON logs to `LOG_FILE_PATH`
- local development usually writes into `logs/arbiter.log`
- production usually mounts `/app/logs` from `BOT_LOGS_DIR`
- Alloy tails the file
- Loki stores the ingested logs for query in Grafana

That means:

- Postgres is still the system of record
- Redis still owns ephemeral event-tracking state
- Loki is the query store for operational logs
- the on-disk log file remains the canonical sink the app writes to

## Aggregate Ownership

The main aggregate owners are:

- user records:
  `userRepository`
- division and division membership:
  `divisionRepository`
- event sessions and event tiers:
  `eventRepository`
- event review decisions and participant stats:
  `eventReviewRepository`
- merit records and merit summaries:
  `meritRepository`
- name change requests:
  `nameChangeRepository`

See [Aggregate Reference](/reference/aggregate-reference) for per-aggregate details.

## Runtime Directories And Caches

The runtime still uses a small set of shared lookup services:

- `src/utilities/divisionCache.ts`
- `src/utilities/userDirectory.ts`
- `src/utilities/member.ts`
- `src/utilities/guild.ts`

Feature-level lookup code also uses:

- `src/lib/discord/memberDirectory.ts`
- `src/lib/features/division-selection/divisionDirectory.ts`

The rule of thumb is:

- persistent business state:
  Postgres
- derived operational attendance state:
  Redis
- cached mostly-static division metadata:
  runtime cache
- live guild membership and nickname lookup:
  Discord-facing edge helpers

## Testing Strategy

The repo uses:

- unit tests for pure logic, service branching, presenters, and edge helpers
- integration tests with Testcontainers for Postgres and Redis-backed workflows

Integration tests require a working container runtime. When Docker is unavailable, `pnpm test:integration`, which runs the Testcontainers-backed integration layer, exits cleanly without running suites.

## Common Rules

- do not bypass repositories from feature code
- keep aggregate-specific Prisma helper modules near the aggregate family
- prefer concrete scenario files over forwarding-only query barrels
- keep Redis usage behind services or feature dependency assembly, not inside command shells
- document any new aggregate or persistence ownership changes in the docs

## Read This Next

- For aggregate-by-aggregate ownership:
  [Aggregate Reference](/reference/aggregate-reference)
- For Prisma layer structure and file placement:
  [Prisma Integration](/architecture/prisma-integration)
- For logging storage and observability flow:
  [Logging And Observability](/architecture/logging-and-observability)
- For workflow ownership:
  the relevant feature page
- For contributor rules:
  [Testing And Refactors](/contributing/testing-and-refactors)
