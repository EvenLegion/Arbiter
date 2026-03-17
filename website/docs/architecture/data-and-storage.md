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

## Redis

Redis is used for:

- active event tracking state
- scheduled task coordination for event tracking

Current Redis event-tracking modules live in:

- `src/integrations/redis/eventTracking/`

The owning workflow is service-backed:

- `src/lib/services/event-tracking/`

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

Integration tests require a working container runtime. When Docker is unavailable, `pnpm test:integration` exits cleanly without running suites.

## Common Rules

- do not bypass repositories from feature code
- keep aggregate-specific Prisma helper modules near the aggregate family
- keep Redis usage behind services or feature dependency assembly, not inside command shells
- document any new aggregate or persistence ownership changes in the docs

## Read This Next

- For aggregate-by-aggregate ownership:
  [Aggregate Reference](/reference/aggregate-reference)
- For workflow ownership:
  the relevant feature page
- For contributor rules:
  [Testing And Refactors](/contributing/testing-and-refactors)
