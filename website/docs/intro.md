---
title: Arbiter Docs
slug: /
sidebar_position: 1
---

# Arbiter Docs

Arbiter is the Even Legion Discord bot. It owns event operations, merit workflows, nickname computation, division membership flows, name-change review, and the repair tooling needed to keep Discord state and persisted state aligned.

This site is written for contributors, not end users. Its job is to answer four questions quickly:

- what the bot does
- where each capability lives
- which patterns the repo expects
- how to extend the bot without re-learning the entire codebase

## Start Here If...

- You want the fastest path into the codebase:
  Read [Choose Your Task](/onboarding/choose-your-task).
- You need the bot running locally:
  Read [Local Development](/onboarding/local-development).
- You need to understand where code belongs:
  Read [Repository Map](/onboarding/repository-map) and [Architecture Vocabulary](/architecture/vocabulary).
- You are changing logging, request correlation, or Grafana/Loki setup:
  Read [Logging And Observability](/architecture/logging-and-observability) and [Runtime Overview](/architecture/runtime-overview).
- You are changing command, interaction, or preflight behavior:
  Read [Discord Execution Model](/architecture/discord-execution-model) and [Discord Extension Patterns](/architecture/discord-extension-patterns).
- You are changing business workflows or service logic:
  Read [Service And Dependency Design](/architecture/service-dependency-design) and [Architecture Vocabulary](/architecture/vocabulary).
- You are changing persistence or Redis-backed behavior:
  Read [Data and Storage](/architecture/data-and-storage) and [Aggregate Reference](/reference/aggregate-reference).
- You need to prepare a release or deploy the bot:
  Read [Release Workflow](/contributing/release-workflow) and [Production Deployment](/contributing/production-deployment).

## Recommended Reading Order

For a first read, use this sequence:

1. [Choose Your Task](/onboarding/choose-your-task)
2. [Local Development](/onboarding/local-development)
3. [Repository Map](/onboarding/repository-map)
4. [Runtime Overview](/architecture/runtime-overview)
5. [Discord Execution Model](/architecture/discord-execution-model)
6. the feature guide for the area you are changing
7. [Adding Features](/contributing/adding-features) and [Testing and Refactors](/contributing/testing-and-refactors)

## Core Design Rules

The repo is organized around a small set of stable patterns:

- `src/commands/` registers slash commands and dispatches to handlers.
- `src/interaction-handlers/` decodes buttons and modals, builds context, and routes to feature handlers.
- `src/lib/discord/` holds shared Discord edge helpers such as preflight, response delivery, autocomplete, and custom-id tooling.
- `src/lib/features/` holds feature-facing handlers, presenters, gateways, and adapter assembly.
- `src/lib/services/` holds business workflows and domain rules.
- `src/integrations/` owns Prisma, Redis, Sapphire runtime edges, and other infrastructure boundaries.
- `src/utilities/` is reserved for real long-lived runtime utilities that benefit from Sapphire utility registration or app-lifetime state.

The intent is:

- entrypoints read Discord input and create context
- services own decisions and state changes
- presenters build Discord payloads
- repositories and gateways talk to persistence or Discord side effects

## Why The Docs Are Structured This Way

The bot is easiest to learn by following real contributor tasks and real feature flows.

That is why the docs are split into:

- onboarding pages for “what should I read next?”
- architecture pages for shared patterns and boundaries
- feature pages for real workflows
- reference pages for command surfaces and aggregate ownership
- contributing pages for extension and maintenance rules
