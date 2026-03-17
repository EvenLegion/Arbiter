---
title: Architecture Vocabulary
sidebar_position: 5
---

# Architecture Vocabulary

Use this page when you need to decide where code belongs.

## Command Shell

Purpose:

- register slash commands
- create command execution context
- dispatch to feature handlers

Current examples:

- `src/commands/merit.ts`
- `src/commands/event.ts`

Should not own:

- business rules
- persistence orchestration
- large response branching

## Interaction Handler

Purpose:

- decode a button or modal payload
- build context bindings
- route to a feature handler

Current examples:

- `src/interaction-handlers/eventReviewButtons.ts`
- `src/interaction-handlers/nameChangeReviewEditModal.ts`

Should not own:

- workflow logic
- repository calls
- large presenter logic

## Listener Or Scheduled-Task Shell

Purpose:

- react to runtime events
- create execution context
- call feature or service code

Current examples:

- `src/listeners/guildMemberUpdate.ts`
- `src/scheduled-tasks/eventTrackingTick.ts`

Should not own:

- cross-step workflow rules
- large persistence coordination

## Feature Handler

Purpose:

- read Discord input
- run preflight
- call a service
- route typed results into presenters or payload builders

Current examples:

- `src/lib/features/merit/manual-award/handleGiveMerit.ts`
- `src/lib/features/merit/read/handleMeritList.ts`
- `src/lib/features/ticket/handleNameChangeTicket.ts`

Should not own:

- deep business rules
- aggregate-specific persistence logic

## Adapter

Purpose:

- assemble service dependencies for one feature entrypoint
- translate feature/runtime objects into service-compatible collaborators

Current examples:

- `src/lib/features/merit/manual-award/manualMeritServiceAdapters.ts`
- `src/lib/features/event-merit/review/eventReviewServiceAdapters.ts`

Should not own:

- the workflow itself
- transport branching

## Gateway

Purpose:

- wrap one side-effect boundary or lookup boundary
- give a service or feature code a named collaborator

Current examples:

- `src/lib/features/guild-member/guildNicknameWorkflowGateway.ts`
- `src/lib/features/event-merit/gateways/reviewMessageGateway.ts`

Should not own:

- unrelated orchestration
- user-facing presentation

## Presenter Or Payload Builder

Purpose:

- map typed results into Discord copy
- build embeds, buttons, modals, or messages

Current examples:

- `src/lib/features/merit/manual-award/manualMeritResultPresenter.ts`
- `src/lib/features/merit/presentation/buildMeritListPayload.ts`
- `src/lib/features/event-merit/review/buildEventReviewPayload.ts`

Should not own:

- validation
- persistence
- capability decisions

## Service

Purpose:

- own business rules and workflow sequencing
- return typed results
- stay testable without Discord transport

Current examples:

- `src/lib/services/manual-merit/`
- `src/lib/services/event-lifecycle/`
- `src/lib/services/name-change/`

Should not own:

- raw interaction objects
- embed or button construction

## Repository

Purpose:

- expose domain-shaped persistence operations
- hide low-level Prisma access from features and services

Current examples:

- `src/integrations/prisma/repositories/meritRepository.ts`
- `src/integrations/prisma/repositories/eventRepository.ts`

Should not own:

- Discord side effects
- transport concepts

## Runtime Utility

Purpose:

- own long-lived runtime state or shared framework-registered helper behavior

Current examples:

- `src/utilities/divisionCache.ts`
- `src/utilities/guild.ts`

Use sparingly. Most new business behavior should go into services, not utilities.

## Shared Discord Edge Helper

Purpose:

- centralize Discord transport concerns across features

Current examples:

- `src/lib/discord/interactionPreflight.ts`
- `src/lib/discord/interactionResponder.ts`
- `src/lib/discord/autocompleteRouter.ts`
- `src/lib/discord/customId.ts`

Should not own:

- feature-specific domain rules

## The Fast Rule

If you are unsure where code belongs:

- transport concern:
  `src/lib/discord/`
- one feature’s Discord glue:
  `src/lib/features/<feature>/`
- business rule or workflow:
  `src/lib/services/<feature>/`
- persistence:
  `src/integrations/prisma/repositories/`
- app-lifetime runtime state:
  `src/utilities/`
