---
title: Local Development
sidebar_position: 2
---

# Local Development

## Prerequisites

- Node.js 22
- `pnpm` 10.x
- Docker
- a Discord bot token and guild-scoped configuration in `.env`

## First-Time Setup

1. Install dependencies.

```bash
pnpm install
```

2. Copy the example env file.

```bash
cp .env.example .env
```

3. Start Postgres and Redis.

```bash
pnpm db:up
pnpm redis:up
```

4. Apply Prisma migrations and seed if the workflow you are testing needs seed data.

```bash
pnpm db:migrate
pnpm db:seed
```

5. Run the bot.

```bash
pnpm dev
```

## Daily Commands

App and tests:

- `pnpm dev`
- `pnpm typecheck`
- `pnpm eslint src tests`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`

Infra:

- `pnpm db:up`
- `pnpm db:down`
- `pnpm db:reset`
- `pnpm redis:up`
- `pnpm redis:down`
- `pnpm redis:reset`

Docs:

- `pnpm docs:dev`
- `pnpm docs:build`
- `pnpm docs:serve`

## Docs Site Notes

The Docusaurus site lives in `website/`, not at repo root.

That is intentional:

- the bot already uses root `src/` for runtime code
- Docusaurus can also use its own `src/` when customized later
- keeping the site isolated avoids toolchain collisions

With the current GitHub Pages configuration, local doc serving is rooted under `/Arbiter/`. If you use `pnpm docs:serve`, open the site at `/Arbiter/`, not `/`.

## Test Runtime Notes

Unit tests always run locally.

Integration tests are gated on a working container runtime because they use Testcontainers-backed Postgres and Redis. If Docker is unavailable, `pnpm test:integration` exits cleanly without running suites.

Use this rule of thumb:

- changing pure logic, presenters, or service branching:
  start with `pnpm test:unit`
- changing Prisma, Redis, or repository-backed workflows:
  run `pnpm test:integration` with Docker available

## Runtime Assumptions

Development is guild-scoped:

- commands are registered to `DISCORD_GUILD_ID`
- command iteration is fast because there is no global propagation delay

Most local debugging assumes:

- one configured guild
- one configured bot token
- local Postgres and Redis

## When You Change Code

Use this loop:

1. run `pnpm typecheck`
2. run the smallest relevant test target first
3. run `pnpm test`
4. if you changed docs or navigation, run `pnpm docs:build`

If you change architecture, contributor workflows, feature entrypoints, or code placement rules, update the docs in the same change. Read [Maintaining Docs](/contributing/maintaining-docs) for the checklist.
