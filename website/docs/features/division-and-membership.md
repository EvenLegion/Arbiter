---
title: Division And Membership
sidebar_position: 8
---

# Division And Membership

## What It Covers

The bot supports two different division workflows:

- self-service division selection through a posted message and buttons
- staff-managed persisted division membership updates

## Public Entry Points

Self-service:

- `staff post_division_message`
- division selection buttons

Staff-managed:

- `staff division_membership add`
- `staff division_membership remove`

Primary code:

- `src/lib/features/division-selection/`
- `src/lib/features/staff/handleDivisionMembershipCommand.ts`
- `src/lib/services/division-selection/divisionSelectionService.ts`
- `src/lib/services/division-membership/divisionMembershipService.ts`

## Self-Service Division Selection

The posted division message gives Legionnaires a controlled way to join or leave selectable divisions.

The service `applyDivisionSelection(...)` owns:

- join versus leave behavior
- selectable-division resolution
- replacement of prior selectable roles

The feature layer owns:

- button decoding
- guild/member preflight
- role mutation wiring
- reply building

## Staff Division Membership Mutation

Staff-side mutation is different:

- it changes persisted system state
- it may sync a nickname afterward
- it is intended for administrative correction, not interactive role picking

That workflow routes through:

- `src/lib/features/staff/handleDivisionMembershipCommand.ts`
- `src/lib/services/division-membership/divisionMembershipService.ts`
- `src/lib/features/staff/divisionMembershipServiceAdapters.ts`

## Division Cache And Directory

Division metadata is used across:

- autocomplete
- preconditions
- nickname rules
- self-service division selection
- membership reconciliation

That is why the runtime keeps a division cache and feature-level division directories.

## Common Extension Points

- selectable-role behavior:
  `src/lib/services/division-selection/`
- persisted membership mutation:
  `src/lib/services/division-membership/`
- division autocomplete:
  `src/lib/features/division-selection/divisionDirectory.ts`
  and staff autocomplete providers

## Before Editing

Read these first:

- `src/commands/staff.ts`
- `src/lib/features/division-selection/handleDivisionSelectionButton.ts`
- `src/lib/features/staff/handleDivisionMembershipCommand.ts`
- `src/lib/services/division-selection/divisionSelectionService.ts`
- `src/lib/services/division-membership/divisionMembershipService.ts`

## Related Docs

- [Guild Member Automation](/features/guild-member-automation)
- [Aggregate Reference](/reference/aggregate-reference)
