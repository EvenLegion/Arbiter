---
title: Troubleshooting
sidebar_position: 4
---

# Troubleshooting

Start with the first check that can separate configuration, dependency, and application failures. Preserve request IDs and sanitized logs; do not paste tokens, cookies, database URLs, OAuth codes, or raw environment values into issues or chat.

## Symptom To First Check

| Symptom                                                                     | First check                                                                                                                                                                                                       | Next route                                                                                                                                                                                           |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot exits early or a Discord feature appears missing                        | Compare the relevant keys in `.env` with [`.env.example`](https://github.com/EvenLegion/Arbiter/blob/dev/.env.example), then look for both `Logged in` and `runtime.initialized` in console or `logs/arbiter.log` | Wrong guild, role, channel, or event-ping IDs can look like code defects. Use the feature page only after startup configuration is valid.                                                            |
| Postgres command fails or API readiness is `503`                            | Run `pnpm db:up`, inspect `docker compose -f docker-compose.db.yml logs -f`, then run `pnpm exec prisma migrate status`                                                                                           | Confirm the Prisma CLI and runtime point at the intended local database. Use [Database And Data](./database-and-data.md); do not reset first.                                                        |
| Event tracking, scheduled tasks, OAuth state, or directory rate limits fail | Run `pnpm redis:up` and `pnpm redis:logs`                                                                                                                                                                         | Confirm host, port, password, and database number against `.env.example`. Redis reset deletes transient local state and is a last local-only step, not a first check.                                |
| API health is `200` but readiness is `503`                                  | Check Postgres and Redis independently, then inspect `logs/api.log` using the response `X-Request-Id` when available                                                                                              | Health proves only the process is alive. Readiness deliberately hides the failing dependency from callers; use the [Standalone API](../api/standalone-api.md) logging guidance.                      |
| Portal reports an incompatible API contract                                 | Confirm the portal and API came from compatible revisions and that the response includes the expected `X-Arbiter-Api-Contract-Version` header                                                                     | Rebuild shared contracts and the affected packages, then restart both processes. Do not bypass the portal's fail-closed contract check.                                                              |
| Logs appear locally but not in Grafana                                      | Confirm `logs/arbiter.log` or `logs/api.log` is receiving new JSON records, then run `pnpm obs:logs`                                                                                                              | Check Alloy can read the mounted `./logs` directory and reach Loki. Use `{app="arbiter"}` or `{app="arbiter", service="arbiter-api"}` in Grafana; do not reset observability before inspecting logs. |

## Useful Read-Only Checks

```bash
docker compose -f docker-compose.db.yml ps
docker compose -f docker-compose.redis.yml ps
docker compose -f docker-compose.observability.yml ps
curl -i http://127.0.0.1:3000/api/v1/health
curl -i http://127.0.0.1:3000/api/v1/readiness
```

For source processes, the console is the fastest first view. Arbiter also writes structured bot logs to `logs/arbiter.log` and API logs to `logs/api.log` by default.

## Avoid False Fixes

- Do not reset Postgres or Redis merely because a process failed to connect.
- Do not replace a failing Testcontainers run with a successful skip.
- Do not weaken portal contract checks or API readiness responses to make a local screen load.
- Do not use production credentials, production data, or live Discord state to diagnose local setup.
- Do not copy raw dependency errors or secrets into a user-visible response.

Advanced production deployment, rollback, and log-shipping incidents belong in [Operations](../operations/release-and-deploy.md), not in the local onboarding loop.
