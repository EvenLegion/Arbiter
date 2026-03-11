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
- `pino` + `pino-pretty`
- `@logtail/pino` (optional Better Stack transport when env is configured)
- Prisma + PostgreSQL
- Redis (event tracking state + Sapphire scheduled tasks backend)

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

## Production Docker (VPS)

This repo includes:

- `Dockerfile` for packaging the bot
- `docker-compose.prod.yml` for running bot + Redis

### VPS prerequisites and hardening

Install baseline packages:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw
```

Install Docker Engine + Docker Compose plugin (Ubuntu/Debian):

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

Create a non-root deploy user and grant Docker access:

```sh
sudo adduser deploy
sudo usermod -aG docker deploy
```

Log out/in after group changes, then verify:

```sh
docker --version
docker compose version
```

Configure firewall (adjust SSH port if needed):

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Set timezone and ensure time sync (important for logs/scheduled tasks):

```sh
timedatectl set-timezone UTC
timedatectl status
```

Create persistent host directories used by compose:

```sh
sudo mkdir -p /opt/arbiter/redis-data /opt/arbiter/bot-logs
sudo chown -R deploy:deploy /opt/arbiter/redis-data /opt/arbiter/bot-logs
```

Recommended VPS flow:

```
git pull
cp .env.example .env   # first time only
# edit .env with real values
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

1. Prepare `.env` with production values:
    - `NODE_ENV=production`
    - `DATABASE_URL` (your production Postgres URL)
    - `DISCORD_TOKEN`, `DISCORD_GUILD_ID`, and required role/channel envs
    - optional limits: `BOT_MEM_LIMIT`, `BOT_CPUS`, `REDIS_MEM_LIMIT`, `REDIS_CPUS`
    - optional Redis host path: `REDIS_DATA_DIR` (default `/opt/arbiter/redis-data`)
2. Build and start:

```sh
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

3. Check logs:

```sh
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
docker compose -f docker-compose.prod.yml logs -f arbiter-redis
```

4. Stop:

```sh
docker compose -f docker-compose.prod.yml down
```

## Notes

- Slash commands are registered with Sapphire application command registries and scoped to `DISCORD_GUILD_ID`.
- Event VC tracking ticker is implemented as a Sapphire scheduled task.
- Division cache refresh is handled by a scheduled cron task and exposed through a Sapphire utility.
- Discord access is done directly through Sapphire (`container.client`) instead of a custom Discord integration layer.
- Logging uses a pino-backed Sapphire `ILogger` (`container.logger`) with multi-target transports:
    - Console (`pino-pretty`) uses `LOG_LEVEL`
    - Local file (`LOCAL_LOG_FILE_PATH`) always receives `debug` and above
    - Better Stack (`@logtail/pino`) receives only `warn` and above when `BETTER_STACK_SOURCE_TOKEN` and `BETTER_STACK_INGESTING_HOST` are set

## Logging Gotchas

- `LOG_LEVEL` controls console output only. It does not reduce local file logging below `debug`.
- If you set `LOG_LEVEL=debug` locally, you will still see debug+ logs in the console.
- In Docker production, file logs are written inside the container at `LOCAL_LOG_FILE_PATH` (default: `logs/arbiter.log` under `/app`).
- If you want file logs persisted on the VPS host, mount a host directory and point `LOCAL_LOG_FILE_PATH` to that mount path (for example `/app/logs/arbiter.log`).
