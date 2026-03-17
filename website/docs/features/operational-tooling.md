---
title: Operational Tooling
sidebar_position: 10
---

# Operational Tooling

## What It Covers

Operational tooling is the set of flows used to keep the bot and guild state healthy:

- division cache refresh
- event tracking tick
- staff correction commands
- development repair and cleanup commands

## Scheduled Tasks

Current scheduled tasks:

- `src/scheduled-tasks/divisionCacheRefresh.ts`
- `src/scheduled-tasks/eventTrackingTick.ts`

These are maintenance loops, not user-facing features.

## Operational Command Surface

| Surface                                          | Feature handler                                             | Service                                 |
| ------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------- |
| `staff post_division_message`                    | `src/lib/features/staff/postDivisionSelectionMessage.ts`    | self-service message/post flow          |
| `staff sync_nickname`                            | `src/lib/features/staff/handleStaffSyncNickname.ts`         | `src/lib/services/bulk-nickname/`       |
| `staff division_membership add/remove`           | `src/lib/features/staff/handleDivisionMembershipCommand.ts` | `src/lib/services/division-membership/` |
| `dev sync_guild_members`                         | `src/lib/features/dev/handleSyncGuildMembers.ts`            | `src/lib/services/guild-member-sync/`   |
| `dev nickname remove-prefix/remove-suffix/reset` | `src/lib/features/dev/handleDevNicknameTransform.ts`        | `src/lib/services/bulk-nickname/`       |

## Why These Flows Are Separate

Operational commands:

- can touch many users at once
- often recover from drift
- need explicit summaries and failure reporting

That is why they live in dedicated services with result payloads instead of being one-off scripts inside command classes.

## Common Extension Points

- add a new bulk nickname operation:
  `src/lib/services/bulk-nickname/`
- add a new repair or convergence workflow:
  create a service first, then a thin command shell
- change scheduled maintenance behavior:
  keep the task shell thin and move logic into a service

## Before Editing

Read these first:

- `src/commands/staff.ts`
- `src/commands/dev.ts`
- `src/scheduled-tasks/divisionCacheRefresh.ts`
- `src/scheduled-tasks/eventTrackingTick.ts`
- `src/lib/services/bulk-nickname/bulkNicknameService.ts`
- `src/lib/services/guild-member-sync/guildMemberSyncService.ts`

## Related Docs

- [Guild Member Automation](/features/guild-member-automation)
- [Event Attendance Tracking](/features/event-attendance-tracking)
- [Testing And Refactors](/contributing/testing-and-refactors)
