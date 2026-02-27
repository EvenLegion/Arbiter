# Arbiter v3 (Sapphire)

Arbiter v3 is a Sapphire-first rewrite of the Arbiter bot.

Project walkthrough:

- [docs/PROJECT_ARCHITECTURE_AND_FLOWS.md](docs/PROJECT_ARCHITECTURE_AND_FLOWS.md)

It follows Sapphire conventions for:

- command routing (`/src/commands`)
- event handling (`/src/listeners`)
- button interaction handling (`/src/interaction-handlers`)
- recurring jobs (`/src/scheduled-tasks`)
- shared runtime helpers (`/src/utilities`)
- preconditions (`/src/preconditions`)

## Stack

- `@sapphire/framework`
- `@sapphire/plugin-subcommands`
- `@sapphire/plugin-utilities-store`
- `@sapphire/plugin-scheduled-tasks`
- `@sapphire/cron`
- `@sapphire/timer-manager`
- `pino` + `pino-pretty`
- `@logtail/pino` (optional Better Stack transport when env is configured)
- Prisma + PostgreSQL
- Redis (AUX VC credit state + Sapphire scheduled tasks backend)

## Requirements

- Node 18+
- Docker + Docker Compose plugin (recommended for local infra)
- Discord bot token + guild config in `.env`

## Setup

1. Install deps:

```sh
pnpm install
```

2. Copy env template and fill values:

```sh
cp .env.example .env
```

3. Generate Prisma client:

```sh
pnpm db:generate
```

4. Start local Postgres + Redis with Docker:

```sh
pnpm infra:up
```

5. Run migrations:

```sh
pnpm db:migrate
```

## Run

Development:

```sh
pnpm dev
```

Build + run compiled output:

```sh
pnpm build
pnpm start
```

## Docker Infra

Postgres for local development:

```sh
pnpm db:up
pnpm db:down
pnpm db:reset
```

Redis for local development and production (VPS):

```sh
pnpm redis:up
pnpm redis:down
pnpm redis:logs
```

Start/stop both services locally:

```sh
pnpm infra:up
pnpm infra:down
```

## Notes

- Slash commands are registered with Sapphire application command registries and scoped to `DISCORD_GUILD_ID`.
- AUX VC ticker is implemented as a Sapphire scheduled task instead of a bespoke `setInterval`.
- Division cache refresh is handled by a scheduled cron task and exposed through a Sapphire utility.
- Discord access is done directly through Sapphire (`container.client`) instead of a custom Discord integration layer.
- Logging uses a pino-backed Sapphire `ILogger` (`container.logger`) with optional Better Stack transport.
