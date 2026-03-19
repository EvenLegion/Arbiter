---
title: Codebase Tour
sidebar_position: 3
---

# Codebase Tour

This page explains how the repository is organized today and, more importantly, what each part is responsible for.

The goal is not for you to memorize paths. The goal is for you to understand what kind of code belongs where.

## Top-Level Directories

- `src/`
  Runtime application code.
- `tests/`
  Unit and integration tests.
- `prisma/`
  Split Prisma schema files, seed data, and migration or repair utilities.
- `observability/`
  Loki, Alloy, and Grafana provisioning and configuration.
- `website/`
  The Docusaurus docs site.
- `scripts/`
  Repository automation such as release tooling.
- `.github/workflows/`
  CI, docs publish, and release automation.
- `docker-compose.*.yml`
  Local and production infrastructure entrypoints.

## The Runtime Tree In One Pass

### `src/commands`

Slash command registration and top-level dispatch.

This layer should describe command shape, create an execution context, and hand off. It should not become the home of domain rules.

### `src/interaction-handlers`

Top-level button and modal routing.

This is where custom IDs are decoded and handed off to feature handlers. If you are changing how a button or modal is recognized, this layer is involved. If you are changing what the action means, the change usually belongs deeper.

### `src/listeners`

Gateway lifecycle listeners such as startup and guild-member events.

Listeners are runtime shells. They should gather context, call a feature or service workflow, and log the outcome.

### `src/scheduled-tasks`

Periodic jobs registered through Sapphire scheduled tasks.

Tasks are used for recurring maintenance and event-tracking progression. They are ingress points, not the place to hide domain logic.

### `src/preconditions`

Transport-level permission gates for slash commands.

These are for coarse access decisions such as "staff only" or "staff or centurion", not for every domain rule in the system.

### `src/lib/discord`

Shared Discord-facing helpers.

This area holds reusable transport concerns such as:

- interaction preflight
- interaction response helpers
- autocomplete routing
- custom-id codecs
- guild, member, and actor resolution

If the concern is fundamentally about dealing with Discord as a transport boundary, it probably belongs here.

### `src/lib/features`

Feature-facing orchestration and presentation code.

This is where you will usually find:

- feature handlers
- presenters and payload builders
- feature-local gateways
- dependency assembly helpers such as `create*Deps` or `*Runtime`

The feature layer is the bridge between raw Discord input and domain services.

### `src/lib/services`

Business workflows and domain rules.

If the change is about validation, state transitions, reconciliation, default decisions, or multi-step business behavior, start here.

Services should not need to know about raw interactions, Sapphire containers, or direct Prisma client calls. They should work through explicit collaborators.

### `src/integrations`

Concrete infrastructure boundaries.

Current major integration areas are:

- Prisma
- Redis
- Sapphire runtime access
- Pino logging

If something talks directly to a database, Redis, or another external runtime system, it usually belongs here or behind a feature-local gateway that wraps it.

### `src/utilities`

Long-lived runtime utilities, not general helper code.

This folder is special because Sapphire scans it as a utilities store. Use it for application-lifetime helpers such as the division cache or shared runtime lookup utilities. Do not treat it as a dumping ground for random helpers.

## Naming Conventions That Matter

Arbiter is much easier to navigate once you notice its naming patterns.

Search patterns worth learning:

- `handle*`
  A transport-facing or feature-facing entrypoint.
- `create*Deps` and `*Runtime`
  Dependency assembly. This is usually where Discord, storage, and services are wired together.
- `build*Payload`, `build*Embed`, `build*Row`, `present*`
  Presentation or result mapping.
- `*Repository`
  Domain-shaped storage access surface.
- `sync*`, `reconcile*`, `finalize*`, `initialize*`, `load*`, `record*`
  Service verbs that usually tell you what the workflow owns.

## How To Trace A Flow

When you are new to an area, use this recipe:

1. find the public command name, button action, modal action, listener event, or scheduled task name
2. find the handler that owns that ingress
3. find the service call made by that handler
4. inspect the presenter if the result is rendered back to Discord
5. inspect repositories or gateways only after you understand the workflow contract
6. open the matching tests to see which behavior is already considered important

That order keeps you from confusing transport details with actual business rules.

## Where New Code Usually Belongs

Add code where the responsibility naturally fits:

- new slash command or subcommand:
  command layer plus a feature handler
- new button or modal action:
  interaction handler plus custom-id protocol plus feature handler
- new business rule:
  service layer
- new embed, buttons, or message copy:
  presenter or payload builder
- new storage scenario:
  repository surface plus concrete query module
- new Discord side effect:
  gateway or runtime dependency assembly helper
- new long-lived app utility:
  `src/utilities`, but only if it truly owns runtime-lifetime behavior

## Tests And Support Code

The test suite mirrors the runtime split:

- `tests/unit`
  pure logic, presenters, handlers, edge helpers, and service branching
- `tests/integration`
  Prisma and Redis-backed workflows with real infrastructure via Testcontainers

If you are changing durable state behavior, expect to add or update integration coverage. If you are only changing branching or presentation, unit tests are usually the right first stop.

## Prisma And Schema Notes

The Prisma schema is intentionally split across numbered files under `prisma/schema/`. There is not a single monolithic `schema.prisma` file in this repo.

Also note the distinction between:

- schema and migrations used by the normal application lifecycle
- migration or repair utilities under `prisma/migration/`, which are operational helpers rather than part of the main runtime path

## The Most Important Takeaway

The repository is organized around responsibilities, not around Discord commands alone.

If you remember only one rule from this page, make it this one:

Find the smallest layer that can own the change clearly, and make that layer responsible instead of pushing the behavior outward into command classes or inward into low-level query code.
