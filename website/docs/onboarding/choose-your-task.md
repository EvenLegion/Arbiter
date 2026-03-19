---
title: Choose Your Task
sidebar_position: 1
---

# Choose Your Task

Start here when you know the change you need, but you do not yet know which slice of the repo should own it.

## The Default Strategy

Trace from the public surface inward:

1. find the command, button, modal, listener, or task that starts the flow
2. find the feature handler that translates transport input into workflow input
3. find the service that owns the rule you actually want to change
4. find the presenter, repository, or gateway only if the change is really about output, persistence, or side effects

If you start in a deep query module before you understand the flow, you will usually over-edit.

## Add Or Change A Slash Command

Read first:

- [Codebase Tour](/onboarding/repository-map)
- [System Overview](/architecture/runtime-overview)
- [Request Flow And Extension Points](/architecture/discord-execution-model)
- [Making Changes Safely](/contributing/adding-features)

What to search for:

- the public command name
- `registerApplicationCommands`
- `chatInput`

What usually changes:

- command registration and option definitions
- one feature handler
- one or more services or presenters
- tests for the handler result mapping and the underlying workflow

The command class should stay small. It should define options, create an execution context, and hand off.

## Add Or Change Autocomplete

Read first:

- [Request Flow And Extension Points](/architecture/discord-execution-model)
- [State, Storage, And Integrations](/architecture/data-and-storage) if the choices come from Postgres or Redis

What to search for:

- `autocompleteRun`
- `routeAutocompleteInteraction`
- `createGuildScopedAutocompleteRoute`
- `createQueryAutocompleteRoute`

What usually changes:

- one new route definition
- a small choice builder or search helper
- actor or guild scoping if visibility rules matter

Autocomplete should stay read-only and cheap. If the logic starts to look like workflow mutation, you are in the wrong layer.

## Add Or Change A Button Or Modal Flow

Read first:

- [Request Flow And Extension Points](/architecture/discord-execution-model)
- the workflow page for the domain you are changing

What to search for:

- the visible button label or action name
- `createCustomIdCodec`
- `parse...CustomId`
- `RoutedButtonInteractionHandler` or `RoutedModalInteractionHandler`

What usually changes:

- custom-id encode/decode rules
- one interaction handler
- one feature handler or presenter
- a service if the interaction changes domain state

The custom-id protocol is part of the contract between presentation and behavior. Treat it as designed data, not as a random string blob.

## Change A Business Rule In An Existing Workflow

Read first:

- [System Overview](/architecture/runtime-overview)
- the workflow page for the affected domain
- [Making Changes Safely](/contributing/adding-features)

What to search for:

- the domain verb, not just the command name
- service function names like `create`, `apply`, `load`, `record`, `sync`, `finalize`, or `reconcile`

What usually changes:

- a service
- unit tests
- sometimes presenters if the result contract changes

If the change affects eligibility, validation, state transitions, default decisions, or mutation sequencing, the service layer is usually the right home.

## Change Output, Embeds, Buttons, Or Reply Text

Read first:

- [Request Flow And Extension Points](/architecture/discord-execution-model)
- the relevant workflow page

What to search for:

- `build*Payload`
- `build*Embed`
- `build*Row`
- `present*`

What usually changes:

- a presenter or payload builder
- maybe custom-id builders if buttons change
- tests that assert payload shape or branching

Do not move UI text into services just because it is convenient in the moment. Arbiter keeps result mapping explicit on purpose.

## Change Postgres, Redis, Or Query Behavior

Read first:

- [State, Storage, And Integrations](/architecture/data-and-storage)
- [Making Changes Safely](/contributing/adding-features)

What to search for:

- repository names
- aggregate nouns like `event`, `review`, `merit`, `division`, `user`, or `name-change`

What usually changes:

- one repository surface
- one or more concrete query modules
- integration tests

Postgres is the source of durable truth. Redis is only for short-lived event tracking and coordination. If a new piece of state must survive restarts or support reporting, it belongs in Postgres.

## Change Event, Tracking, Review, Or Merit Logic

Read first:

- [Event And Merit Workflows](/features/event-system)
- [State, Storage, And Integrations](/architecture/data-and-storage)
- [Logging And Observability](/architecture/logging-and-observability)

What to look for:

- lifecycle transitions
- tracking tick logic
- review initialization and finalization
- manual merit awarding and merit list read flows

This area is the most stateful part of the repo. It often spans command input, background tasks, Redis snapshots, Postgres persistence, and Discord presentation in one change.

## Change Divisions, Nicknames, Name Changes, Or Guild-Member Automation

Read first:

- [Membership, Identity, And Guild Automation](/features/division-and-membership)
- [State, Storage, And Integrations](/architecture/data-and-storage)

What to look for:

- division selection and membership reconciliation
- nickname computation and sync rules
- name-change request review
- guild member add and update listeners
- development repair commands

This area mixes Discord role truth, database truth, and computed nickname rules. Be explicit about which side is the source of truth for the behavior you are changing.

## Change Logging, Diagnostics, Or Observability

Read first:

- [Logging And Observability](/architecture/logging-and-observability)
- [System Overview](/architecture/runtime-overview)

What to search for:

- `create...ExecutionContext`
- `flow`
- `requestId`
- Pino, Alloy, Loki, or Grafana

What usually changes:

- structured log fields
- response or error logging at ingress points
- local or production observability config

If a change makes production debugging harder, it is probably not finished.

## Change A Listener Or Scheduled Task

Read first:

- [System Overview](/architecture/runtime-overview)
- [Request Flow And Extension Points](/architecture/discord-execution-model)
- the workflow page for the affected domain

What to search for:

- the Discord event name or task name
- the service entrypoint the ingress calls

Listeners and tasks should follow the same rule as commands: gather context, call a workflow, log outcome. They should not become catch-all orchestration files.

## Prepare A Release Or Production Deploy

Read first:

- [Release Workflow](/contributing/release-workflow)
- [Production Deployment](/contributing/production-deployment)

Release and deployment are intentionally documented separately from local development because they depend on generated release metadata and the production Docker stack, not just the runtime code.

## Update The Docs

Read first:

- the page you are changing
- [Making Changes Safely](/contributing/adding-features)

Prefer documenting:

- responsibilities
- naming patterns
- contributor decisions
- search strategies

Avoid over-documenting:

- deep nested file paths that will drift
- path inventories that duplicate `rg`
- screenshots of UI text that changes frequently
