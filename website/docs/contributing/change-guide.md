---
title: Contributor Guide
sidebar_position: 6
---

# Contributor Guide

This page is the contributor playbook for landing changes without making the codebase harder to understand.

If you remember one workflow, remember this one: trace from the public surface inward, change the smallest layer that can own the behavior clearly, then validate at the level where the risk actually lives.

## The Default Change Strategy

For most work, start in this order:

1. find the command, button, modal, listener, or task that starts the flow
2. find the feature handler that shapes transport input into workflow input
3. find the service that owns the rule you actually want to change
4. touch presenters, repositories, or gateways only when the change is really about output, persistence, or side effects

If you start deep in a query module before you understand the workflow, you will usually over-edit.

## Where To Start By Change Type

| If you are changing...                                         | Start here                                                               | Usually also touches                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| A slash command or subcommand                                  | Command definition and the feature handler it hands off to               | Service, presenter, tests                                 |
| Autocomplete                                                   | Autocomplete routing and choice builders                                 | Read helpers, actor or guild scoping                      |
| A button or modal action                                       | Custom-ID protocol and interaction handler                               | Feature handler, service, presenter                       |
| A business rule or state transition                            | Service layer                                                            | Tests, sometimes presenter if the result contract changes |
| Output, embeds, buttons, or reply text                         | Presenter or payload builder                                             | Custom-ID builders if controls change                     |
| Postgres, Redis, or query behavior                             | Domain-shaped repository plus aggregate-specific Prisma or Redis modules | Integration tests                                         |
| Event, tracking, review, or merit behavior                     | Event/merit feature and service directories                              | Redis, Postgres, presentation, scheduled tasks            |
| Divisions, nicknames, name changes, or guild-member automation | Membership/identity feature and service directories                      | Cache, Discord roles, listeners, presentation             |
| Logging or observability                                       | Execution context creators, ingress logging, and observability config    | User-visible failure paths, log bindings                  |
| A listener or scheduled task                                   | Listener or task shell                                                   | Shared service code, logging, tests                       |
| Docs                                                           | The page that owns the stable concept                                    | Any neighboring page that now duplicates it               |
| Release or deploy behavior                                     | Release tooling or production stack docs                                 | GitHub workflows, Docker config, operations docs          |

## Design Rules That Matter Here

### Keep Runtime Shells Small

Commands, interaction handlers, listeners, and tasks should:

- create context
- do transport-specific preflight
- hand off

If a shell is deciding policy, loading storage directly, editing multiple Discord messages, and formatting output, it is doing too much.

### Put Rules In Services

If the change affects:

- eligibility
- state transitions
- reconciliation
- default decisions
- mutation sequencing

then a service should probably own it.

### Keep Presentation Explicit

If the change is about:

- copy
- embeds
- buttons
- rows
- payload shape

then a presenter or payload builder should probably own it.

### Keep External Dependencies Visible

Do not hide Prisma, Redis, or Discord side effects behind magical helpers with implicit runtime access. Use explicit collaborators wired through a feature-local dependency object or runtime helper.

## The Default Shape For New Behavior

Arbiter generally wants new behavior to follow this shape:

1. runtime shell
2. feature handler
3. service
4. repository or gateway dependencies
5. presenter or payload builder
6. tests

Not every tiny change needs every layer, but that is the default mental model.

## Safe Change Recipes

### Add A New Slash Command

Expected work:

- define the command surface
- create or extend a feature handler
- add or extend a service if the command changes behavior, not just presentation
- add tests
- update docs if contributor expectations changed

### Add A New Button Or Modal Flow

Expected work:

- define or extend a custom-ID protocol
- route the interaction
- keep business logic in a service if state changes
- update the presenter if the controls or payload changed

### Add A New Read Flow

Expected work:

- put selection and visibility rules in a read-oriented service or helper
- keep rendering in a presenter
- keep the transport layer thin

### Add A New Write Flow

Expected work:

- put workflow rules in a service
- keep collaborators explicit
- return typed outcomes
- map those outcomes to Discord copy in a presenter if the branching is meaningful

## Validation Checklist

For most code changes, the safe default is:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm docs:build
```

Add `pnpm test:integration` when:

- Prisma behavior changed
- Redis behavior changed
- the important risk is storage plus workflow coordination

## Manual Discord Validation Checklist

Do manual Discord checks when the change affects:

- slash-command options or registration
- autocomplete behavior
- buttons or modals
- permission and precondition behavior
- guild-member listeners triggered by real role changes

Use automated tests for business correctness. Use manual testing for client and transport behavior.

## Docs Are Part Of The Change

Update docs in the same change when you modify:

- contributor entrypoints
- architecture expectations
- runtime responsibilities
- storage expectations
- workflow behavior that a new developer would need before editing the area

Prefer documenting:

- responsibilities
- invariants
- extension rules
- search strategies

Avoid documenting:

- long brittle file lists
- deep path inventories that duplicate repository search
- claims that only stay true if no one ever refactors

## Before A PR Or Release

Before opening or updating a PR into `dev`, run:

```bash
pnpm release:plan
```

That script compares your branch against `dev`, reads Conventional Commit subjects, asks for the intended bump, and writes a plan file under `.release-plans/`. The full release and deployment model is documented in [Operations](/operations/release-and-deploy).

## A Good Final Smell Test

Before you open a PR, ask:

- does the changed code make ownership clearer or blurrier?
- is the business rule now easier to test?
- can a new contributor find the right layer faster after this change than before?
- if the files moved tomorrow, would the docs and naming still guide someone to the right place?

If those answers are mostly yes, the change is probably shaped well.
