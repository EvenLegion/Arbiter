# Arbiter v3

## Table of Contents

- [Arbiter v3](#arbiter-v3)
    - [Table of Contents](#table-of-contents)
    - [Stack](#stack)
    - [Requirements](#requirements)
    - [Local Development](#local-development)
    - [Script Reference](#script-reference)
    - [Environment Variables](#environment-variables)
    - [Logging Behavior](#logging-behavior)
    - [Production Deployment (VPS)](#production-deployment-vps)
        - [1) One-Time VPS Hardening](#1-one-time-vps-hardening)
        - [2) Prepare Persistent Host Directories](#2-prepare-persistent-host-directories)
        - [3) First Production Deploy](#3-first-production-deploy)
        - [4) Ongoing Deploys and New Migrations](#4-ongoing-deploys-and-new-migrations)
        - [5) Runtime Verification and Operations](#5-runtime-verification-and-operations)
        - [6) Start/Stop Bot Container Only](#6-startstop-bot-container-only)
        - [7) Apply a Code Upgrade](#7-apply-a-code-upgrade)
    - [Migration Folder Purpose](#migration-folder-purpose)

## Stack

- Sapphire framework (`@sapphire/framework` + subcommands/scheduled-tasks/utilities-store)
- Discord.js v14
- Prisma + PostgreSQL
- Redis (event tracking + scheduled tasks backend)
- Pino logging (`pino`, `pino-pretty`, optional Better Stack via `@logtail/pino`)

## Requirements

- Node.js 22+ recommended for local development
- pnpm 10.11.0 (pinned via `packageManager` in `package.json`)
- Docker + Docker Compose plugin
- Discord bot token + guild configuration in `.env`

## Local Development

1. Install dependencies.

```sh
pnpm install
```

2. Create local env file.

```sh
cp .env.example .env
```

3. Start local Postgres and Redis.

```sh
pnpm db:up
pnpm redis:up
```

4. Apply Prisma migrations.

```sh
pnpm db:migrate
```

5. Run the bot.

```sh
pnpm dev
```

Optional local helpers:

```sh
pnpm typecheck
pnpm lint
pnpm db:studio
```

Stop local infra:

```sh
pnpm db:down
pnpm redis:down
```

Reset local infra volumes:

```sh
pnpm db:reset
pnpm redis:reset
```

## Script Reference

App/runtime:

- `pnpm dev` - run bot from TypeScript source
- `pnpm build` - compile TypeScript
- `pnpm start` - run compiled bot (`dist/index.js`)
- `pnpm typecheck` - TypeScript type-check only
- `pnpm lint` - eslint

Database and seeding:

- `pnpm db:generate` - Prisma client generate
- `pnpm db:migrate` - `prisma migrate deploy`
- `pnpm db:seed` - main Prisma seed
- `pnpm db:seed:guild-members`
- `pnpm db:seed:events`
- `pnpm db:seed:event-merits`
- `pnpm db:seed:non-event-merits`

Migration data utilities:

- `pnpm db:fetch:guild-members`
- `pnpm db:fetch:event-sessions`
- `pnpm db:verify:merit-rank`
- `pnpm db:migrate:users` (fetch + seed guild members)

Local docker services:

- `pnpm db:up | db:down | db:reset`
- `pnpm redis:up | redis:down | redis:reset | redis:logs`

Production docker helpers:

- `pnpm prod:build | prod:up | prod:down | prod:logs`

## Environment Variables

Use `.env.example` as the source of truth for all keys.

Minimum required to run the bot:

- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- `DATABASE_URL`
- Discord role/channel IDs referenced by command and feature logic

Important operational values:

- `NODE_ENV` (`development` or `production`)
- `LOG_LEVEL` (console log level)
- `LOCAL_FILE_LOG_LEVEL` (local file log level)
- `LOCAL_LOG_FILE_PATH`
- `BETTER_STACK_SOURCE_TOKEN`, `BETTER_STACK_INGESTING_HOST` (optional)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`

## Logging Behavior

The logger is multi-target:

- Console (`pino-pretty`) uses `LOG_LEVEL`
- Local file (`pino/file`) uses `LOCAL_FILE_LOG_LEVEL` and writes to `LOCAL_LOG_FILE_PATH`
- Better Stack (`@logtail/pino`) uses `LOG_LEVEL` and is enabled only when both `BETTER_STACK_SOURCE_TOKEN` and `BETTER_STACK_INGESTING_HOST` are set

Operational notes:

- `LOG_LEVEL` affects both console and Better Stack output
- If `LOG_LEVEL=debug` locally, debug and above appear in console
- File logs do not rotate automatically in-app; use host-level rotation and/or increase `LOCAL_FILE_LOG_LEVEL`

## Production Deployment (VPS)

This repo includes:

- `Dockerfile` (multi-stage: `migrate` + runtime)
- `docker-compose.prod.yml` (services: `arbiter-migrate`, `arbiter-bot`, `arbiter-redis`)

### 1) One-Time VPS Hardening

Install baseline tools:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw ripgrep
```

Install Docker Engine + Compose plugin (Ubuntu/Debian):

```sh
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Create non-root deploy user and grant Docker access:

```sh
sudo adduser deploy
sudo usermod -aG docker deploy
```

Re-login and verify:

```sh
docker --version
docker compose version
```

Configure firewall:

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Set timezone and NTP (important for log/event timestamps):

```sh
timedatectl set-timezone UTC
timedatectl set-ntp true
timedatectl status
```

### 2) Prepare Persistent Host Directories

```sh
sudo mkdir -p /opt/arbiter/redis-data /opt/arbiter/bot-logs
```

By default, compose maps users as:

- bot: `BOT_UID:BOT_GID` defaults to `1000:1000`
- redis: `REDIS_UID:REDIS_GID` defaults to `999:999`

Set ownership accordingly:

```sh
sudo chown -R 1000:1000 /opt/arbiter/bot-logs
sudo chown -R 999:999 /opt/arbiter/redis-data
```

Verify resolved compose users + current ownership:

```sh
docker compose -f docker-compose.prod.yml config | rg "user:"
stat -c "%u:%g %n" /opt/arbiter/bot-logs /opt/arbiter/redis-data
```

If you override `BOT_UID`/`BOT_GID`/`REDIS_UID`/`REDIS_GID` in `.env`, use those values for ownership instead.

### 3) First Production Deploy

```sh
git pull
cp .env.example .env   # first time only
chmod 600 .env
# edit .env with production values
# take a DB backup/snapshot before applying migrations
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

When to use:

- `docker compose -f docker-compose.prod.yml up -d --force-recreate`:
  use after image/env changes, or when a container is in a bad/restart-loop state and you want a clean recreate.
- `docker compose -f docker-compose.prod.yml logs -f arbiter-bot`:
  use immediately after deploy/restart to confirm boot, command registration, and runtime initialization.

Required production `.env` values include:

- `NODE_ENV=production`
- `DATABASE_URL`
- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- required Discord role/channel IDs used by the bot

Useful optional production `.env` values:

- `REDIS_DATA_DIR`, `BOT_LOGS_DIR`
- `BOT_UID`, `BOT_GID`, `REDIS_UID`, `REDIS_GID`
- `BOT_MEM_LIMIT`, `BOT_CPUS`, `REDIS_MEM_LIMIT`, `REDIS_CPUS`

### 4) Ongoing Deploys and New Migrations

Use this every time new migrations are added:

```sh
# take a DB backup/snapshot before applying migrations
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

This is why `arbiter-migrate` exists: runtime stays slim while Prisma CLI remains available in the migration service. You can keep `prisma` in `devDependencies` and still run production migrations safely.

### 5) Runtime Verification and Operations

Check effective container users after startup:

```sh
docker compose -f docker-compose.prod.yml exec arbiter-bot id
docker compose -f docker-compose.prod.yml exec arbiter-redis id
```

Tail logs:

```sh
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
docker compose -f docker-compose.prod.yml logs -f arbiter-redis
```

Stop services:

```sh
docker compose -f docker-compose.prod.yml down
```

### 6) Start/Stop Bot Container Only

Use these when you only want to operate the bot container and leave Redis running.

Start bot container:

```sh
docker compose -f docker-compose.prod.yml up -d arbiter-bot
```

Stop bot container:

```sh
docker compose -f docker-compose.prod.yml stop arbiter-bot
```

Restart bot container:

```sh
docker compose -f docker-compose.prod.yml restart arbiter-bot
```

Recreate bot container (without touching other services):

```sh
docker compose -f docker-compose.prod.yml up -d --force-recreate arbiter-bot
```

Tail bot logs:

```sh
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

### 7) Apply a Code Upgrade

Use this when you want to deploy the latest bot code and recreate only the bot container:

```sh
git pull origin main
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml up -d --force-recreate arbiter-bot
```

## Migration Folder Purpose

`prisma/migration` scripts are data migration utilities used to import legacy data into the new schema. They are separate from Prisma schema migrations and should be run intentionally as part of migration workflows, not on every bot deploy.
