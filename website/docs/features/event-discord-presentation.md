---
title: Event Discord Presentation
sidebar_position: 5
---

# Event Discord Presentation

## What This Page Covers

This page is about the Discord-facing output for event workflows:

- lifecycle message sync
- review payload construction
- tracking summary presentation
- timeline and announcement message helpers

Primary code:

- `src/lib/features/event-merit/presentation/`
- `src/lib/features/event-merit/review/buildEventReviewPayload.ts`
- `src/lib/features/event-merit/session/*ResultPresenter.ts`
- `src/lib/features/event-merit/ui/`
- selected message gateways in `src/lib/features/event-merit/gateways/`

## Presentation Layers In The Event Feature

The event feature uses several presentation layers on purpose:

- result presenters:
  small command/button reply mapping
- payload builders:
  embed and component construction
- presentation sync modules:
  update existing lifecycle, review, or tracking messages
- timeline gateways:
  one-shot announcement or thread-post helpers

This split keeps “what should happen” separate from “what should Discord look like afterward”.

## Current Message-Sync Entry Points

- lifecycle sync:
  `src/lib/features/event-merit/presentation/syncEventLifecyclePresentation.ts`
- review sync:
  `src/lib/features/event-merit/presentation/syncEventReviewPresentation.ts`
- tracking sync:
  `src/lib/features/event-merit/presentation/syncEventTrackingPresentation.ts`

## Review UI Surface

Review UI is built from focused modules such as:

- `buildEventReviewHeaderEmbed.ts`
- `buildEventReviewAttendeeRows.ts`
- `buildEventReviewNavigationRow.ts`
- `buildEventReviewSubmitControlsRow.ts`

These are coordinated by `buildEventReviewPayload.ts`.

## Common Extension Points

- change reply copy:
  session/review result presenters
- change review embed or controls:
  review payload builders
- change lifecycle or tracking message sync:
  presentation sync modules
- add new announcement side effects:
  event gateways

## Common Pitfalls

- do not move event policy into payload builders
- do not let services construct Discord embeds directly
- keep one-shot announcements separate from long-lived message sync

## Before Editing

Read these first:

- `src/lib/features/event-merit/presentation/`
- `src/lib/features/event-merit/review/buildEventReviewPayload.ts`
- `src/lib/features/event-merit/review/eventReviewActionResultPresenter.ts`
- `src/lib/features/event-merit/session/eventStartResultPresenter.ts`
- `src/lib/features/event-merit/session/eventAddVcResultPresenter.ts`

## Related Docs

- [Event System](/features/event-system)
- [Event Session Lifecycle](/features/event-session-lifecycle)
- [Event Review And Finalization](/features/event-review-and-finalization)
