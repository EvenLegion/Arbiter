# Arbiter v3: Architecture and Feature Flows

This document explains how Arbiter v3 is structured with Sapphire, and how each exposed feature works end-to-end.

## 1) Sapphire model in this repo

Sapphire auto-loads "pieces" (commands, listeners, interaction handlers, preconditions, scheduled tasks, utilities) from `src/`.
You do not manually wire event listeners or command routers.

Current piece folders:

- `src/commands`: slash commands
- `src/preconditions`: command guards
- `src/interaction-handlers`: component interaction handlers (buttons)
- `src/listeners`: Discord and Sapphire event listeners
- `src/scheduled-tasks`: recurring jobs via `@sapphire/plugin-scheduled-tasks`
- `src/utilities`: shared runtime services via `@sapphire/plugin-utilities-store`
- `src/lib/features`: business logic called by pieces

This repo intentionally does not use a separate `src/logic` layer. Feature-specific helpers are colocated in their owning feature folders.

Core startup files:

- `src/lib/setup.ts`: registers Sapphire plugins, loads `.env`, configures command registration behavior
- `src/index.ts`: creates `SapphireClient` (intents, logger level, Redis task backend), then logs in

## 2) Runtime lifecycle

Boot sequence:

1. `src/lib/setup.ts` runs first.
2. Sapphire plugins are registered (`logger`, `scheduled-tasks`, `subcommands`, `utilities-store`).
3. Env is loaded from `.env` using `@skyra/env-utilities`.
4. `src/index.ts` creates the client and logs in with `DISCORD_TOKEN`.
5. `ready` listener runs (`src/listeners/ready.ts`):
6. Runtime services are available (`container.utilities`, Redis, scheduled tasks backend).
7. Division cache utility is refreshed from Postgres.
8. Scheduled tasks continue runtime processing (for example, event tracking and division cache refresh).

## 3) Data and state layers

### Postgres (Prisma)

Active features currently depend on:

- `User`
- `Division`
- `DivisionMembership`

Prisma integration lives in `src/integrations/prisma`.

### In-memory division cache

- Backed by Postgres `Division` rows.
- Built in `src/integrations/prisma/divisionCache/initDivisionCache.ts`.
- Exposed to the app through Sapphire utility `container.utilities.divisionCache` (`src/utilities/divisionCache.ts`).

### Redis (event tracking runtime state)

- Key space prefix: `arbiter:event-tracking:*`.
- Access layer: `src/integrations/redis/eventTracking/index.ts`.
- Used for active event session attendance tracking and review locks.

## 4) Exposed features and flows

## Feature A: Staff slash command to post division selector

Exposed command:

- `/staff post-division-message`

Flow:

1. Sapphire subcommand piece receives the slash command (`src/commands/staff.ts`).
2. Preconditions run: `GuildOnly` and `StaffOnly`.
3. `StaffOnly` (`src/preconditions/StaffOnly.ts`) fetches member and verifies they have a `DivisionKind.STAFF` role via `memberHasDivisionKindRole`.
4. Handler (`src/lib/features/staff/postDivisionSelectionMessage.ts`) defers ephemeral reply.
5. It fetches COMBAT + INDUSTRIAL divisions from `container.utilities.divisionCache`.
6. It builds embeds/buttons using `buildDivisionSelectionMessage` (`src/lib/features/division-selection/buildDivisionSelectionMessage.ts`).
7. It posts the message into the command channel.
8. It updates the ephemeral response with success or failure.

## Feature B: Division selection button interactions

Exposed interaction surface:

- Button custom IDs matching:
- `division:join:<CODE>`
- `division:leave:combat`
- `division:leave:industrial`

Flow:

1. Button interaction is routed by Sapphire interaction handler (`src/interaction-handlers/divisionSelectionButton.ts`).
2. `parseDivisionSelection` validates custom ID format and action.
3. Main handler (`src/lib/features/division-selection/handleDivisionSelectionButton.ts`) defers ephemeral reply.
4. Guard checks:

- Interaction must be in guild.
- Member must resolve.
- Member must have `DivisionKind.LEGIONNAIRE`.

5. User row is fetched/created in Postgres (`findUniqueUser` / `upsertUser`).
6. COMBAT + INDUSTRIAL divisions are loaded from division cache utility.
7. Join path (`handleJoinDivision.ts`):

- Validates selected division.
- Removes any existing role in the same division kind.
- Adds selected division role.

8. Leave path (`handleLeaveDivision.ts`):

- Resolves requested kind (`combat` or `industrial`).
- Removes the user’s role(s) of that kind.

9. Ephemeral result is returned to the user.

Important side effect:

- Role changes fire `guildMemberUpdate`, which is what syncs DB `DivisionMembership` records and nickname.

## Feature C: Welcome onboarding on member join

Exposed event:

- `guildMemberAdd`

Flow:

1. Listener (`src/listeners/guildMemberAdd.ts`) calls feature handler.
2. Handler (`src/lib/features/guild-member/onGuildMemberAdd.ts`):

- Upserts `User` in Postgres.
- Builds welcome embed via `buildWelcomeMessage` (`src/lib/features/guild-member/buildWelcomeMessage.ts`).
- Sends to `WELCOME_CHANNEL_ID`.

## Feature D: Role-driven division membership sync + nickname sync

Exposed event:

- `guildMemberUpdate`

Flow:

1. Listener (`src/listeners/guildMemberUpdate.ts`) calls feature handler.
2. Handler (`src/lib/features/guild-member/onGuildMemberUpdate.ts`) computes role diff.
3. If no role change, it exits.
4. If changed, it calls `reconcileRolesAndMemberships`:

- Loads all divisions from cache utility.
- Computes desired division IDs from current Discord roles.
- Reads existing memberships from Postgres.
- Creates missing memberships and removes stale memberships.

5. Then it rebuilds nickname (`buildUserNickname.ts`) based on division priority and `displayNamePrefix`.
6. It attempts `setNickname` in Discord.

Nickname prefix priority (high to low):

1. AUXILIARY
2. STAFF
3. SPECIAL (except `CENT`)
4. LANCEARIUS
5. COMBAT
6. INDUSTRIAL
7. LEGIONNAIRE

## Feature E: Division cache refresh task

Exposed scheduled task:

- `divisionCacheRefresh` (`src/scheduled-tasks/divisionCacheRefresh.ts`)

Flow:

1. Runs on cron `DIVISION_CACHE_REFRESH_CRON`.
2. Calls `container.utilities.divisionCache.refresh()`.
3. Refresh repopulates the in-memory cache from Postgres.

## 5) Observability and error behavior

- Logging: pino-backed Sapphire `ILogger` via `container.logger` or `client.logger`, with optional Better Stack transport when env vars are configured.
- Command denied responses: `src/listeners/commands/chatInputCommands/chatInputCommandDenied.ts`.
- Command success debug logging: `src/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts`.
- Env is validated with Zod in `src/config/env/*`; invalid env throws at startup.

## 6) What exists in schema but is not yet exposed in bot runtime

Prisma models for event sessions, event tiers, merits, and name change requests are present, but no command/listener flows currently hook them up in `src/commands`/`src/listeners`.

## 7) Quick "where to change what"

- Add a new slash command: `src/commands`
- Add a guard/precondition: `src/preconditions`
- Add a button/select/modal flow: `src/interaction-handlers`
- Add an event reaction: `src/listeners`
- Add recurring logic: `src/scheduled-tasks`
- Add shared runtime service: `src/utilities`
- Keep feature logic in `src/lib/features`
- Keep feature-local helper functions in the owning folder under `src/lib/features`
