---
title: Making Changes Safely
sidebar_position: 1
---

# Making Changes Safely

This page is the contributor playbook for landing changes without making the codebase harder to understand.

## The Default Shape For New Behavior

Arbiter generally wants new behavior to follow this shape:

1. runtime shell
2. feature handler
3. service
4. repository or gateway dependencies
5. presenter or payload builder
6. tests

Not every tiny change needs every layer, but that is the default mental model.

## Design Rules That Matter Here

### Keep Runtime Shells Small

Commands, interaction handlers, listeners, and tasks should:

- create context
- do transport-specific preflight
- hand off

If a command class is deciding business policy, loading data, editing multiple Discord messages, and formatting output, the design is drifting.

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

## When To Create A New Service

Create or extend a service when:

- the workflow has more than one meaningful rule
- the logic will be reused from more than one ingress
- the result needs a typed outcome, not just a boolean
- the workflow coordinates durable state and side effects

Do not create a service just because a file is more than a few lines long. Create a service because the behavior needs a stable domain home.

## When To Create A New Presenter

Create or extend a presenter when:

- there are multiple user-visible result branches
- the payload includes embeds, rows, or buttons
- the same result needs to be rendered in more than one place

Do not force presentation into services. Services should explain what happened. Presenters should explain how that outcome is shown to Discord.

## Where New Storage Code Should Go

For new storage scenarios:

1. add or extend the domain-shaped repository surface
2. implement the concrete query or transaction in the aggregate-specific Prisma modules
3. cover the behavior with integration tests if storage behavior matters

That keeps higher-level code from becoming tightly coupled to raw ORM details.

## Refactor Rules

Good refactors in this repo usually do at least one of these:

- make ownership clearer
- reduce transport leakage into services
- reduce persistence leakage into feature handlers
- make result mapping more explicit
- make tests more targeted

Bad refactors usually do one of these:

- move logic without clarifying ownership
- collapse layers "for simplicity" until handlers become giant again
- replace explicit result types with ambiguous booleans or exceptions everywhere
- increase reliance on hidden global runtime access

## Safe Change Recipes

### Add A New Slash Command

Expected work:

- define the command surface
- create or extend a feature handler
- add or extend a service if the command changes behavior, not just presentation
- add tests
- update docs if the command changes contributor-visible behavior

### Add A New Button Or Modal Flow

Expected work:

- define or extend a custom-id protocol
- route the interaction
- keep business logic in a service if state changes
- update the presenter if controls or payloads changed

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
pnpm exec eslint src tests
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

Use automation for business correctness. Use manual testing for client and transport behavior.

## Docs Are Part Of The Change

Update docs in the same change when you modify:

- contributor entrypoints
- architecture expectations
- runtime responsibilities
- storage expectations
- workflow behavior that a new developer would need to understand before editing the area

Prefer documenting:

- responsibilities
- invariants
- extension rules
- search strategies

Avoid documenting:

- long brittle file lists
- deep path inventories that duplicate repository search
- claims that only stay true if no one ever refactors

## A Good Final Smell Test

Before you open a PR, ask:

- does the changed code make ownership clearer or blurrier?
- is the business rule now easier to test?
- can a new contributor find the right layer faster after this change than before?
- if the files moved tomorrow, would the docs and naming still guide someone to the right place?

If the answer to those questions is mostly yes, the change is probably shaped well.
