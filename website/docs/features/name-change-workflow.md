---
title: Name Change Workflow
sidebar_position: 7
---

# Name Change Workflow

## What It Covers

The name-change flow lets a user submit a nickname change request and lets staff review, edit, approve, or deny that request.

## Public Entry Points

- `/ticket name_change`
- name-change review buttons
- name-change review edit modal

Primary code:

- command shell:
  `src/commands/ticket.ts`
- interaction handlers:
  `src/interaction-handlers/nameChangeReviewButtons.ts`
  and `src/interaction-handlers/nameChangeReviewEditModal.ts`
- feature layer:
  `src/lib/features/ticket/`
- service layer:
  `src/lib/services/name-change/`

## Submission Flow

`/ticket name_change` routes through:

- `src/lib/features/ticket/handleNameChangeTicket.ts`
- `src/lib/services/name-change/submitNameChangeRequest.ts`
- `src/lib/features/ticket/nameChangeTicketResultPresenter.ts`

The service owns:

- requested-name normalization
- nickname validation
- request creation
- review-thread creation request
- review-thread reference persistence

The feature layer owns Discord thread creation and ticket-facing copy.

## Review Flow

Review buttons route through:

- `src/lib/features/ticket/handleNameChangeReviewButton.ts`
- `src/lib/features/ticket/reviewNameChangeAction.ts`
- `src/lib/services/name-change/reviewNameChangeDecision.ts`

Editing a pending request uses:

- `src/lib/features/ticket/handleNameChangeReviewEditModal.ts`
- `src/lib/services/name-change/editPendingNameChangeRequest.ts`

Current presentation files include:

- `nameChangeReviewPresenter.ts`
- `nameChangeReviewEditModalPresenter.ts`
- `nameChangeReviewResultPresenter.ts`
- `nameChangeTicketResultPresenter.ts`

## Why It Is Built This Way

Name changes are more than a single Discord nickname mutation:

- the requested name must be normalized
- nickname rules still need to pass organization formatting constraints
- staff need an auditable review surface
- thread and review UI need to stay synchronized with request state

That is why the workflow is split into:

- service logic for validation and state transitions
- feature adapters and gateways for Discord thread and member effects
- presenters for embeds, modals, and ticket-facing result copy

## Common Extension Points

- new validation rule:
  `src/lib/services/name-change/`
- new review UI:
  ticket presenters
- new thread side effect:
  `nameChangeReviewThreadGateway.ts` and related feature modules

## Before Editing

Read these first:

- `src/commands/ticket.ts`
- `src/lib/features/ticket/handleNameChangeTicket.ts`
- `src/lib/features/ticket/handleNameChangeReviewButton.ts`
- `src/lib/features/ticket/handleNameChangeReviewEditModal.ts`
- `src/lib/services/name-change/nameChangeService.ts`

## Related Docs

- [Discord Extension Patterns](/architecture/discord-extension-patterns)
- [Architecture Vocabulary](/architecture/vocabulary)
- [Aggregate Reference](/reference/aggregate-reference)
