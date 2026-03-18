---
title: Discord Extension Patterns
sidebar_position: 3
---

# Discord Extension Patterns

This page documents the extension patterns contributors are expected to reuse instead of re-inventing.

## Pattern 1: Slash Command -> Handler -> Service -> Presenter

Current example:

- command:
  `src/commands/merit.ts`
- handler:
  `src/lib/features/merit/manual-award/handleGiveMerit.ts`
- service:
  `src/lib/services/manual-merit/manualMeritService.ts`
- adapter assembly:
  `src/lib/features/merit/manual-award/manualMeritServiceAdapters.ts`
- presenter:
  `src/lib/features/merit/manual-award/manualMeritResultPresenter.ts`

Use this pattern when:

- the command changes domain state
- the workflow needs typed branching
- Discord copy should stay separate from workflow rules
- the workflow depends on side effects that should stay explicit

Checklist:

1. create the command shell
2. create a feature handler that does preflight and input parsing
3. call a service with typed input
4. assemble Discord and persistence dependencies in adapters or gateways
5. map the service result through a presenter when the output has more than one branch

The adapter step is not accidental. It exists so the service can receive named collaborators instead of reaching into global helpers or container state on its own.

## Pattern 2: Autocomplete Route Table

Current examples:

- `src/lib/features/merit/autocomplete/meritAutocompleteProvider.ts`
- `src/lib/features/merit/autocomplete/meritAutocompleteRoutes.ts`
- `src/lib/features/event-merit/session/eventAutocompleteProvider.ts`
- `src/lib/features/staff/staffAutocompleteProvider.ts`

Core helpers:

- `src/lib/discord/autocompleteRouter.ts`
- `src/lib/discord/autocompleteRouteHelpers.ts`
- `src/lib/discord/autocompleteResponder.ts`

Use this pattern when:

- one command has multiple autocomplete options
- different options need different loaders or permission rules

The expected shape is:

1. command `autocompleteRun(...)` calls a provider
2. provider passes a route list into `routeAutocompleteInteraction(...)`
3. small route helpers or choice builders do the real work

Keep provider files declarative. Push branching policy into small helpers when it is reusable.

## Pattern 3: Routed Button Or Modal Handler

Current examples:

- `src/interaction-handlers/eventReviewButtons.ts`
- `src/interaction-handlers/meritListButtons.ts`
- `src/interaction-handlers/nameChangeReviewEditModal.ts`

Core helper:

- `src/lib/discord/routedInteractionHandler.ts`

Use this pattern when:

- the interaction can be decoded into a stable typed payload
- you want consistent flow bindings and execution context creation

Expected shape:

1. the interaction handler decodes the payload
2. the interaction handler adds a few context bindings
3. the interaction handler routes to a feature handler

The feature handler still owns preflight and response behavior.

## Pattern 4: Typed Custom-Id Codec

Core helper:

- `src/lib/discord/customId.ts`

Current examples:

- `src/lib/features/merit/parseMeritListButton.ts`
- `src/lib/features/event-merit/review/eventReviewDecisionCustomId.ts`
- `src/lib/features/event-merit/review/eventReviewPagingCustomId.ts`
- `src/lib/features/division-selection/parseDivisionSelection.ts`

Use this pattern when:

- a button or modal needs stable structured parameters
- a feature owns more than one custom-id family

Prefer:

- a small codec per custom-id family
- typed parse results
- route/controller code that branches on typed `action`, not raw string slices

## Pattern 5: Read Service + Presenter

Current example:

- handler:
  `src/lib/features/merit/read/handleMeritList.ts`
- read service:
  `src/lib/services/merit-read/meritReadService.ts`
- adapters:
  `src/lib/features/merit/read/meritReadServiceAdapters.ts`
- presenter:
  `src/lib/features/merit/read/meritListView.ts`
- payload builder:
  `src/lib/features/merit/presentation/buildMeritListPayload.ts`

Use this pattern for:

- pagination
- access-controlled read flows
- presentation-heavy features that do not mutate state

## Common Mistakes To Avoid

- do not put domain rules directly in command classes
- do not make autocomplete providers own large permission branches inline if a small helper can own them
- do not let handlers construct large Discord payloads inline when a presenter or payload builder is warranted
- do not add raw string parsing for buttons when a typed custom-id codec fits

## Read This Next

- For layer definitions:
  [Codebase Terminology](/architecture/codebase-terminology)
- For the rationale behind service dependencies:
  [Service And Dependency Design](/architecture/service-dependency-design)
- For extension guidance:
  [Adding Features](/contributing/adding-features)
- For public examples:
  [Command And Interaction Catalog](/reference/command-and-interaction-catalog)
