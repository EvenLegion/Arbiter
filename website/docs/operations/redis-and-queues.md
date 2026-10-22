---
title: Redis And BullMQ
sidebar_position: 12
---

# Redis And BullMQ

This runbook owns detailed production inspection for Redis memory and the
scheduled-task BullMQ queue. It describes read-only checks; production access,
deployment, rollback, configuration, and recreation still require explicit
current approval.

## State Boundary

Postgres remains durable authority for event sessions, participant snapshots,
review decisions, merits, users, integrations, and credentials. Redis contains:

- bot event-tracking counters and transient coordination
- BullMQ scheduled-task state and bounded finalized history
- API OAuth state, staff sessions, CSRF state, and rate limits under the
  `arbiter:api:v1:` namespace by default

Do not share the API namespace with BullMQ or bot tracking keys. Never use
`FLUSHALL`, `FLUSHDB`, volume removal, or broad queue cleanup as verification or
rollback.

## Capacity And Retention

Production Redis defaults to a 1 GiB container memory limit. Change
`REDIS_MEM_LIMIT` only from current host measurements while preserving enough
memory for the bot, API, and observability services.

Scheduled-task finalized history is bounded:

- completed jobs become eligible for removal after 24 hours, with at most 5,000 retained
- failed jobs become eligible for removal after seven days, with at most 1,000 retained

Both age and count apply, and BullMQ prunes lazily after later jobs finish.
These limits do not target active, delayed, repeatable, or pending-retry jobs.

## Read-Only Memory Check

Record the container ceiling, Redis memory values, and database key count:

```bash
docker stats --no-stream arbiter-v3-redis
docker compose -f docker-compose.prod.yml exec -T arbiter-redis sh -lc '
redis_cli() {
  if [ -n "$REDIS_PASSWORD" ]; then
    REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -n "${REDIS_DB:-0}" "$@"
  else
    redis-cli -n "${REDIS_DB:-0}" "$@"
  fi
}
redis_cli INFO memory | grep -E "^(used_memory_human|maxmemory_human|mem_fragmentation_ratio):"
redis_cli DBSIZE
'
```

Do not print the password or full key contents.

## Read-Only Scheduled-Task Check

Inspect only queue counters. Completed, failed, delayed, and repeatable values
are sorted-set counts; active and waiting are list lengths:

```bash
docker compose -f docker-compose.prod.yml exec -T arbiter-redis sh -lc '
redis_cli() {
  if [ -n "$REDIS_PASSWORD" ]; then
    REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -n "${REDIS_DB:-0}" "$@"
  else
    redis-cli -n "${REDIS_DB:-0}" "$@"
  fi
}
printf "completed="; redis_cli ZCARD bull:scheduled-tasks:completed
printf "failed="; redis_cli ZCARD bull:scheduled-tasks:failed
printf "active="; redis_cli LLEN bull:scheduled-tasks:active
printf "waiting="; redis_cli LLEN bull:scheduled-tasks:wait
printf "delayed="; redis_cli ZCARD bull:scheduled-tasks:delayed
printf "repeatable="; redis_cli ZCARD bull:scheduled-tasks:repeat
'
```

## Deployment Observation

Before an approved bot update, retain the prior bot image, secure the active
configuration, and record the memory and queue counters. After the update:

1. Confirm the bot log contains `Logged in`, `runtime.gateway.ready`, and
   `runtime.initialized` and that the process remains running.
2. Rerun the memory and queue checks. A transient active count is normal; active,
   delayed, repeatable, and retry work must not disappear.
3. Confirm at least three consecutive `task.eventTrackingTick` entries with
   `task.completed`, spanning at least two configured tracking intervals, with
   no intervening `task.failed` entry for that flow.
4. Recheck memory and counts after the observation window. Finalized history
   should remain within the configured limits and memory should retain safe
   headroom below the container ceiling.

For API readiness, use `/api/v1/readiness`; it checks the API's session and
rate-limit Redis clients under a bounded deadline without exposing dependency
details. Do not inspect session, CSRF, OAuth, or credential-related key values.

If readiness, repeat scheduling, tracking ticks, or Redis health regresses,
select the narrow recovery route in [Recovery and incidents](./recovery.md).
Recreate only the affected runtime by default. Redis recreation is a separate,
Redis-specific operation and must preserve the approved data boundary.
