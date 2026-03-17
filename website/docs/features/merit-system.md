---
title: Merit System
sidebar_position: 6
---

# Merit System

## What It Covers

The merit system handles:

- manual merit awards
- merit history listing
- merit rank thresholds and symbols
- merit-linked event references
- autocomplete for merit users, merit types, and recent events
- rank-up notifications and nickname updates

## Public Entry Points

- `/merit give`
- `/merit list`
- merit list pagination buttons
- merit autocomplete on:
    - `player_name`
    - `user_name`
    - `merit_type`
    - `existing_event`

## Current Internal Shape

The feature is organized by contributor-facing subdomain:

- `src/lib/features/merit/manual-award/`
- `src/lib/features/merit/read/`
- `src/lib/features/merit/autocomplete/`
- `src/lib/features/merit/presentation/`
- shared pure policy:
  `src/lib/features/merit/meritRank.ts`
  and `src/lib/features/merit/meritRankPolicy.ts`

Primary services:

- `src/lib/services/manual-merit/`
- `src/lib/services/merit-read/`

## Manual Merit Awards

`/merit give` routes through:

- `src/commands/merit.ts`
- `src/lib/features/merit/manual-award/handleGiveMerit.ts`
- `src/lib/services/manual-merit/manualMeritService.ts`

The manual-award feature subdomain owns:

- target-member resolution
- linked-event lookup
- nickname side effects
- direct-message delivery
- result presentation

The service owns:

- validation
- typed workflow branching
- award persistence orchestration

## Merit Listing

`/merit list` and merit pagination buttons route through:

- `src/lib/features/merit/read/handleMeritList.ts`
- `src/lib/services/merit-read/meritReadService.ts`
- `src/lib/features/merit/read/meritListView.ts`
- `src/lib/features/merit/presentation/buildMeritListPayload.ts`

The read service owns:

- permission-aware target resolution
- pagination inputs
- summary loading
- private versus public reply behavior

The presenter and payload builder own embeds and buttons.

## Merit Autocomplete

Merit autocomplete lives in:

- `src/lib/features/merit/autocomplete/meritAutocompleteProvider.ts`
- `src/lib/features/merit/autocomplete/meritAutocompleteRoutes.ts`
- `src/lib/features/merit/autocomplete/meritAutocompleteGuard.ts`
- `src/lib/features/merit/autocomplete/meritAutocompleteChoices.ts`
- `src/lib/features/merit/autocomplete/meritAccessPolicy.ts`

That split exists so:

- route matching stays declarative
- access policy stays reusable
- choice builders stay small

## Merit Rank Logic

Rank thresholds and progress helpers live in:

- `src/lib/features/merit/meritRank.ts`
- `src/lib/features/merit/meritRankPolicy.ts`

These files are intentionally pure and are the safest place to change rank math.

## Why It Is Built This Way

Merit has three very different contributor surfaces:

- write workflow:
  manual awards with side effects
- read workflow:
  paginated history and access rules
- autocomplete workflow:
  command-time lookup behavior

Keeping those subdomains visible in the feature layout makes changes easier to isolate.

## Common Extension Points

- new award rule:
  `src/lib/services/manual-merit/`
- new list behavior or pagination rule:
  `src/lib/services/merit-read/`
- new merit autocomplete rule:
  `src/lib/features/merit/autocomplete/`
- new Discord output:
  `src/lib/features/merit/presentation/` or result presenters

## Before Editing

Read these first:

- `src/commands/merit.ts`
- `src/lib/features/merit/manual-award/handleGiveMerit.ts`
- `src/lib/features/merit/read/handleMeritList.ts`
- `src/lib/features/merit/autocomplete/meritAutocompleteProvider.ts`
- `src/lib/services/manual-merit/manualMeritService.ts`
- `src/lib/services/merit-read/meritReadService.ts`
- `src/lib/features/merit/meritRank.ts`

## Related Docs

- [Discord Extension Patterns](/architecture/discord-extension-patterns)
- [Aggregate Reference](/reference/aggregate-reference)
- [Testing And Refactors](/contributing/testing-and-refactors)
