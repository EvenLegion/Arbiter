---
title: Event System
sidebar_position: 1
---

# Event System

## What It Covers

The event system manages the full lifecycle of an event:

- draft creation
- tracked voice-channel expansion
- start, cancel, and end transitions
- live attendance tracking
- review decisions
- merit finalization
- Discord message synchronization for lifecycle, review, and tracking views

## Public Entry Points

- `/event start`
- `/event add_vc`
- event start buttons
- event review buttons
- scheduled task:
  `src/scheduled-tasks/eventTrackingTick.ts`

## Main Boundaries

Primary services:

- `src/lib/services/event-lifecycle/`
- `src/lib/services/event-review/`
- `src/lib/services/event-tracking/`

Primary feature subdomains:

- `src/lib/features/event-merit/session/`
- `src/lib/features/event-merit/review/`
- `src/lib/features/event-merit/tracking/`
- `src/lib/features/event-merit/presentation/`
- `src/lib/features/event-merit/gateways/`

## Read This Section Based On Your Task

- changing `/event start`, `/event add_vc`, or start-button behavior:
  [Event Session Lifecycle](/features/event-session-lifecycle)
- changing attendee review or finalization:
  [Event Review And Finalization](/features/event-review-and-finalization)
- changing tracking tick behavior or Redis-backed attendance state:
  [Event Attendance Tracking](/features/event-attendance-tracking)
- changing message sync, embeds, or review UI:
  [Event Discord Presentation](/features/event-discord-presentation)

## Why The Event System Is Split

The event area is intentionally split into three services because the risks are different:

- `event-lifecycle`
  owns session state transitions and channel topology
- `event-review`
  owns review-page loading and review decisions
- `event-tracking`
  owns attendance ticking and Redis-backed operational state

That split prevents one giant “event service” from mixing:

- state-machine rules
- review policy
- live Discord voice-state reconciliation
- message rendering

## Common Extension Points

- new lifecycle transition or state rule:
  `src/lib/services/event-lifecycle/`
- new review control or review-page behavior:
  `src/lib/services/event-review/` and `src/lib/features/event-merit/review/`
- new tracking rule or attendance behavior:
  `src/lib/services/event-tracking/`
- new Discord output:
  `src/lib/features/event-merit/presentation/` and review/session presenters

## Before Editing

Read these first:

- `src/commands/event.ts`
- `src/lib/features/event-merit/session/draft/handleEventStart.ts`
- `src/lib/features/event-merit/review/buttons/handleEventReviewButton.ts`
- `src/lib/services/event-lifecycle/index.ts`
- `src/lib/services/event-review/eventReviewService.ts`
- `src/lib/services/event-tracking/eventTrackingService.ts`

## Related Docs

- [Event Session Lifecycle](/features/event-session-lifecycle)
- [Event Review And Finalization](/features/event-review-and-finalization)
- [Event Attendance Tracking](/features/event-attendance-tracking)
- [Event Discord Presentation](/features/event-discord-presentation)
- [Aggregate Reference](/reference/aggregate-reference)
