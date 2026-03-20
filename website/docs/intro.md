---
title: Arbiter Docs
slug: /
sidebar_position: 1
---

# Arbiter Docs

Arbiter is Even Legion's Discord operations bot. It owns event session workflows, merit awarding and rank progression, division and nickname automation, name-change review, and the runtime plumbing that keeps Discord state aligned with persisted state.

This site is written for contributors. The goal is to get a new developer from zero context to useful changes without making them read a dozen partially overlapping pages first.

## Read These Pages First

If you are new to the repo, read in this order:

1. [Getting Started](/onboarding/getting-started)
2. [System Guide](/architecture/system-guide)
3. the workflow page closest to what you are changing
4. [Contributor Guide](/contributing/change-guide)

Read [Operations](/operations/release-and-deploy) only when you are preparing a release or touching deployment.

## What Arbiter Owns

Arbiter is mostly a workflow bot. The important responsibilities cluster into two families:

- event and merit workflows
- membership, identity, and guild automation workflows

The current runtime surface is intentionally small:

- slash command groups for `event`, `merit`, `staff`, and `ticket`
- development-only slash commands under `dev` in development mode
- button and modal flows for event lifecycle control, event review, merit pagination, division selection, and name-change review
- gateway listeners for startup and guild-member lifecycle events
- scheduled tasks for refreshing the division cache and ticking active event tracking sessions

## Core Mental Model

The docs optimize for stable responsibilities rather than fragile file inventories:

- runtime shells accept Discord or scheduled-task input
- feature handlers translate that input into workflow input
- services own business rules and typed outcomes
- repositories and gateways talk to storage or external side effects
- presenters build messages, embeds, buttons, and reply payloads

That tradeoff is intentional. The code can move. The responsibilities are much more stable.

## Use The Docs By Intent

- Need local setup and repo orientation:
  [Getting Started](/onboarding/getting-started)
- Need the architecture, storage, and observability model:
  [System Guide](/architecture/system-guide)
- Changing event, tracking, review, or merit behavior:
  [Event And Merit Workflows](/features/event-system)
- Changing division, nickname, name-change, or guild-member automation:
  [Membership, Identity, And Guild Automation](/features/division-and-membership)
- Need to know where a change belongs and how to validate it:
  [Contributor Guide](/contributing/change-guide)
- Preparing a release or production deploy:
  [Operations](/operations/release-and-deploy)
