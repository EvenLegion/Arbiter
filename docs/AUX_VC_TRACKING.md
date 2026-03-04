# AUX VC Tracking

This document explains how AUX voice-channel participation tracking works in Arbiter v3, including:

- event-driven eligibility reconciliation
- periodic credit awarding
- debounce + concurrency/rerun behavior
- persistence and promotion flow
- where Sapphire libraries/plugins are used

## Goal

The AUX VC system tracks when AUX members are in eligible voice states and grants credit over time.  
When a member reaches the configured threshold, they are promoted from AUX to LGN and their AUX credit record is reset.

## Runtime Components

Core feature files:

- `src/lib/features/voice/aux-vc/monitorState.ts`
- `src/lib/features/voice/aux-vc/handleAuxVcVoiceStateUpdate.ts`
- `src/lib/features/voice/aux-vc/reconcileEligibility.ts`
- `src/lib/features/voice/aux-vc/getEligibleAuxMemberIds.ts`
- `src/lib/features/voice/aux-vc/handleAuxVcActivityTick.ts`
- `src/lib/features/voice/aux-vc/awardCreditToMember.ts`
- `src/lib/features/voice/aux-vc/promoteAuxMemberToLgn.ts`

Entrypoints:

- `src/listeners/voiceStateUpdate.ts`
- `src/listeners/ready.ts`
- `src/scheduled-tasks/auxVcActivityTick.ts`

Persistence:

- `src/integrations/redis/auxVcCredit/index.ts`

Shared utilities used:

- `src/utilities/guild.ts`
- `src/utilities/member.ts`
- `src/utilities/divisionCache.ts`
- `src/utilities/userDirectory.ts`

## High-Level Flow

1. Bot starts (`ready` listener):

- refreshes division cache
- runs an initial eligibility reconcile

1. Voice events occur (`voiceStateUpdate` listener):

- relevant voice changes are debounced
- after debounce window, eligibility reconcile runs

1. Scheduled tick runs (`auxVcActivityTick` task):

- reconciles eligibility immediately before awarding
- iterates current eligible set and awards progress/credits
- promotes members who reached threshold

## Eligibility Rules

Implemented in `getEligibleAuxMemberIds`.

A member is eligible only if all are true:

- currently in a voice channel
- has AUX role (`ENV_DISCORD.AUX_ROLE_ID`)
- is not self-muted and not server-muted
- in that same voice channel, there are at least `AUX_VC_MIN_OTHER_QUALIFIED_MEMBERS` other members who:
- are not muted
- have at least one non-AUX division role (resolved from `divisionCache`)

Output is a `Set<string>` of Discord user IDs.

## Debounce Logic

Implemented in `handleAuxVcVoiceStateUpdate`.

What changes trigger debounce scheduling:

- channel changes
- self-mute changes
- server-mute changes

How debounce works:

- if no relevant change, exit
- if a reconcile timeout is already scheduled, clear it
- schedule a new timeout (`TimerManager.setTimeout`) for `AUX_VC_RECONCILE_DEBOUNCE_MS`
- when timeout fires, clear `pendingReconcileTimeout` and call `reconcileEligibility`

Effect:

- bursts of voice updates collapse into one reconcile
- only the latest state after the quiet window is processed

## Reconcile Concurrency + Rerun Strategy

Implemented in `reconcileEligibility` with `monitorState`.

`monitorState` fields used:

- `busy`: reconcile currently running
- `rerunRequested`: another reconcile requested while busy
- `pendingReconcileTimeout`: current debounce timer handle
- `eligibleMemberDiscordUserIds`: latest computed eligible set

Algorithm:

- if `busy` is true:
- set `rerunRequested = true`
- return immediately
- else set `busy = true` and enter a `do...while` loop
- each pass:
- set `rerunRequested = false`
- recompute eligible set from live guild voice states
- store it in `eligibleMemberDiscordUserIds`
- loop again only if another request set `rerunRequested = true` during processing
- finally set `busy = false`

Why this design:

- prevents parallel reconciles from racing/overwriting each other
- guarantees at least one follow-up pass if new changes arrive mid-run
- keeps state eventually consistent with latest gateway events

## Tick Processing and Credit Math

Implemented in `handleAuxVcActivityTick` and `awardCreditToMember`.

Tick behavior:

- scheduled every `VC_ACTIVITY_TICK_SECONDS` using Sapphire scheduled tasks
- first runs `reconcileEligibility` to reduce stale eligibility
- snapshots `eligibleMemberDiscordUserIds` and processes each member

Per-member awarding:

- resolve DB user via `userDirectory.getOrThrow({ discordUserId })`
- load existing AUX credit row from Redis or initialize defaults
- add one tick worth of milliseconds:
- `eligibleAccumulatedMs += VC_ACTIVITY_TICK_SECONDS * 1000`
- compute newly earned credits from accumulation using:
- `AUX_VC_CREDIT_INTERVAL_SECONDS`
- carry remainder forward as `eligibleAccumulatedMs`

Promotion condition:

- if credits reach `AUX_VC_REQUIRED_CREDITS`, call `promoteAuxMemberToLgn`
- otherwise persist updated credit row to Redis

## Promotion Flow

Implemented in `promoteAuxMemberToLgn`.

Steps:

1. verify member still has AUX role
2. update Discord roles: remove AUX, add LGN
3. delete AUX credit row (reset progress)
4. update division memberships in primary DB:

- remove AUX division membership
- add LGN division membership

## Persistence Model

AUX credit state is stored in Redis hashes.

Key format:

- `arbiter:aux-vc-credit:{discordUserId}`

Hash fields:

- `discordUserId`
- `userId` (optional)
- `credits`
- `eligibleAccumulatedMs`
- `lastEvaluatedAtMs`
- `createdAt`
- `updatedAt`

## Sapphire Libraries and Plugins Used

Framework and structure:

- `@sapphire/framework`
- listeners (`voiceStateUpdate`, `ready`)
- `container.utilities.*` dependency access

Scheduled execution:

- `@sapphire/plugin-scheduled-tasks`
- `AuxVcActivityTickTask` interval scheduler

Utilities pattern:

- `@sapphire/plugin-utilities-store`
- guild/member/division/user service wrappers used by AUX VC flow

Debounce timer:

- `@sapphire/timer-manager`
- central timeout management for voice-state debounce

Env validation and cron validation:

- `zod` for typed env parsing
- `@sapphire/cron` used to validate cron env at boot (`DIVISION_CACHE_REFRESH_CRON`)

## Config Inputs

Voice/credit-specific envs:

- `VC_ACTIVITY_TICK_SECONDS`
- `AUX_VC_CREDIT_INTERVAL_SECONDS`
- `AUX_VC_REQUIRED_CREDITS`
- `AUX_VC_MIN_OTHER_QUALIFIED_MEMBERS`
- `AUX_ROLE_ID`
- `LGN_ROLE_ID`
- `AUX_VC_RECONCILE_DEBOUNCE_MS`

## Operational Notes

- The eligible set is in-memory (`monitorState`) and rebuilt frequently; it is not persisted.
- Credit progress is durable in Redis, so restarts do not lose earned progress.
- Tick flow reconciles right before awarding to reduce drift between gateway events and scheduled processing.
- Missing guild members or missing DB users are handled per call path (warn/error + skip/throw), not silently ignored.
