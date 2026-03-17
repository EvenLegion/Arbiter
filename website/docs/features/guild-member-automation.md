---
title: Guild Member Automation
sidebar_position: 9
---

# Guild Member Automation

## What It Covers

Guild member automation keeps Discord membership, persisted user state, division memberships, and computed nicknames aligned.

It includes:

- new-member persistence and welcome messaging
- role-change reconciliation
- bulk guild-member sync
- bulk nickname sync and transform workflows

## Public Entry Points

Realtime:

- `src/listeners/guildMemberAdd.ts`
- `src/listeners/guildMemberUpdate.ts`

Operational:

- `/dev sync_guild_members`
- `/staff sync_nickname`
- `/dev nickname remove-prefix`
- `/dev nickname remove-suffix`
- `/dev nickname reset`

Primary services:

- `src/lib/services/guild-member-change/`
- `src/lib/services/guild-member-sync/`
- `src/lib/services/bulk-nickname/`
- `src/lib/services/nickname/`

## Realtime Member Add

`guildMemberAdd` currently routes to:

- `src/lib/features/guild-member/onGuildMemberAdd.ts`

This flow:

- upserts the new user record
- builds the welcome message
- posts the welcome message to the configured channel

It is still a relatively direct feature flow because it is mostly transport and one-step persistence.

## Realtime Role-Change Handling

`guildMemberUpdate` routes to:

- `src/lib/features/guild-member/onGuildMemberUpdate.ts`
- `src/lib/services/guild-member-change/guildMemberChangeService.ts`

That service owns:

- role-diff classification
- membership reconciliation follow-up
- nickname sync result shaping

The feature adapter owns member resolution and dependency assembly.

## Bulk Guild Sync

`/dev sync_guild_members` routes through:

- `src/lib/features/dev/handleSyncGuildMembers.ts`
- `src/lib/services/guild-member-sync/guildMemberSyncService.ts`

This flow exists to converge the system after drift, cleanup, or data-shape changes.

## Bulk Nickname Operations

Bulk nickname commands route through:

- `src/lib/features/staff/handleStaffSyncNickname.ts`
- `src/lib/features/dev/handleDevNicknameTransform.ts`
- `src/lib/services/bulk-nickname/bulkNicknameService.ts`

These commands are summary-driven on purpose. They should report what happened across many users, not just perform silent side effects.

## Nickname Core

`src/lib/services/nickname/` is the shared abstraction for:

- validating a requested nickname
- computing a nickname from stored and Discord state
- syncing a computed nickname back to Discord

Other workflows should build on this service instead of inventing new nickname rules.

## Common Extension Points

- nickname rule changes:
  `src/lib/services/nickname/`
- realtime member-update behavior:
  `src/lib/services/guild-member-change/`
- bulk convergence behavior:
  `src/lib/services/guild-member-sync/`
  and `src/lib/services/bulk-nickname/`

## Before Editing

Read these first:

- `src/listeners/guildMemberAdd.ts`
- `src/listeners/guildMemberUpdate.ts`
- `src/lib/features/guild-member/onGuildMemberAdd.ts`
- `src/lib/features/guild-member/onGuildMemberUpdate.ts`
- `src/lib/services/guild-member-change/guildMemberChangeService.ts`
- `src/lib/services/guild-member-sync/guildMemberSyncService.ts`
- `src/lib/services/nickname/nicknameService.ts`

## Related Docs

- [Operational Tooling](/features/operational-tooling)
- [Division And Membership](/features/division-and-membership)
- [Aggregate Reference](/reference/aggregate-reference)
