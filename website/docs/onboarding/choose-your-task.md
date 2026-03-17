---
title: Choose Your Task
sidebar_position: 1
---

# Choose Your Task

Use this page when you know what you want to change, but you do not yet know which docs to read first.

## Add A Slash Command

Read in this order:

1. [Repository Map](/onboarding/repository-map)
2. [Discord Execution Model](/architecture/discord-execution-model)
3. [Adding Features](/contributing/adding-features)
4. the owning feature page
5. [Command And Interaction Catalog](/reference/command-and-interaction-catalog)

Best code examples:

- `src/commands/merit.ts`
- `src/commands/event.ts`

## Add Autocomplete

Read in this order:

1. [Discord Extension Patterns](/architecture/discord-extension-patterns)
2. [Discord Execution Model](/architecture/discord-execution-model)
3. the owning feature page

Best code examples:

- `src/lib/features/merit/autocomplete/`
- `src/lib/features/event-merit/session/eventAutocompleteProvider.ts`
- `src/lib/features/staff/staffAutocompleteProvider.ts`

## Add A Button Or Modal Flow

Read in this order:

1. [Discord Extension Patterns](/architecture/discord-extension-patterns)
2. [Discord Execution Model](/architecture/discord-execution-model)
3. the owning feature page
4. [Command And Interaction Catalog](/reference/command-and-interaction-catalog)

Best code examples:

- `src/interaction-handlers/eventReviewButtons.ts`
- `src/interaction-handlers/nameChangeReviewEditModal.ts`
- `src/lib/discord/routedInteractionHandler.ts`

## Change A Write Workflow

Read in this order:

1. the owning feature page
2. [Architecture Vocabulary](/architecture/vocabulary)
3. [Aggregate Reference](/reference/aggregate-reference)
4. [Testing And Refactors](/contributing/testing-and-refactors)

Best current service examples:

- `src/lib/services/manual-merit/`
- `src/lib/services/name-change/`
- `src/lib/services/event-lifecycle/`

## Change A Read Flow

Read in this order:

1. the owning feature page
2. [Architecture Vocabulary](/architecture/vocabulary)
3. [Adding Features](/contributing/adding-features)

Best current read-service example:

- `src/lib/services/merit-read/`

## Change Persistence Or Repositories

Read in this order:

1. [Data And Storage](/architecture/data-and-storage)
2. [Aggregate Reference](/reference/aggregate-reference)
3. [Testing And Refactors](/contributing/testing-and-refactors)

Best current entrypoints:

- `src/integrations/prisma/repositories/`
- `src/integrations/redis/eventTracking/`

## Change A Listener Or Scheduled Task

Read in this order:

1. [Runtime Overview](/architecture/runtime-overview)
2. [Discord Execution Model](/architecture/discord-execution-model)
3. the relevant feature page

Best current examples:

- `src/listeners/guildMemberUpdate.ts`
- `src/listeners/ready.ts`
- `src/scheduled-tasks/eventTrackingTick.ts`

## Update Or Add Documentation

Read in this order:

1. [Maintaining Docs](/contributing/maintaining-docs)
2. [Repository Map](/onboarding/repository-map)
3. the relevant feature or architecture page

Use docs changes whenever you:

- move a handler, service, presenter, or repository
- change the extension pattern for a feature
- add a new command, subcommand, or interaction surface
- change onboarding or test expectations
