---
title: Environments And Services
sidebar_position: 1
---

# Environments And Services

Choose the smallest lane that exercises the behavior you are changing. The [root package scripts](https://github.com/EvenLegion/Arbiter/blob/dev/package.json) and package-level scripts remain the command authority; [`.env.example`](https://github.com/EvenLegion/Arbiter/blob/dev/.env.example) remains the exhaustive environment authority.

## Development Lanes

| Lane                 | Minimum local services                                                   | Start commands                                                                          | Known-good signal                                        |
| -------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Bot                  | Postgres, Redis, Discord bot credentials                                 | `pnpm dev` after the database flow                                                      | Logs contain `Logged in` and `runtime.initialized`       |
| API                  | Postgres, Redis, API-only OAuth settings and credential pepper           | `pnpm dev:api`                                                                          | `/api/v1/health` and `/api/v1/readiness` return `200`    |
| Portal UI            | Portal browser harness; no Postgres, Redis, OAuth secret, or API process | `pnpm --filter @arbiter/portal browser:harness` and `pnpm --filter @arbiter/portal dev` | Fixture sign-in reaches the registry at `127.0.0.1:4173` |
| Portal with real API | Portal, API, Postgres, Redis, non-production API OAuth settings          | `pnpm dev:api` and `pnpm --filter @arbiter/portal dev`                                  | Portal session loads and API readiness stays `200`       |
| Docs only            | No runtime service or `.env` file                                        | `pnpm docs:dev`                                                                         | Site opens at the URL printed by Docusaurus              |
| Full stack           | Bot, API, portal, Postgres, Redis; observability optional                | Start each runtime in its own terminal                                                  | Every lane reaches its signal above                      |

For the portal, copy `apps/portal/.env.example` to `apps/portal/.env.local`. The only browser-visible setting is `VITE_API_BASE_URL`; never put secrets in a `VITE_` variable.

## First Infrastructure Boot

Source runs use host-published local services:

```bash
pnpm db:up
pnpm redis:up
pnpm db:migrate
```

Run `pnpm db:seed` when the workflow needs the repository's reference divisions, merit types, or event tiers. See [Database And Data](./database-and-data.md) before changing or restoring local data.

Observability is optional for normal development:

```bash
pnpm obs:up
```

It tails `logs/arbiter.log` and `logs/api.log` through Alloy into Loki and Grafana. It does not prove that the bot, database, Redis, or API is healthy.

## Daily Controls

Run source processes in separate terminals and stop them with <kbd>Ctrl</kbd>+<kbd>C</kbd>. The controls below target only local Compose services.

| Service       | Start                                                 | Stop                                            | Follow logs                                        |
| ------------- | ----------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Postgres      | `pnpm db:up`                                          | `pnpm db:down`                                  | `docker compose -f docker-compose.db.yml logs -f`  |
| Redis         | `pnpm redis:up`                                       | `pnpm redis:down`                               | `pnpm redis:logs`                                  |
| Observability | `pnpm obs:up`                                         | `pnpm obs:down`                                 | `pnpm obs:logs`                                    |
| API container | `docker compose -f docker-compose.api.yml up --build` | `docker compose -f docker-compose.api.yml down` | `docker compose -f docker-compose.api.yml logs -f` |

The API container reuses the host-published development Postgres and Redis services; it does not create them. Source and container API runs should not bind the same port at the same time.

:::danger Destructive local resets

`pnpm db:reset`, `pnpm redis:reset`, and `pnpm obs:reset` remove the named local Compose volume as well as stopping the service. They are not ordinary stop commands. Confirm the target is disposable local state before running one, then restart the service explicitly.

Never use these commands for production or real-data recovery.

:::

## Configuration Boundaries

- The bot needs Discord configuration plus Postgres and Redis settings.
- The API needs its own Discord OAuth application settings and credential pepper, but never the bot token.
- The portal needs only the public API origin. It owns no database, Redis client, OAuth secret, or authoritative session.
- Docs-only work needs neither Docker nor runtime credentials.
- Production-shaped configuration is not a prerequisite for ordinary local work.

Use the [Standalone API](../api/standalone-api.md) and [Staff Portal](../api/staff-portal.md) pages for their security and response contracts. Use [Troubleshooting](./troubleshooting.md) for first checks when a lane does not reach its success signal.
