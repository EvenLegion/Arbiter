---
title: Prisma Integration
sidebar_position: 5
---

# Prisma Integration

Use this page when you need to answer:

- where Prisma code should live
- what feature code is allowed to import
- how to add or change a database operation without reintroducing wrapper sprawl

## Design Rule

The Prisma layer has one intended public surface for application code:

- `src/integrations/prisma/repositories/`

Feature handlers, services, and feature adapters should depend on repositories, not on:

- raw `prisma.*`
- aggregate scenario files under `src/integrations/prisma/<aggregate>/`
- forwarding-only query barrels

The aggregate folders exist to implement repository methods, not to become a second public API.

## Current Shape

```text
src/integrations/prisma/
  prisma.ts
  index.ts
  repositories/
    userRepository.ts
    divisionRepository.ts
    meritRepository.ts
    nameChangeRepository.ts
    eventRepository.ts
    eventReviewRepository.ts
  user/
  division/
  merit/
  name-change/
  event/
    session/
    review/
    tier/
```

The structure is deliberate:

- `repositories/` exposes domain-shaped operations
- aggregate folders hold concrete scenario files
- helper modules stay local to the aggregate family that uses them

## Repository Responsibilities

Repositories should:

- provide domain-facing method names
- group related persistence operations by aggregate
- hide low-level Prisma query details from features
- do small convenience shaping that improves call sites

Repositories should not:

- become a second service layer
- re-implement domain policy that already belongs in services
- duplicate validation already owned by the concrete Prisma operation

Good examples:

- `eventRepository.listSessions(...)`
- `eventReviewRepository.getReviewPage(...)`
- `nameChangeRepository.reviewRequest(...)`

## Aggregate Scenario Files

Inside an aggregate folder, prefer one file per real operation:

- `createDraftEventSession.ts`
- `findEventSessions.ts`
- `getEventReviewPage.ts`
- `reviewNameChangeRequest.ts`
- `getUserMeritSummary.ts`

Add local helpers only when they do real work, for example:

- input schemas
- `where` builders
- transaction helpers
- result-shaping helpers

Do not add files that only forward exports to the next file.

## Event Family Notes

The event aggregate is the largest Prisma surface, so it is grouped by scenario family:

- `event/session/`
- `event/review/`
- `event/tier/`

Those folders contain concrete scenario files plus family-local helpers such as:

- `buildEventSessionWhere.ts`
- `eventReviewPageHelpers.ts`
- `finalizeEventReviewTransactionHelpers.ts`

The repositories import the concrete scenario files directly. There is no extra query-barrel layer between the repositories and those files.

## How To Add A New Database Operation

1. Decide which aggregate owns the state.
2. Add or update the repository method first.
3. Implement the concrete Prisma operation in the owning aggregate folder.
4. Add local helper modules only if the query or transaction is dense enough to justify them.
5. Keep feature code importing the repository, not the concrete Prisma file.
6. Add or update an integration test if the change affects persistence behavior.

## How To Change An Existing Operation

When debugging or extending a persistence flow:

1. start at the repository method
2. follow it to the concrete scenario file
3. inspect any family-local helper modules used by that scenario

The tracing target is:

- repository
- one scenario file
- a small number of local helpers

not:

- repository
- barrel
- family barrel
- query barrel
- helper barrel
- scenario file

## Smells To Avoid

- feature code importing `src/integrations/prisma/<aggregate>/...`
- raw `prisma.*` in feature adapters or services
- generic `read.ts` / `write.ts` files that only re-export concrete operations
- family `index.ts` files that do nothing except forward exports
- repository wrappers that only parse the same inputs a second time

## Read This Next

- For storage ownership:
  [Data And Storage](/architecture/data-and-storage)
- For aggregate ownership:
  [Aggregate Reference](/reference/aggregate-reference)
- For extension rules:
  [Adding Features](/contributing/adding-features)
