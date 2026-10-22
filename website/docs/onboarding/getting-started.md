---
title: Getting Started
sidebar_position: 2
---

# Getting Started

Use this page for a first known-good result. The focused [Local Development](../local-development/environment-and-services.md) runbooks cover runtime choices, daily controls, data work, proportional testing, and failure diagnosis.

## Prerequisites

- Node.js 22.12.0 or newer, but earlier than Node.js 23
- the `pnpm` version declared by the root `packageManager` field
- Docker when your lane needs local Postgres, Redis, observability, or integration tests
- non-production Discord and API credentials only for the runtime paths that use them

Arbiter is a pnpm workspace. The root package is the Discord bot, `apps/api` is an independently startable HTTP API, `apps/portal` is a static React/Vite site, and `website` contains these docs.

## Choose A Lane

You do not need the full stack for every change.

| Lane       | Start here                                    | First success                                            |
| ---------- | --------------------------------------------- | -------------------------------------------------------- |
| Docs only  | `pnpm docs:dev`                               | The site opens and changed pages render                  |
| Bot        | Local Postgres and Redis, then `pnpm dev`     | Logs contain `Logged in` and `runtime.initialized`       |
| API        | Local Postgres and Redis, then `pnpm dev:api` | Health is `200`; readiness is `200`                      |
| Portal UI  | Browser harness plus the portal dev server    | Sign-in reaches the fixture registry at `127.0.0.1:4173` |
| Full stack | Bot, API, portal, Postgres, and Redis         | Each runtime reaches its lane-specific signal            |

See [Environments And Services](../local-development/environment-and-services.md) for exact prerequisites, start/stop/log controls, and the minimum services for each lane.

## First Bot Boot

1. Install the pinned workspace dependencies. This also generates the Prisma client.

```bash
pnpm install
```

2. Create the local environment file and fill only the settings your lane needs. [`.env.example`](https://github.com/EvenLegion/Arbiter/blob/dev/.env.example) is the exhaustive configuration authority.

```bash
cp .env.example .env
```

3. Start the bot's local dependencies, apply checked-in deploy migrations, and seed reference data.

```bash
pnpm db:up
pnpm redis:up
pnpm db:migrate
pnpm db:seed
```

4. Start the bot.

```bash
pnpm dev
```

A known-good startup logs both `Logged in` and `runtime.initialized`. If it does not, use the [Troubleshooting](../local-development/troubleshooting.md) table before changing code.

## What To Read Next

- Choosing or stopping a runtime: [Environments And Services](../local-development/environment-and-services.md)
- Migrations, seeds, Testcontainers, or local restore: [Database And Data](../local-development/database-and-data.md)
- Selecting the narrowest useful check: [Testing And Validation](../local-development/testing-and-validation.md)
- Diagnosing common local failures: [Troubleshooting](../local-development/troubleshooting.md)
- Understanding runtime and state ownership: [System Guide](../architecture/system-guide.md)
- Finding the right layer for a change: [Contributor Guide](../contributing/change-guide.md)

Production deployment and real-data recovery are intentionally outside onboarding. Use [Operations](../operations/release-and-deploy.md) only with the required operational authority.
