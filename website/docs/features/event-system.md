---
title: Event And Merit Workflows
sidebar_position: 4
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

## Source Of Truth By Phase

This workflow family makes more sense once you stop thinking of "the event system" as one block of state.

| Phase           | Primary source of truth                                        | Why                                                                     |
| --------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Draft creation  | Postgres plus stored message references                        | The event needs durable identity and presentation anchors immediately   |
| Active tracking | Postgres for session truth, Redis for live attendance counters | Live ticks are frequent, but legal session state must survive restarts  |
| Review          | Postgres participant stats and review decisions                | Review must be restart-safe and auditable                               |
| Finalization    | Postgres merits and final session state                        | The outcome needs to survive and feed later workflows such as nicknames |

The important boundary is event end: Arbiter snapshots Redis attendance state into durable Postgres review state before finalization happens.

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

At draft creation time, Arbiter does more than insert a row:

- validates the selected event tier
- resolves the operator's current voice channel
- creates a tracking thread
- persists the draft event session
- stores channel and message references needed for future syncs
- posts the initial tracking summary

Draft creation establishes both durable state and future presentation anchors. That is why the workflow stores message references instead of treating Discord posts as write-only side effects.

## Activation And Mutable Session Work

A draft becomes active through a button-driven transition. That transition:

- validates the current session state
- records the start timestamp
- updates lifecycle presentation
- starts Redis-backed live attendance tracking

Active or draft events can also track more than one voice channel. The add-voice-channel workflow must:

- verify actor permissions
- verify the session is still mutable
- prevent channel collisions across event sessions
- optionally rename the new voice channel
- update the stored tracked-channel set
- synchronize tracking summary presentation
- post timeline or announcement messages where appropriate

## Live Attendance Tracking

While an event is active, a scheduled task periodically inspects tracked voice channels and applies attendance ticks.

The tracking loop works roughly like this:

1. load active tracking session IDs from Redis
2. reconcile those IDs against active event sessions in Postgres
3. resolve the configured guild and tracked voice channels
4. gather the current non-bot attendees
5. increment attendance counters in Redis

Two design choices matter:

- Redis is used because live tick updates are transient and frequent
- Postgres still determines which sessions are actually active, so stale Redis state can be cleaned up safely

If you are changing live attendance behavior, think about both the scheduled task and the service that applies the tracking tick.

## Ending An Event And Initializing Review

Ending an event is not the same thing as finalizing its review.

When an active event ends, Arbiter:

- records the end timestamp
- stops live tracking
- snapshots tracked attendance into durable participant stats
- seeds review decisions based on the configured minimum attendance threshold
- synchronizes the review message

That split gives staff a chance to inspect and adjust the review before merits are awarded.

## Review And Finalization

The review phase lives on durable data, not live tracking state.

Review presentation is paginated and includes:

- attendee list
- attended time
- attendance percentage
- current merit or no-merit decision
- controls for paging and changing decisions
- controls for finalizing with merits or without merits

Finalization is the point where tracking turns into final business outcomes. Depending on the chosen mode, finalization may:

- award merits to approved participants
- update event session final state
- synchronize nicknames for awarded users
- synchronize tracking or review presentation
- clean up tracked-channel rows and transient review state

If you are changing what "finalization" means, start in the finalization service first. Presentation changes come second.

## Manual Merit Awards And Merit Reads

Not all merits come from event finalization.

Manual merit awards typically:

- resolve the target member
- validate the requested merit type
- optionally link the award to a recent event session
- persist the award
- synchronize the recipient nickname
- send rank-up or direct-message notifications when appropriate

The merit list flow is the main read-oriented merit workflow. It loads a user's merit summary and paginated entries, then maps that summary into a Discord-friendly view. Staff can inspect other users; non-staff are restricted to their own records.

## Where The Code Usually Lives

Today this area is concentrated in a few predictable places:

| Concern                     | Main feature directories                    | Main service directories                           |
| --------------------------- | ------------------------------------------- | -------------------------------------------------- |
| Event session lifecycle     | `src/lib/features/event-merit/session`      | `src/lib/services/event-lifecycle`                 |
| Live tracking               | `src/lib/features/event-merit/tracking`     | `src/lib/services/event-tracking`                  |
| Review flow                 | `src/lib/features/event-merit/review`       | `src/lib/services/event-review`                    |
| Event presentation and sync | `src/lib/features/event-merit/presentation` | usually driven by the lifecycle or review services |
| Manual merit awards         | `src/lib/features/merit/manual-award`       | `src/lib/services/manual-merit`                    |
| Merit read flow             | `src/lib/features/merit/read`               | `src/lib/services/merit-read`                      |

That path map is meant as a current orientation aid, not a contract that file names will never move.

## Cross-Feature Coupling To Remember

Merit totals are not just reporting data. They feed nickname computation through merit-rank symbols.

That means changes to:

- merit thresholds
- merit award amounts
- finalization behavior
- nickname rules

can interact across feature boundaries. Check the membership and identity workflow before assuming a merit-only change is isolated.

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

Useful search terms in this area include:

- public command names such as `event` or `merit`
- workflow verbs such as `createEventDraft`, `tickAllActiveEventTrackingSessions`, `initializeEventReview`, `finalizeEventReview`, and `awardManualMerit`
- `buildEventReviewPayload` or `buildEventTrackingSummaryPayload` for presentation issues
- `eventSessionId` when following logs or cross-cutting workflow code

## The Main Takeaway

The event and merit area is not complicated because the repo is over-abstracted. It is complicated because the domain itself is multi-step, long-lived, and stateful.

The repo's split is there to keep that complexity visible and testable.
