---
title: Production Deployment
sidebar_position: 3
---

# Production Deployment

This page covers the Arbiter-specific production model, not generic Linux or Docker administration.

## What The Production Stack Actually Runs

The production Docker stack currently runs:

- a migration container
- the bot runtime container
- Redis
- Loki
- Alloy
- Grafana

One important detail:

Postgres is not part of the production compose stack. Production expects an external database reachable through `DATABASE_URL`.

## Why There Is A Separate Migration Container

The migration container exists so schema migration is an explicit deployment step rather than an invisible side effect of bot startup.

That separation is healthy because:

- failed migrations are easier to reason about
- the runtime container stays focused on running the bot
- deployment operators can see exactly when schema changes are being applied

## Production Inputs

Use `.env.example` as the source of truth for supported configuration.

At minimum, production needs:

- `NODE_ENV=production`
- `DATABASE_URL`
- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- the Discord role and channel IDs the bot depends on

Operationally important values also include:

- log file configuration
- Redis connection settings
- persistent volume directories
- container resource limits
- Grafana credentials
- image tag overrides if you use them

## Persistent Host Data

The production stack expects persistent host directories for:

- bot logs
- Redis data
- Loki data
- Grafana data
- Alloy data

If those paths are moved or re-owned, update the environment configuration to match. The bot container and Redis container may run under explicit numeric users, so host ownership matters.

## First Deploy

A normal first deploy looks like this:

1. check out the repo on the host
2. create and secure `.env`
3. make sure the expected persistent directories exist
4. build the images
5. run the migration container
6. start the stack
7. inspect bot logs

Repo-specific commands:

```bash
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

Before running migrations against production, take a database backup or otherwise ensure you have a rollback plan for the durable data.

## Normal Update Deploy

For a standard application update, the loop is the same:

```bash
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

Use `--force-recreate` when:

- images changed
- environment values changed
- a service is in a bad state and you want a clean replacement

## What To Verify After Deploy

At minimum, verify:

- the migration step completed successfully
- the bot container stays healthy and connected
- Redis is reachable from the bot
- logs are still being written to the expected mounted directory
- Alloy is shipping logs and Grafana can still query Loki

The bot log stream is usually the fastest first check after deployment.

## Operational Notes

### Logging

Production uses the same file-first logging model as development:

- the bot writes structured logs to the configured log path
- the log directory is mounted from the host
- Alloy tails that mounted directory
- Loki stores the logs

That means deployment issues often show up as either:

- the bot failed to start
- the bot started but logs are not being shipped

### Redis

Redis is part of the production stack because event tracking depends on it. If Redis is down, live event workflows will degrade even if the bot process itself is still alive.

### Database

Because Postgres is external, database reachability is one of the first things to verify when the bot fails early in production.

## Common Deployment Mistakes

- assuming production Postgres is in the compose stack when it is actually external
- skipping the migration container and hoping runtime startup will handle schema drift
- forgetting to create or mount persistent host directories
- changing container user IDs without fixing host ownership
- checking only container health and not actual bot logs

## What To Read Next

- how releases are prepared before deploy:
  [Release Workflow](/contributing/release-workflow)
- how logging and observability are structured:
  [Logging And Observability](/architecture/logging-and-observability)
