---
title: Recovery And Incidents
sidebar_position: 11
---

# Recovery And Incidents

Use this page to choose the smallest safe containment and recovery boundary.
It does not authorize live changes. Production rollback, proxy changes, secret
rotation, session invalidation, database restore, Redis recreation, and every
destructive action require explicit current approval.

## Route By Affected Surface

- **Portal only** — Disable or roll back the Vercel portal; leave API and bot
  running. Select an artifact compatible with the running API contract, then
  verify headers, direct navigation, and a real API request.
- **API only** — Remove the API from public proxy traffic and stop or revert only
  `arbiter-api`. Verify health, readiness, proxy rejection, contract header, and
  API logs before reopening traffic.
- **Bot only** — Stop or revert only `arbiter-bot`; preserve API and Redis unless
  evidence implicates them. Prove Discord connection, initialization, scheduled
  work, and bot log shipping after recovery.
- **Shared Postgres** — Treat bot, API, migration, and operator access as one
  durable-data incident. Stop affected write paths, preserve evidence, and use
  the approved external recovery procedure. Do not improvise a down migration.
- **Redis or BullMQ** — Distinguish bot queue/tracking failure from API session
  or rate-limit failure. Preserve the data directory and inspect bounded
  namespaces and queues before an approved Redis-specific correction.
- **Authentication** — Block API ingress first; the bot is not part of the API
  OAuth boundary. Follow the session-invalidation and Discord-client-secret
  procedure before restoring traffic.
- **API credential** — Revoke affected credentials through the authoritative API
  workflow. Remint and cut over bounded credentials; pepper rotation is a
  last-resort global invalidation plan.
- **Log shipping** — Determine whether the runtime file is missing or Alloy/Loki
  ingestion is failing. Repair the narrow mount, ownership, Alloy, or Loki
  boundary without reporting a healthy runtime as failed.

## Portal-Only Recovery

The portal has no server process, database, Redis state, OAuth secret, or
credential pepper. Rolling it back does not revoke sessions or API credentials.
A rollback is safe only to an artifact whose compiled API contract matches the
running API. If no compatible artifact is available, keep the portal disabled
while the API and bot continue independently.

## API-Only Recovery

Before migration, API code rollback is a normal image revert. After an additive
migration has applied, restore a compatible API image and leave unused additive
tables, enums, and columns in place. Dropping them or deleting credentials is
destructive and is not part of normal rollback.

An unhealthy API should leave public proxy rotation even when `/api/v1/health`
returns 200; `/api/v1/readiness` owns dependency readiness. Do not restart the
bot merely because the API failed.

For an authentication incident, follow
[API and portal deployment readiness](../api/deployment-readiness.md#authentication-and-credential-incidents).
Changing `API_REDIS_NAMESPACE` invalidates all active API sessions and resets
API rate-limit windows, so it requires an explicit reviewed cutover. Rotating
`API_CREDENTIAL_PEPPER` invalidates every issued API credential and requires a
remint plan.

## Bot-Only Recovery

Restore the retained bot image and its prior approved application
configuration. Verify `Logged in`, `runtime.gateway.ready`, and
`runtime.initialized`, then observe the affected scheduled or Discord workflow.
Keep the current Redis memory ceiling unless fresh measurements and a separately
approved change prove a lower value safe.

Do not recreate Redis as a bot rollback shortcut. Bot rollback may stop future
BullMQ history pruning under a newer policy, but already-pruned finalized queue
history cannot be restored. Durable event and review truth remains in Postgres.

## Shared-Database Recovery

The bot and API use the same external Postgres database and Prisma migration
history. When durable data or schema integrity is uncertain:

1. Contain every affected writer under the approved incident procedure.
2. Preserve runtime, migration, database, and request-ID evidence.
3. Determine whether the failure is connectivity, capacity, migration, or data
   integrity before selecting restore or repair.
4. Use the verified external backup and recovery procedure only with explicit
   operational authority.
5. Reapply verification independently for migration, bot, API, and portal.

Never drop additive API tables, remove a migration record, run a guessed down
migration, or treat Redis as a database reconstruction source.

## Redis Recovery

Redis coordinates bot scheduled tasks and event tracking plus API OAuth state,
sessions, CSRF state, and rate limiting. These consumers have separate key
ownership but share the production service. Use
[Redis and BullMQ](./redis-and-queues.md) to inspect memory and scheduled-task
state before changing anything.

Never use `FLUSHALL`, `FLUSHDB`, volume removal, broad queue cleanup, or API
namespace deletion as general recovery. Redis loss may expire coordination and
sessions, but it must not invent or delete durable Postgres workflow truth.

## Incident Evidence

Record the source revision and immutable artifact IDs, affected surface, first
failed check, migration result, bot/API process state, request IDs, separate log
stream status, Redis memory/queue observations, containment time, and every
approved mutation. Do not place tokens, cookies, OAuth codes, credential
secrets, peppers, database URLs, Redis URLs, or raw environment values in the
incident record.

After recovery, rerun the [minimum production verification](./production-deployment.md#minimum-verification)
for every affected and shared boundary.
