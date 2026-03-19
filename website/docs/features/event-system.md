---
title: Event And Merit Workflows
sidebar_position: 1
---

# Event And Merit Workflows

The event and merit area is the most stateful part of Arbiter. It combines:

- user-invoked commands
- button-driven state transitions
- scheduled background work
- Redis-backed live tracking
- Postgres-backed review and award state
- Discord presentation that is updated over time rather than posted once and forgotten

If you can follow this area, the rest of the repo becomes much easier.

## The Event Lifecycle At A Glance

An event moves through a clear series of phases:

1. an operator creates a draft event from a voice channel
2. the draft gets a tracking thread and summary presentation
3. staff or centurions start the draft, which activates live attendance tracking
4. operators can add child voice channels to the tracked set
5. a scheduled task records attendance ticks while the event is active
6. ending the event freezes live tracking and initializes review state
7. reviewers inspect attendance, adjust decisions if needed, and finalize with or without merits

That sequence is why the code is split into lifecycle, tracking, review, and presentation concerns instead of one large "event" handler.

## Draft Creation

The event flow starts when an operator uses the event start command.

At draft creation time, Arbiter does more than insert a row:

- validates the selected event tier
- resolves the operator's current voice channel
- creates a tracking thread
- persists the draft event session
- stores channel and message references needed for future syncs
- posts the initial tracking summary

The important design point is that draft creation establishes both durable state and future presentation anchors. That is why the workflow stores message references instead of treating Discord posts as write-only side effects.

## Draft To Active

A draft event becomes active through a button-driven transition.

That transition is responsible for:

- validating the current session state
- recording the start timestamp
- updating lifecycle presentation
- starting Redis-backed live attendance tracking

The state transition itself is a service concern. The button handler only supplies actor context and decides how to present the result.

## Adding Child Voice Channels

Active or draft events can track more than one voice channel.

The add-voice-channel workflow exists because event operations are not always confined to a single parent channel.

That workflow must:

- verify that the actor is allowed to perform the action
- verify that the target event is in a mutable state
- prevent channel collisions across event sessions
- optionally rename the new voice channel
- update the stored tracked-channel set
- synchronize tracking summary presentation
- post timeline or announcement messages where appropriate

This is a good example of why Arbiter prefers explicit workflow services over ad hoc handler logic. The operation has enough state and side effects that hiding it in a command handler would be fragile.

## Live Attendance Tracking

While an event is active, a scheduled task periodically inspects the tracked voice channels and applies attendance ticks.

The tracking loop works roughly like this:

1. load active tracking session IDs from Redis
2. reconcile those IDs against active event sessions in Postgres
3. resolve the configured guild and tracked voice channels
4. gather the current non-bot attendees
5. increment attendance counters in Redis

Two design choices matter here:

- Redis is used because live tick updates are transient and frequent
- Postgres still determines which sessions are actually active, so stale Redis state can be cleaned up safely

If you are changing live attendance behavior, you usually need to think about both the scheduled task and the service that applies the tracking tick.

## Ending An Event And Initializing Review

Ending an event is not the same thing as finalizing its review.

When an active event ends, Arbiter:

- records the end timestamp
- stops live tracking
- snapshots tracked attendance into durable participant stats
- seeds review decisions based on the configured minimum attendance threshold
- synchronizes the review message

That split is important because it gives staff a chance to inspect and adjust the review before merits are awarded.

## Review Flow

The review phase lives on durable data, not live tracking state.

Review presentation is paginated and includes:

- attendee list
- attended time
- attendance percentage
- current merit or no-merit decision
- controls for paging and changing decisions
- controls for finalizing with merits or without merits

By the time the review is visible, the workflow should be operating on persisted participant stats and review decisions. That makes the review phase restart-safe and auditable.

## Finalization

Finalizing review is the point where event tracking turns into final business outcomes.

Depending on the chosen mode, finalization may:

- award merits to approved participants
- update event session final state
- synchronize nicknames for awarded users
- synchronize tracking or review presentation
- clean up tracked-channel rows and transient review state

If you are changing what "finalization" means, start in the finalization service first. Presentation changes come second.

## Why Presentation Is Separate In This Area

Event workflows update Discord messages repeatedly over the lifetime of a session.

That is why the repo stores message references and has dedicated presentation sync helpers. Presentation here is not a one-time reply. It is a long-lived projection of evolving workflow state.

This separation pays off because contributors can change:

- lifecycle rules
- review rules
- embed and button layout
- message-sync behavior

without forcing all of those concerns into one file.

## Manual Merit Awards

Not all merits come from event finalization.

Arbiter also supports manual merit awards. That flow typically:

- resolves the target member
- validates the requested merit type
- optionally links the award to a recent event session
- persists the award
- synchronizes the recipient nickname
- sends rank-up or direct-message notifications when appropriate

This workflow is intentionally separate from event finalization because the business rules and operator intent are different.

## Merit Read Flow

The merit list flow is the main read-oriented merit workflow.

It loads a user's merit summary and paginated entries, then maps that summary into a Discord-friendly view. Staff can inspect other users; non-staff are restricted to their own records.

This is a useful example of the "read service plus presenter" pattern in the repo.

## Merit Rank And Nickname Interaction

Merit totals are not just reporting data. They also feed nickname computation through merit-rank symbols.

That means changes to:

- merit thresholds
- merit award amounts
- finalization behavior
- nickname rules

can interact in ways that cross feature boundaries. Be careful when changing one without checking the others.

## Where To Start For Common Changes

### Change Event State Rules

Start in the event lifecycle services.

Typical examples:

- who can start or end
- which transitions are legal
- what happens when a draft is canceled

### Change Live Tracking Behavior

Start in the event tracking service and the scheduled task that drives it.

Typical examples:

- which attendees count
- how stale sessions are handled
- how missing channels are treated

### Change Review Defaults Or Finalization Rules

Start in review initialization or finalization services.

Typical examples:

- default merit threshold behavior
- who receives merits
- what gets cleaned up after finalization

### Change Embeds, Buttons, Or Timeline Messages

Start in the presentation builders and sync helpers.

Typical examples:

- review page layout
- summary message controls
- lifecycle timeline copy

### Change Manual Merit Awards

Start in the manual merit service and only touch presentation once the workflow contract is right.

## Testing Guidance For This Area

Use unit tests for:

- lifecycle branching
- presentation builders
- review decision rules
- merit rank helpers

Use integration tests for:

- event session persistence behavior
- review finalization
- Redis-backed tracking
- manual merit flows that depend on storage behavior

If a change crosses Redis and Postgres boundaries, assume integration coverage is required.

## Search Terms That Work Well

When navigating this area, useful search terms include:

- public command names such as `event` or `merit`
- workflow verbs such as `createEventDraft`, `tickAllActiveEventTrackingSessions`, `initializeEventReview`, `finalizeEventReview`, and `awardManualMerit`
- `buildEventReviewPayload` or `buildEventTrackingSummaryPayload` for presentation issues
- `eventSessionId` when following logs or cross-cutting workflow code

## The Main Takeaway

The event and merit area is not complicated because the repo is over-abstracted. It is complicated because the domain itself is multi-step, long-lived, and stateful.

The repo's split is there to keep that complexity visible and testable.
