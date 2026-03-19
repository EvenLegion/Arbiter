---
title: Membership, Identity, And Guild Automation
sidebar_position: 5
---

# Membership, Identity, And Guild Automation

This workflow family is about keeping a user's identity consistent across Discord and Arbiter's durable state.

That includes:

- division membership
- nickname computation and synchronization
- name-change requests and review
- guild-member lifecycle automation
- development repair commands for syncing existing state

## Source Of Truth In This Area

This workflow family is easier to reason about when you separate four related but different things:

| Concern                   | Primary source of truth                                          | Notes                                                                             |
| ------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Division definitions      | Postgres plus the in-process division cache                      | Definitions drive permissions, prefixes, role mappings, and merit-rank visibility |
| Public division selection | Discord role state first, then reconciliation into durable state | The public selector updates roles directly                                        |
| Staff membership mutation | Durable division membership plus follow-up sync behavior         | Used for administrative correction and maintenance                                |
| Effective nickname        | Computed projection, not free-form text                          | Depends on base nickname, divisions, merit totals, and policy rules               |

## The Core Identity Model

Arbiter does not treat a Discord nickname as a free-form display string.

A member's effective nickname is a computed projection of:

- the stored base nickname
- the member's durable division memberships
- division priority and prefix rules
- whether the selected division shows merit rank
- the member's current total merits

That is why nickname behavior is its own workflow area instead of a few string helpers scattered around the repo.

## Division Data And Why It Matters

Division records carry more than a label. They define:

- kind and priority implications
- optional display prefix
- optional Discord role mapping
- whether merit rank should be shown in the final nickname

Because those rules affect permissions, role reconciliation, public division selection, and nickname output, the repo keeps division data cached in memory and refreshes it on a schedule.

## Two Kinds Of Membership Mutation

### Public Division Selection

Arbiter supports a public division-selection message for the user-facing Navy, Marines, and Support choices.

That flow is intentionally narrow:

- staff posts the selection message
- legionnaires can join or leave the selectable divisions
- the workflow updates Discord roles directly

The selection service prevents contradictory membership inside the selectable set. Joining one selectable division replaces any conflicting selectable role already held by the member.

### Staff Division Membership Mutation

There is also a staff-facing division membership workflow. This flow is different:

- it mutates durable division membership records
- it targets arbitrary users rather than the actor only
- it can optionally trigger nickname synchronization

This is useful when Discord role state and database state need to be brought back into alignment deliberately.

## Role Reconciliation And Guild-Member Automation

Guild-member role changes are an important source of truth for some automation paths.

When a member's Discord roles change, the guild-member update listener can:

- detect relevant role diffs
- reconcile durable division memberships from the current Discord role set
- recompute the member's nickname

When a new guild member joins, Arbiter currently:

- upserts the user into durable state
- sends the welcome message in the configured welcome channel

Together, those flows keep the durable user directory warm and keep Discord-side role administration connected to Arbiter's identity model.

## Nickname Computation

Nickname computation has real policy behind it. The workflow considers:

- whether the member is the guild owner
- which division should win prefix priority
- whether the chosen division shows merit rank
- current total merits
- Discord's nickname length limit

Many bulk nickname workflows skip staff by default. That is intentional. Staff often need operational flexibility or carry role combinations that make automatic mass updates riskier.

## Name-Change Requests

Name changes are treated as a review workflow, not a direct nickname edit.

The flow looks like this:

1. a user submits a requested base name plus a reason
2. the request is normalized and validated
3. a review thread is created for staff
4. staff can approve, deny, or edit the pending requested name
5. approval updates durable and Discord-facing identity state

Normalization matters here. The requested name is expected to be a base name, not a full decorated nickname with division prefixes or merit-rank suffixes.

The thread-based review flow gives the repo three things:

- durable request state in Postgres
- collaborative staff review in Discord
- a stable reference that can be edited, updated, and archived as the request progresses

## Development Repair Commands

The development-only command group exists because identity and membership state sometimes need repair or migration support during development.

Current repair-style workflows include:

- syncing guild members into the database
- bulk nickname synchronization
- bulk nickname transformations for cleanup and migration work

These are intentionally kept behind development mode because they are operational tools, not normal production user flows.

## Where The Code Usually Lives

Today this area is concentrated in a few predictable places:

| Concern                            | Main feature directories                                                                              | Main service directories                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Public division selection          | `src/lib/features/division-selection`, `src/lib/features/staff/division-selection`                    | `src/lib/services/division-selection`                                                                         |
| Staff membership mutation          | `src/lib/features/staff/division-membership`                                                          | `src/lib/services/division-membership`                                                                        |
| Guild-member add/update automation | `src/lib/features/guild-member`                                                                       | `src/lib/services/guild-member`, `src/lib/services/guild-member-change`, `src/lib/services/guild-member-sync` |
| Nickname computation and bulk sync | `src/lib/features/staff/nickname-sync`                                                                | `src/lib/services/nickname`, `src/lib/services/bulk-nickname`, `src/lib/services/merit-rank`                  |
| Name-change request and review     | `src/lib/features/ticket/request`, `src/lib/features/ticket/review`, `src/lib/features/ticket/thread` | `src/lib/services/name-change`                                                                                |

That map is a current orientation aid, not a promise that file paths will never move.

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
