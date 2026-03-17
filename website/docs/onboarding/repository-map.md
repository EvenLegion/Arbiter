---
title: Repository Map
sidebar_position: 3
---

# Repository Map

## Top-Level Directories

- `src/`: bot runtime code
- `tests/`: unit and integration tests
- `prisma/`: schema and migration tooling
- `website/`: Docusaurus docs site
- `docs-old/`: historical audits and earlier implementation notes

## `src/` Layout

### Command and interaction entrypoints

- `src/commands/`
  Slash command registration and top-level dispatch.
- `src/interaction-handlers/`
  Button and modal decoding plus top-level dispatch.

### Runtime shells

- `src/listeners/`
  Gateway lifecycle listeners such as `guildMemberAdd`, `guildMemberUpdate`, and `clientReady`.
- `src/preconditions/`
  Whole-command permission gates.
- `src/scheduled-tasks/`
  Periodic jobs backed by Sapphire scheduled tasks.

### Shared Discord edge code

- `src/lib/discord/`
  Shared preflight, response delivery, autocomplete, custom-id, member lookup, and routed interaction helpers.

### Feature code

- `src/lib/features/`
  Discord-facing handlers, presenters, gateways, adapter assembly, and feature-local helper modules.

Common feature shapes:

- `src/lib/features/event-merit/session/`
- `src/lib/features/event-merit/review/`
- `src/lib/features/event-merit/presentation/`
- `src/lib/features/merit/autocomplete/`
- `src/lib/features/merit/read/`
- `src/lib/features/merit/manual-award/`

### Domain services

- `src/lib/services/`
  Business workflows and domain rules.

Examples:

- `event-lifecycle/`
- `event-review/`
- `event-tracking/`
- `manual-merit/`
- `merit-read/`
- `name-change/`
- `nickname/`

### Infrastructure

- `src/integrations/prisma/`
  Prisma client, repositories, and aggregate-specific query helpers.
- `src/integrations/redis/`
  Redis-backed event tracking state.
- `src/integrations/sapphire/`
  Shared runtime shell access such as `runtimeGateway.ts`.

### Runtime utilities

- `src/utilities/`
  Long-lived runtime services and helper modules that still benefit from app-lifetime state.

Current examples:

- division cache
- division role policy
- guild lookup
- user directory
- event-tracking helper modules

## Where New Code Should Go

### Add a new slash command

- register it in `src/commands/`
- route it to a feature handler in `src/lib/features/...`
- put business rules in `src/lib/services/...`

### Add a new button or modal flow

- add or extend a codec near the owning feature
- register an interaction handler in `src/interaction-handlers/`
- route to a feature handler
- keep domain state changes in a service

### Add a new read flow

- prefer a read service under `src/lib/services/...`
- keep payload building in feature presenters
- keep the handler focused on transport and preflight

### Add a new write flow

- put the workflow in a service
- assemble Discord and persistence dependencies in feature adapters or gateways
- keep Discord copy in presenters

### Add a new database operation

- add domain-shaped access in `src/integrations/prisma/repositories/`
- keep family-local helper modules near the aggregate if a query needs extra structure

### Add shared Discord plumbing

- prefer `src/lib/discord/` for transport-facing concerns
- prefer `src/utilities/` only when the concern is truly long-lived runtime state

## Why The Code Is Split This Way

Earlier versions of the repo mixed transport, business logic, persistence, and UI construction in the same files.

The current layout exists so contributors can:

- trace a workflow without reading unrelated Discord setup
- test service behavior outside Discord
- change UI payloads without rereading persistence code
- find storage behavior by aggregate instead of by command

## Read This Next

- For terminology:
  [Architecture Vocabulary](/architecture/vocabulary)
- For extension rules:
  [Adding Features](/contributing/adding-features)
- For task-based onboarding:
  [Choose Your Task](/onboarding/choose-your-task)
