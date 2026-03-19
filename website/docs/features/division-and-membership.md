---
title: Membership, Identity, And Guild Automation
sidebar_position: 2
---

# Membership, Identity, And Guild Automation

This workflow family is about keeping a user's identity consistent across Discord and Arbiter's durable state.

That includes:

- division membership
- nickname computation and synchronization
- name-change requests and review
- guild-member lifecycle automation
- development repair commands for syncing existing state

## The Core Identity Model

Arbiter does not treat a Discord nickname as a free-form display string.

A member's effective nickname is a computed projection of several inputs:

- the stored base nickname
- the member's durable division memberships
- division priority and prefix rules
- whether the selected division shows merit rank
- the member's current total merits

That is why nickname behavior is its own workflow area instead of a few string helpers sprinkled throughout the repo.

## Division Data And Why It Matters

Division records carry more than a label.

They define:

- kind and priority implications
- optional display prefix
- optional Discord role mapping
- whether merit rank should be shown in the final nickname

Because those rules affect permissions, role reconciliation, public division selection, and nickname output, the repo keeps division data cached in memory and refreshes it on a schedule.

## Public Division Selection

Arbiter supports a public division-selection message for the user-facing Navy, Marines, and Support choices.

That flow is intentionally narrow:

- staff posts the selection message
- legionnaires can join or leave the selectable divisions
- the workflow updates Discord roles directly

The selection service is responsible for preventing contradictory membership inside the selectable set. Joining one selectable division replaces any conflicting selectable role already held by the member.

## Staff Division Membership Mutation

There is also a staff-facing division membership workflow.

This flow is different from public division selection:

- it mutates durable division membership records
- it targets arbitrary users rather than the actor only
- it can optionally trigger nickname synchronization

This is useful for administrative correction and durable membership maintenance, especially when Discord role state and database state need to be brought back into alignment.

## Role Reconciliation On Guild Member Update

Arbiter treats guild-member role changes as an important source of truth for some automation paths.

When a member's Discord roles change, the guild-member update listener can:

- detect relevant role diffs
- reconcile durable division memberships from the current Discord role set
- recompute the member's nickname

This is the bridge between Discord-side role administration and Arbiter's durable identity model.

## Nickname Computation

Nickname computation has real policy behind it.

The workflow considers:

- whether the member is the guild owner
- which division should win prefix priority
- whether the chosen division shows merit rank
- current total merits
- Discord's nickname length limit

This is why the nickname service exists as a first-class workflow. The rules are too important and too failure-prone to leave implicit.

## Why Staff Nicknames Are Special

Many bulk nickname workflows skip staff by default.

That is not an accident. Staff often need operational flexibility or carry role combinations that make automatic mass updates riskier. When a workflow includes staff, it should do so intentionally.

## Name-Change Requests

Name changes are treated as a review workflow, not a direct nickname edit.

The flow looks like this:

1. a user submits a requested base name plus a reason
2. the request is normalized and validated
3. a review thread is created for staff
4. staff can approve, deny, or edit the pending requested name
5. approval updates durable and Discord-facing identity state

Normalization matters here. The requested name is expected to be a base name, not a full decorated nickname with division prefixes or merit-rank suffixes.

## Why Name Changes Use Review Threads

The thread-based review flow gives the repo three things:

- durable request state in Postgres
- collaborative staff review in Discord
- a stable reference that can be edited, updated, and archived as the request progresses

This is another example of Arbiter treating Discord messages as an operational interface, not just as a disposable chat response.

## Guild-Member Add Automation

When a new guild member joins, Arbiter currently handles two important tasks:

- upsert the user into durable state
- send the welcome message in the configured welcome channel

This keeps the durable user directory warm from the beginning rather than waiting for the member to use a command later.

## Development Repair Commands

The development-only command group exists because identity and membership state sometimes need repair or migration support during development.

Current repair-style workflows include:

- syncing guild members into the database
- bulk nickname synchronization
- bulk nickname transformations for cleanup and migration work

These are intentionally kept behind development mode because they are operational tools, not normal production user flows.

## Where To Start For Common Changes

### Change Division Selection Behavior

Start in the division-selection workflow.

Typical examples:

- who is allowed to join
- which divisions are treated as mutually exclusive
- how join or leave results are presented

### Change Durable Membership Mutation Rules

Start in the division-membership service.

Typical examples:

- how administrative adds or removals work
- whether nickname sync should follow the mutation

### Change Nickname Rules

Start in the nickname services and nickname-building logic.

Typical examples:

- prefix priority
- merit rank suffix behavior
- staff skip rules
- nickname length failure behavior

### Change Name-Change Review Behavior

Start in the name-change service.

Typical examples:

- normalization rules
- validation rules
- approval or denial behavior
- thread update behavior

### Change Guild-Member Automation

Start in the guild-member listeners and the service they call.

Typical examples:

- role reconciliation behavior
- welcome flow behavior
- automatic nickname sync on role updates

## Testing Guidance For This Area

Use unit tests for:

- nickname construction and transformation
- name normalization and validation
- service branching for division selection or membership mutation
- presentation for review and repair flows

Use integration tests for:

- repository-backed name-change flows
- durable division membership behavior
- workflows that reconcile Discord-shaped identity state with Postgres state

## Search Terms That Work Well

Useful search terms in this area include:

- `division`
- `nickname`
- `nameChange`
- `guildMember`
- `reconcile`
- `syncNickname`
- `normalizeRequestedName`

If you are unsure where to start, search the domain term plus `handle` first, then trace inward toward the service.

## The Main Takeaway

This area exists to answer one recurring problem cleanly:

How should Arbiter decide who a member is, what groups they belong to, and what name should represent them in Discord right now?

Once you frame the problem that way, the split between division logic, nickname logic, review flows, and guild-member automation becomes much easier to reason about.
