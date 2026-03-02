# Event + Merit Implementation Guidelines (arbiter-v3)

This document reviews the old implementation in `/Users/whyit/code/EvenLegion/arbiter/src` and proposes a better implementation for `arbiter-v3` using:

- Sapphire pieces (commands, interaction handlers, listeners, scheduled tasks, preconditions, utilities)
- Redis for active/in-progress tracking state
- Postgres (Prisma) for canonical domain state and audit trail

Use this as the build plan while manually implementing the feature set.

## 1) Legacy Review Summary

## What was strong in the old implementation

- Explicit event session lifecycle (`DRAFT -> ACTIVE -> ENDED_PENDING_REVIEW -> FINALIZED_* / CANCELLED`).
- Good reviewer UX:
    - explicit participant decision controls
    - paged review UI
    - submit-with-merits vs submit-no-merits
- Finalization was guarded by `updateMany` state checks to avoid duplicate finalize races.
- Event summary/thread synchronization was practical for moderators.

## Main issues to avoid carrying into v3

1. Custom routing over Sapphire-native pieces:

- Old code manually routed command names/subcommands and interactions in:
    - `/Users/whyit/code/EvenLegion/arbiter/src/handlers/discord/commands/index.ts`
    - `/Users/whyit/code/EvenLegion/arbiter/src/handlers/discord/events/interactionCreate/interactionCreate.ts`
- In v3 this should be replaced by native Sapphire `Subcommand` and `InteractionHandler` classes.

1. Shared bespoke `setInterval` ticker:

- Old `startVcActivityTicker` coupled AUX + event tracking in one timer.
- v3 should use `@sapphire/plugin-scheduled-tasks` per concern.

1. SQLite local tracking dependency:

- Old event tracking wrote active counters to local sqlite (`local_event_tracking_*`).
- This adds native binding complexity and was the root cause of prior runtime issues.
- v3 should use Redis hashes/sets for active snapshots.

1. Missing/weak review ownership enforcement:

- Old review button paths allowed any authorized operator to mutate decisions/finalize.
- If reviewer ownership is required, enforce lock/claim semantics explicitly.

1. Guild scope leakage risk:

- Some old queries were named “for guild” but did not filter by guild in DB.
- v3 should either:
    - explicitly store/filter by `guildId`, or
    - explicitly treat project as single-guild and enforce via config.

1. State transition ordering hazards around end/finalize:

- Old flow could mark session ended before snapshot flush completed.
- v3 should make transition + flush behavior deterministic and retry-safe.

## 2) Target Architecture for v3

## Use this split

- Postgres/Prisma (source of truth):
    - event sessions
    - tracked channels
    - participant snapshots (finalized per end)
    - review decisions
    - merit awards
    - message/thread references
- Redis (ephemeral/in-progress runtime state):
    - active event tracking counters
    - per-session active flags
    - optional reviewer lock/claim
- Sapphire pieces:
    - commands for slash entrypoints
    - interaction handlers for button custom IDs
    - scheduled task for periodic tracking tick
    - listener `ready` for recovery/bootstrap
    - preconditions for authorization
    - utilities for reusable policy/orchestration

## Keep this state machine

- `DRAFT`
- `ACTIVE`
- `ENDED_PENDING_REVIEW`
- `FINALIZED_WITH_MERITS`
- `FINALIZED_NO_MERITS`
- `CANCELLED`

## 3) Recommended File Layout in arbiter-v3

Create these new paths:

- `src/commands/event.ts`
- `src/commands/merit.ts`
- `src/interaction-handlers/eventStartButtons.ts`
- `src/interaction-handlers/eventControlButtons.ts`
- `src/interaction-handlers/eventReviewButtons.ts`
- `src/interaction-handlers/meritListButtons.ts`
- `src/scheduled-tasks/eventTrackingTick.ts`
- `src/preconditions/EventOperatorOnly.ts` (optional, if different from `StaffOnly`)
- `src/lib/features/event-merit/session/*`
- `src/lib/features/event-merit/review/*`
- `src/lib/features/event-merit/ui/*`
- `src/lib/features/event-merit/tracking/*`
- `src/integrations/prisma/event/*`
- `src/integrations/redis/eventTracking/*`
- `src/utilities/eventTracking.ts` (recommended)

Do not add a custom command router or custom event multiplexer; keep everything piece-driven.

## 4) Env + Config Changes

Update env parsing so event config is first-class in v3:

- `src/config/env/discord.ts`:
    - add `EVENT_TRACKING_CHANNEL_ID`
    - add `EVENT_MERIT_DEFAULT_MIN_ATTENDANCE_PCT`
    - add `EVENT_MERIT_LIST_PAGE_SIZE`
- `src/config/env/config.ts`:
    - add `EVENT_TRACKING_TICK_SECONDS` (or reuse `VC_ACTIVITY_TICK_SECONDS`)

Keep defaults strict/validated with Zod.

## 5) Prisma Schema Review and Suggested Updates

Current v3 schema already contains most event models. Before implementation, decide on two points:

1. Reviewer decision granularity

- Current `EventReviewDecisionKind` has `MERIT | NO_MERIT`.
- Old UX had “Extra Merit”.
- Recommended: add support now:
    - option A: add `EXTRA_MERIT` enum value
    - option B: keep enum and add numeric `overrideAmount` column (more flexible)

1. Guild scoping

- Current `EventSession` does not store `guildId`.
- If bot is strictly single-guild this is acceptable.
- If you want safer future-proofing, add `guildId` to `EventSession`.

Also ensure naming consistency in app code with current schema:

- `EventTier.meritAmount` (not `baseMeritAmount`)
- `Merit.amount` (not `merits`)
- `MeritSource.EVENT` (not `EVENT_REVIEW`)
- `EventReviewDecisionKind.NO_MERIT` (not `NONE`)

## 6) Redis Data Model (replace sqlite tracking)

Use simple Redis primitives (no RedisGraph/RedisJSON needed).

Recommended keys:

- Active sessions set:
    - `arbiter:event-tracking:active-sessions` (Set of `eventSessionId`)
- Session metadata hash:
    - `arbiter:event-tracking:session:{eventSessionId}`
    - fields: `guildId`, `startedAtMs`, `lastTickAtMs`, `status`
- Participant counters hash:
    - `arbiter:event-tracking:participants:{eventSessionId}`
    - field: `discordUserId`
    - value: attended seconds

Optional:

- reviewer lock key:
    - `arbiter:event-review:lock:{eventSessionId}` -> reviewer discord user id

Use `MULTI/EXEC` for tick updates and stop/finalize transitions where needed.

## 7) Prisma Integration Layer Plan

In `src/integrations/prisma/event/*`, implement focused functions for:

- `createDraftEventSession`
- `activateEventSession`
- `cancelEventSession`
- `endEventSessionForReview`
- `addEventSessionChannel`
- `setEventSessionThreadId`
- `upsertEventSessionMessageRef`
- `listOpenEventSelections`
- `listActiveEventSelections`
- `listRecentEventsForAutocomplete`
- `upsertEventParticipantStats`
- `listEventParticipantStats`
- `upsertEventReviewDecision`
- `listEventReviewDecisions`
- `finalizeEventWithMerits`
- `finalizeEventNoMerits`
- `createManualMerit`
- `listMeritsForUser`

Implementation rules:

- Keep each file single-purpose.
- Use transaction boundaries only where atomicity matters (finalization, bulk participant upsert).
- Keep guild filtering explicit if you add `guildId`.

## 8) Redis Integration Layer Plan

Add `src/integrations/redis/eventTracking/*`:

- `startTrackingSession`
- `stopTrackingSession`
- `listActiveTrackingSessionIds`
- `applyTrackingTick`
- `getTrackingParticipantsSnapshot`
- `clearTrackingSession`
- `acquireReviewLock` / `releaseReviewLock` (optional but recommended)

Behavior requirements:

- `applyTrackingTick` increments attended seconds only for current attendee IDs.
- stop/end operation should remove from active set before final flush to prevent concurrent new ticks.

## 9) Utility Layer Recommendation

Add `src/utilities/eventTracking.ts` (Sapphire Utility):

Methods:

- `startSession({ eventSessionId, guildId, startedAtMs })`
- `stopSession({ eventSessionId })`
- `tickAllActiveSessions({ context })`
- `flushSessionToPostgres({ eventSessionId, context })`
- `recoverActiveSessions({ context })`

This utility should orchestrate Redis + Prisma calls and hide low-level store details from commands/handlers/tasks.

## 10) Command Layer (Sapphire Subcommands)

## `src/commands/event.ts`

Subcommands:

- `/event start`
- `/event add-vc`

Recommended optional later:

- `/event status`

Implement autocomplete inside command class for:

- tier selection
- open-event selection

Use preconditions:

- `GuildOnly`
- `EventOperatorOnly` (or `StaffOnly` if you choose to simplify)

## `src/commands/merit.ts`

Subcommands:

- `/merit give`
- `/merit list`

Rules:

- `give`: staff/operator precondition
- `list`: self allowed; targeting others requires staff/operator check inside handler

## 11) Interaction Handler Layer (Sapphire)

Create separate handlers by prefix:

- `event:start:*`
- `event:control:*`
- `event:review:*`
- `merit:list:page:*`

Each handler:

- parse custom ID into typed payload
- create execution context with `flow`, `discordInteractionId`, `customButtonId`
- call feature function

Do not chain multiple button handlers from a single dispatcher function.

## 12) Scheduled Tasks + Recovery

## New scheduled task

- `src/scheduled-tasks/eventTrackingTick.ts`
- interval: `EVENT_TRACKING_TICK_SECONDS * 1000` (or shared VC tick)

Task run:

1. ensure client is ready
2. call `container.utilities.eventTracking.tickAllActiveSessions(...)`
3. catch/log errors with full context

## Ready listener

In `src/listeners/ready.ts`, after division cache refresh:

- call `container.utilities.eventTracking.recoverActiveSessions(...)`

Recovery rules:

- load active DB sessions (`ACTIVE`)
- ensure Redis active set contains them
- flush or clean stale Redis sessions not present in DB active set

## 13) End-to-End Flow Specs for v3

## `/event start`

1. Validate issuer permissions and guild context.
2. Resolve issuer VC channel.
3. Resolve tier.
4. Upsert issuer DB user.
5. Create draft event session + primary channel row.
6. Ensure/create event tracking thread + tracking summary message.
7. Reply with start confirmation embed + buttons.

## Start confirm button

1. Verify session still `DRAFT`.
2. Activate session (`ACTIVE`, `startedAt`).
3. Start Redis tracking session.
4. Post control message (`End Event`, optional `Cancel Event`).
5. Update summary/embed references.

## `/event add-vc`

1. Validate open session selection.
2. Resolve channel option or issuer VC.
3. Upsert session channel (`eventSessionId + channelId` unique).
4. Refresh summary embed.

## End event button

1. Validate session is `ACTIVE`.
2. Stop tracking in Redis (remove active marker first).
3. Flush participant snapshot from Redis to Postgres `EventParticipantStat`.
4. Transition session to `ENDED_PENDING_REVIEW` + `endedAt`.
5. Seed default review decisions.
6. Post review message in tracking thread.

## Review decision buttons

1. Validate session state is still `ENDED_PENDING_REVIEW`.
2. Validate reviewer lock ownership (if lock enabled).
3. Upsert decision for target user.
4. Rebuild and update review page message.

## Review submit buttons

`Submit with no merits`:

- finalize state to `FINALIZED_NO_MERITS` guarded by `updateMany` state + null finalizedAt

`Submit with merits`:

- compute award rows from decisions + tier merit amount
- transaction:
    - guarded finalize update
    - insert merit rows idempotently

After either:

- clear tracking/session channel ephemeral state if desired
- update thread summary/final message

## `/merit give`

1. Validate staff/operator permission.
2. Resolve issuer + target DB users.
3. Optional event association via autocomplete ID.
4. Upsert/create manual merit row.
5. Ephemeral success embed.

## `/merit list`

1. Resolve target user (default executor).
2. Apply access policy (self or staff).
3. Query paginated history.
4. Reply ephemeral embed + paging buttons.
5. Button handler must enforce viewer ownership.

## 14) Authorization and Safety Rules

Implement these explicitly:

- Event start/add-vc/end/review actions require staff/operator precondition.
- Merit list paging buttons are bound to original viewer.
- Review actions require reviewer ownership if you keep lock semantics.
- Finalization must be idempotent and one-way.
- Ignore/reject button payloads with invalid session IDs or target IDs.

## 15) Logging Pattern (match current v3 style)

For every command/handler/task:

- create root context with `createExecutionContext`
- pass down child context with `createChildExecutionContext({ bindings: { step } })`
- include identifiers:
    - `eventSessionId`
    - `discordUserId`
    - `discordInteractionId`
    - `customButtonId` when applicable

Do not create ad-hoc logger singletons in feature code.

## 16) Suggested Implementation Phases

Phase 1 (MVP):

- `/event start`, `/event add-vc`
- start/end buttons
- Redis tick + flush snapshot
- review UI with MERIT/NO_MERIT
- finalize with and without merits

Phase 2:

- reviewer lock ownership
- merit list pagination buttons
- stronger recovery metrics + stale-state cleanup tooling

Phase 3:

- optional extra-merit model
- richer review insights (attendance breakdown per channel)

## 17) Concrete arbiter-v3 Files to Modify First

Start with this sequence:

1. `src/config/env/discord.ts`
2. `src/commands/event.ts`
3. `src/commands/merit.ts`
4. `src/integrations/prisma/event/*`
5. `src/integrations/redis/eventTracking/*`
6. `src/utilities/eventTracking.ts`
7. `src/scheduled-tasks/eventTrackingTick.ts`
8. `src/interaction-handlers/eventStartButtons.ts`
9. `src/interaction-handlers/eventControlButtons.ts`
10. `src/interaction-handlers/eventReviewButtons.ts`
11. `src/interaction-handlers/meritListButtons.ts`
12. `src/listeners/ready.ts` (recovery hook)
13. `docs/PROJECT_ARCHITECTURE_AND_FLOWS.md` (add event/merit section once implemented)

## 18) Non-Goals

- Do not reintroduce sqlite for event tracking.
- Do not reintroduce custom command/interaction dispatch frameworks.
- Do not rely on in-process `Map` as sole source of active event truth.
