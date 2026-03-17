---
title: Production Deployment
sidebar_position: 5
---

# Production Deployment

## What Runs In Production

The production Docker stack is defined in `docker-compose.prod.yml`.

Current services:

- `arbiter-migrate`
- `arbiter-bot`
- `arbiter-redis`
- `arbiter-loki`
- `arbiter-alloy`
- `arbiter-grafana`

This means the bot runtime, Redis, and the observability stack all run together on the VPS.

## Required Production Inputs

Use `.env.example` as the source of truth for available keys.

At minimum, production needs:

- `NODE_ENV=production`
- `DATABASE_URL`
- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- the Discord role and channel IDs used by the bot

Operationally important values include:

- `LOG_FILE_PATH`
- `FILE_LOG_LEVEL`
- `CONSOLE_LOG_LEVEL`
- `ALLOY_DOCKER_VERSION`
- `LOKI_DOCKER_VERSION`
- `GRAFANA_DOCKER_VERSION`
- `BOT_LOGS_DIR`
- `REDIS_DATA_DIR`
- `LOKI_DATA_DIR`
- `GRAFANA_DATA_DIR`
- `ALLOY_DATA_DIR`
- `GRAFANA_ADMIN_USER`
- `GRAFANA_ADMIN_PASSWORD`

## One-Time VPS Preparation

### Install baseline packages

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw ripgrep
```

### Install Docker Engine and Compose

```bash
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

### Create a deploy user

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
```

Re-login, then verify:

```bash
docker --version
docker compose version
```

### Configure firewall and time sync

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
timedatectl set-timezone UTC
timedatectl set-ntp true
timedatectl status
```

## Persistent Host Directories

Create the persistent directories the compose stack expects:

```bash
sudo mkdir -p /opt/arbiter/redis-data /opt/arbiter/bot-logs
```

The default container users are:

- bot: `1000:1000`
- redis: `999:999`

Set ownership accordingly:

```bash
sudo chown -R 1000:1000 /opt/arbiter/bot-logs
sudo chown -R 999:999 /opt/arbiter/redis-data
```

If you override `BOT_UID`, `BOT_GID`, `REDIS_UID`, or `REDIS_GID`, match those values on the host as well.

## First Deploy

Use this sequence on a clean VPS:

```bash
git pull
cp .env.example .env
chmod 600 .env
# edit .env with production values
# take a database backup or snapshot before applying migrations
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

Why `arbiter-migrate` exists:

- the runtime container stays smaller
- Prisma CLI remains available in the migration container
- schema migration stays explicit instead of hidden inside bot startup

## Ongoing Deploy Loop

Use this whenever code or schema changes need to reach the VPS:

```bash
# take a database backup or snapshot before applying migrations
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

Use `up -d --force-recreate` when:

- images changed
- env values changed
- a service is in a bad state and you want a clean recreate

## Bot-Only Operations

Sometimes you only want to operate the bot container and leave Redis and observability running.

Start:

```bash
docker compose -f docker-compose.prod.yml up -d arbiter-bot
```

Stop:

```bash
docker compose -f docker-compose.prod.yml stop arbiter-bot
```

Restart:

```bash
docker compose -f docker-compose.prod.yml restart arbiter-bot
```

Recreate only the bot:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate arbiter-bot
```

## Runtime Verification

Check effective container users:

```bash
docker compose -f docker-compose.prod.yml exec arbiter-bot id
docker compose -f docker-compose.prod.yml exec arbiter-redis id
```

Tail service logs:

```bash
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
docker compose -f docker-compose.prod.yml logs -f arbiter-redis
```

Stop the whole stack:

```bash
docker compose -f docker-compose.prod.yml down
```

## Production Logging And Grafana

Production uses the same file-first logging model as development:

- `arbiter-bot` writes JSON logs to `/app/logs/arbiter.log`
- that path is backed by `BOT_LOGS_DIR` on the VPS
- Alloy tails the mounted log directory
- Loki stores the logs
- Grafana is the main operator UI

The provisioned Grafana instance includes the `Arbiter Logs` dashboard, so operators start with a working log view instead of building one manually after deploy.

That is why log retention and host disk usage matter. The bot does not rotate files in-app. Use host-level rotation or a deploy-level rotation policy.

For the logging model itself, read [Logging And Observability](/architecture/logging-and-observability).

## Production Compose Helpers

The repo also exposes package scripts for the production compose file:

- `pnpm prod:build`
  Builds the production images from `docker-compose.prod.yml`. Use it before a deploy when images need refreshing.
- `pnpm prod:up`
  Starts the full production compose stack in detached mode. Use it when bringing the VPS stack online.
- `pnpm prod:down`
  Stops the full production compose stack. Use it for controlled shutdowns or maintenance windows.
- `pnpm prod:logs`
  Tails the production compose logs. Use it right after deploys or while investigating runtime issues.

These are convenience wrappers over `docker compose -f docker-compose.prod.yml ...`.

## Legacy Data Migration Utilities

`prisma/migration/` is not the normal runtime migration path.

Those scripts are data-migration utilities for importing or repairing legacy data. They should be run intentionally, not on every deploy.

Normal schema migration goes through:

- `pnpm db:migrate`
  Runs Prisma schema migrations. Use it locally or in controlled deploy workflows, not as a catch-all for legacy data migration.
- `arbiter-migrate` in the production compose flow

## Read This Next

- For local boot and daily commands:
  [Local Development](/onboarding/local-development)
- For logging architecture:
  [Logging And Observability](/architecture/logging-and-observability)
- For release preparation:
  [Release Workflow](/contributing/release-workflow)
