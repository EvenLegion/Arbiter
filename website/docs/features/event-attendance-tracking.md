---
title: Event Attendance Tracking
sidebar_position: 4
---

# Event Attendance Tracking

## What This Page Covers

This page is about live attendance tracking for active events.

Primary code:

- task shell:
  `src/scheduled-tasks/eventTrackingTick.ts`
- service:
  `src/lib/services/event-tracking/`
- feature deps:
  `src/lib/features/event-merit/tracking/createEventTrackingServiceDeps.ts`
- Redis storage:
  `src/integrations/redis/eventTracking/`
- helper modules:
  `src/utilities/eventTracking/`

## Tracking Flow

At a high level:

1. `eventTrackingTick.ts` checks runtime readiness and creates context.
2. `tickAllActiveEventTrackingSessions(...)` loads active tracking session ids from Redis.
3. The service loads active event sessions from Postgres.
4. The service resolves Discord voice channels from the configured guild.
5. Attendance tick data is applied in Redis.
6. Missing tracked channels are handled through warning-store logic.

## What Lives In Redis Versus Postgres

Postgres owns:

- event session identity and state
- tracked channel relationships
- finalized participant stats and review data

Redis owns:

- active session tick state
- active participant snapshots during tracking
- short-lived operational coordination

The rule is:

- if the state is authoritative and long-lived, it belongs in Postgres
- if the state is operational and derived from live voice presence, it belongs in Redis

## Why This Is Service-Backed

Earlier versions treated tracking as more of a runtime utility concern. The current shape keeps the workflow in `src/lib/services/event-tracking/` so contributors can reason about:

- active-session iteration
- tick application rules
- missing-channel handling

without reading scheduled-task code first.

## Common Extension Points

- new tick rule or attendance policy:
  `src/lib/services/event-tracking/`
- new Redis operation:
  `src/integrations/redis/eventTracking/`
- new tracking dependency or Discord lookup:
  `src/lib/features/event-merit/tracking/createEventTrackingServiceDeps.ts`

## Common Pitfalls

- do not put tracking rules in the scheduled-task class
- do not treat Redis tracking state as authoritative finalized attendance data
- keep task-level logging and service-level logic separate

## Before Editing

Read these first:

- `src/scheduled-tasks/eventTrackingTick.ts`
- `src/lib/features/event-merit/tracking/createEventTrackingServiceDeps.ts`
- `src/lib/services/event-tracking/eventTrackingService.ts`
- `src/integrations/redis/eventTracking/`
- `src/utilities/eventTracking/`

## Related Docs

- [Event System](/features/event-system)
- [Data And Storage](/architecture/data-and-storage)
- [Aggregate Reference](/reference/aggregate-reference)
