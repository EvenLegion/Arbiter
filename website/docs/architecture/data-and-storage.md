---
title: State, Storage, And Integrations
sidebar_position: 3
---

# State, Storage, And Integrations

Arbiter keeps several different kinds of state, and the code makes a hard distinction between them.

Understanding that distinction is one of the fastest ways to stop making accidental architectural mistakes.

## The Three State Buckets

### Postgres

Postgres is the durable source of truth.

It stores the domain records that must survive restarts and support reporting, review, or later reconciliation.

### Redis

Redis stores transient runtime coordination data.

It is used for active event-tracking sessions, attendance counters, and short-lived synchronization needs. Redis is not the place to put business history that matters after the live workflow ends.

### In-Process Cache

Arbiter also keeps a process-local division cache. It is loaded from Postgres and refreshed on a schedule because division-aware decisions happen frequently and are referenced across many workflows.

## What Lives In Postgres

The durable data model is centered on a handful of aggregates.

### Users

The user record is the stable persistent identity bridge between Discord and the application's domain state.

It stores:

- Discord user identifiers
- username and nickname snapshots
- avatar URL snapshot

Other aggregates usually point back to users.

### Divisions And Memberships

Division records define:

- division code and name
- division kind
- optional display-name prefix
- whether merit rank should appear in nicknames
- optional emoji metadata
- optional Discord role mapping

Memberships connect users to divisions in durable state.

### Name-Change Requests

Name-change requests store:

- requester
- current name
- requested name
- reason
- review status
- optional reviewer
- optional review-thread reference

This is why name-change review can survive restarts and be audited later.

### Merit Types And Merit Awards

Merit types define the catalog of award kinds, amounts, and whether they can be awarded manually.

Merit records store who received the merit, who awarded it, what type it was, the optional reason, and the optional linked event session.

### Event Tiers And Event Sessions

Event tiers define the event catalog used when starting an event.

Event sessions store:

- host
- tier
- tracking thread reference
- event name
- lifecycle state
- start and end timestamps
- review finalization metadata

Event-related tables also store:

- tracked channels
- stored message references
- participant attendance stats
- review decisions

That split is what allows Arbiter to move from a live tracking phase into a durable review phase without losing context.

## What Lives In Redis

Redis currently owns short-lived event-tracking state.

That includes:

- the set of active tracked event session IDs
- per-session tracking metadata
- per-session attendance counters keyed by Discord user ID
- short-lived coordination helpers such as review locks

The key design rule is:

Redis holds state that is useful while the workflow is in flight. Postgres holds state that matters afterward.

## Why Event Tracking Uses Both Postgres And Redis

Event tracking has two different jobs:

- cheaply record live attendance over time
- persist reviewable outcomes once the event ends

Redis is good at the first job because scheduled ticks can update counters quickly. Postgres is good at the second job because review decisions, awarded merits, and finalized sessions need durable storage.

When an event ends, the workflow snapshots the Redis attendance state into durable Postgres review state. That handoff is a major design boundary in this codebase.

## The Division Cache

Division data is read frequently enough that Arbiter keeps a refreshed in-memory view of it.

That cache exists because division-aware behavior is everywhere:

- permission checks
- role-to-membership reconciliation
- nickname computation
- public division selection
- division autocomplete and lookup

If you change division semantics, remember that you may need to think about:

- the durable table shape
- the cache refresh path
- the workflows that depend on cached division metadata

## Repository Design

Arbiter does not let most feature code talk directly to the raw Prisma client.

Instead, the repo exposes domain-shaped repositories such as:

- user repository
- division repository
- merit repository
- name-change repository
- event repository
- event review repository

That repository layer gives contributors two benefits:

- feature and service code can depend on clearer business operations instead of raw ORM calls
- storage changes can be localized without rewriting every caller

Below those repositories, the Prisma query modules are grouped by aggregate and scenario rather than hidden behind one giant generic data-access layer.

## Prisma Layout Notes

The Prisma schema is split across numbered files under `prisma/schema/`. There is no single `schema.prisma` file in this repo.

That matters because older mental models of the repo may still assume a monolithic schema file. Do not rely on that assumption.

Also keep this distinction clear:

- the numbered schema files and normal migrations are part of the application's lifecycle
- the scripts under `prisma/migration/` are operational helpers for import, repair, and migration work, not the normal runtime path

## Integration Boundaries Outside Prisma

Beyond Postgres, Arbiter's main integration boundaries are:

- Redis for transient tracking and coordination
- Discord itself for side effects such as posting, editing, or renaming
- Sapphire runtime access for client and scheduled-task integration
- Pino for logging

If you are adding behavior that reaches outside the process, make that dependency explicit. Do not hide it behind a random helper call with invisible global access.

## Testing Implications

Storage choices drive test choices.

Use unit tests when:

- the change is about branching, validation, or presentation
- dependencies can be faked cheaply

Use integration tests when:

- the change depends on Prisma queries or transactions
- the change depends on Redis semantics
- the bug only appears when storage and workflow logic interact together

## Common Contributor Mistakes

- putting durable state into Redis because it was quicker to wire
- bypassing repositories and reaching straight for the Prisma client from feature code
- forgetting that division behavior often depends on cached data, not only on raw DB reads
- changing event review behavior without thinking about the Redis-to-Postgres handoff at event end

## What To Read Next

- how requests reach these storage layers:
  [Request Flow And Extension Points](/architecture/discord-execution-model)
- how the event and merit domain uses both Redis and Postgres:
  [Event And Merit Workflows](/features/event-system)
- how division and identity workflows use durable state plus cached division metadata:
  [Membership, Identity, And Guild Automation](/features/division-and-membership)
