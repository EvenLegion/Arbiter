---
title: Adding Features
sidebar_position: 1
---

# Adding Features

## Preferred Shape

The default shape for new behavior is:

1. command or interaction entrypoint
2. feature handler
3. service
4. inline deps or a small runtime-support module
5. presenter or payload builder
6. tests

That keeps Discord transport, business rules, infrastructure, and UI output separate enough to evolve independently.

## Add A New Slash Command

1. Register the command in `src/commands/`.
2. Use `createCommandExecutionContext(...)` in the command class.
3. Create a feature handler in `src/lib/features/<feature>/`.
4. Use preflight helpers such as `resolveConfiguredGuild`, `resolveGuildMember`, or `resolveInteractionActor`.
5. Put business decisions in `src/lib/services/<feature>/`.
6. If the service needs Discord or persistence side effects, assemble them inline when the dependency object is short, or use a small runtime-support module when the wiring is reused or noisy.

## Add A New Button Or Modal Flow

1. Create or extend a typed custom-id codec.
2. Add an interaction handler in `src/interaction-handlers/`.
3. Reuse `RoutedButtonInteractionHandler` or `RoutedModalInteractionHandler` when possible.
4. Route into a feature handler.
5. Reuse the service layer if the flow changes domain state.

## Add A New Read Flow

For read-heavy features:

- put access and selection rules in a read service
- keep payload building in a presenter or payload builder
- keep the handler limited to transport and preflight

Current best example:

- `src/lib/services/merit-read/`

## Add A New Write Flow

For write-heavy features:

- put the workflow in a service
- keep result kinds explicit
- assemble repositories and Discord gateways inline or in a small runtime-support module
- map typed results to Discord copy in a presenter when branching grows
- keep the service dependencies explicit instead of reaching for centralized runtime helpers

Current best examples:

- `src/lib/services/manual-merit/`
- `src/lib/services/name-change/`
- `src/lib/services/event-lifecycle/`

## Add Autocomplete

Use the shared autocomplete pattern:

- provider file
- route table
- small guard or access-policy helpers
- choice builders

Current best examples:

- `src/lib/features/merit/autocomplete/`
- `src/lib/features/event-merit/session/autocomplete/eventAutocompleteProvider.ts`

## Where To Put Shared Code

- shared Discord transport helpers:
  `src/lib/discord/`
- shared domain abstractions:
  `src/lib/services/_shared/`
- feature-specific Discord glue:
  `src/lib/features/<feature>/`
- data access:
  `src/integrations/prisma/repositories/`
- long-lived runtime state:
  `src/utilities/` only when it should be a real runtime utility piece

If shared code is only meaningful inside one feature, keep it inside that feature folder.

For service design specifically:

- inject named collaborators into services through inline objects or small runtime-support modules
- do not let services reach into `container.*`, raw interactions, or raw `prisma.*`
- prefer pure helpers for local logic, but use gateways or repositories for side-effect boundaries

For Prisma specifically:

- expose new persistence operations through a repository first
- implement the concrete query or transaction in the owning aggregate folder
- avoid forwarding-only `read.ts`, `write.ts`, or query-barrel files unless they add a real stability boundary

## Feature Checklist

Before opening a PR, check:

- does the command or interaction shell stay small?
- does the service own the rule instead of the handler?
- if a `create*Deps.ts` file exists, does it only assemble dependencies?
- is the result or payload mapping explicit?
- did you add or update request-correlated logs where the new behavior changes state or performs important side effects?
- is the new behavior covered by at least one targeted test?
- do the docs need an update?

## Docs Are Part Of The Feature

If you change:

- command surfaces
- interaction surfaces
- feature boundaries
- extension patterns
- onboarding expectations

update the docs in the same change. Use [Maintaining Docs](/contributing/maintaining-docs) for the checklist.

## Read This Next

- For worked extension examples:
  [Discord Extension Patterns](/architecture/discord-extension-patterns)
- For code placement rules:
  [Codebase Terminology](/architecture/codebase-terminology)
- For why services are wired this way:
  [Service And Dependency Design](/architecture/service-dependency-design)
- For logging expectations:
  [Logging And Observability](/architecture/logging-and-observability)
- For Prisma-specific persistence rules:
  [Prisma Integration](/architecture/prisma-integration)
- For docs updates:
  [Maintaining Docs](/contributing/maintaining-docs)
