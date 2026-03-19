---
title: Arbiter Docs
slug: /
sidebar_position: 1
---

# Arbiter Docs

Arbiter is Even Legion's Discord operations bot. It owns event session workflows, merit awarding and rank progression, division and nickname automation, name-change review, and the runtime plumbing that keeps Discord state aligned with persisted state.

This site is written for contributors. The assumption is that the reader has zero context on the codebase and needs to answer three questions quickly:

- what the bot is responsible for
- how the code is split and why
- where to start when making a specific change

## What These Docs Optimize For

These docs deliberately favor stable concepts over deep path inventories.

The code can move. The responsibilities are much more stable:

- runtime shells accept Discord or scheduled-task input
- feature handlers translate that input into workflow input
- services own business rules and typed outcomes
- repositories and gateways talk to storage or external side effects
- presenters build messages, embeds, buttons, and reply payloads

That tradeoff is intentional. The goal is for the docs to stay useful even after a refactor, not to become wrong the moment a file moves.

## Read This First

If you are new to the repo, read in this order:

1. [Choose Your Task](/onboarding/choose-your-task)
2. [Local Development](/onboarding/local-development)
3. [Codebase Tour](/onboarding/repository-map)
4. [System Overview](/architecture/runtime-overview)
5. [Request Flow And Extension Points](/architecture/discord-execution-model)
6. the workflow page closest to what you are changing
7. [Making Changes Safely](/contributing/adding-features)

## Current Runtime Surface

Today the bot exposes a small number of ingress shapes:

- slash command groups for `event`, `merit`, `staff`, and `ticket`
- development-only slash commands under `dev` when the app runs in development mode
- button and modal flows for event lifecycle control, event review, merit pagination, division selection, and name-change review
- gateway listeners for startup and guild-member lifecycle events
- scheduled tasks for refreshing the division cache and ticking active event tracking sessions

You do not need to memorize the source files for those surfaces. The important mental model is that Arbiter has a small set of ingress types, and each ingress is expected to hand off quickly to a better-named workflow layer.

## How To Find Code When Paths Change

Use search terms instead of a deep file inventory:

- slash command registration: search the public command name or `registerApplicationCommands`
- chat-input execution: search `chatInput`
- button or modal protocol: search `createCustomIdCodec`, `parse`, or the visible button label
- handler entrypoint: search `handle<Thing>`
- dependency assembly: search `create*Deps` or `*Runtime`
- presenter or payload builder: search `build*Payload`, `build*Embed`, `build*Row`, or `present*`
- service rule ownership: search the domain noun plus verbs like `create`, `apply`, `load`, `record`, `sync`, `finalize`, or `reconcile`
- storage boundary: search repository names such as `eventRepository`, `eventReviewRepository`, `meritRepository`, `nameChangeRepository`, `divisionRepository`, or `userRepository`
- request-correlated logs: search for the `flow` value or the `requestId`

## Core Ideas To Keep In Mind

- Arbiter is primarily a workflow bot. Most of the complexity exists to keep multi-step operational flows correct over time.
- Discord-facing code is intentionally thin. If a rule matters, it should usually live in a service, not inside a command class or listener.
- The bot has both durable state and transient state. Postgres owns the truth that must survive restarts; Redis only owns short-lived event-tracking and coordination state.
- Presentation is treated as its own concern. Embeds, buttons, rows, and response payloads are not mixed freely into domain logic.
- Logging is part of the architecture. Every ingress gets a request or event context so production debugging does not depend on reproducing a problem locally.

## Which Page To Read Next

- Changing onboarding or contributor guidance:
  [Codebase Tour](/onboarding/repository-map)
- Changing how requests are received or routed:
  [Request Flow And Extension Points](/architecture/discord-execution-model)
- Changing persistence, Redis, or cache behavior:
  [State, Storage, And Integrations](/architecture/data-and-storage)
- Changing log shape, request correlation, or Grafana/Loki setup:
  [Logging And Observability](/architecture/logging-and-observability)
- Changing event or merit behavior:
  [Event And Merit Workflows](/features/event-system)
- Changing division, nickname, name-change, or guild-member automation:
  [Membership, Identity, And Guild Automation](/features/division-and-membership)
- Preparing a contribution or refactor:
  [Making Changes Safely](/contributing/adding-features)
- Preparing a release or deploy:
  [Release Workflow](/contributing/release-workflow) and [Production Deployment](/contributing/production-deployment)
