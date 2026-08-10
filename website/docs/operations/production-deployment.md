---
title: Production Deployment
sidebar_position: 10
---

# Production Deployment

This runbook covers the minimum first-deploy and update path for one compatible
Arbiter source revision. It describes production actions but does not authorize
them. Obtain explicit current approval for migration, secrets, infrastructure,
Vercel, service restarts, and every other live mutation.

## Deployment Contract

- External Postgres is the durable authority and is not part of production Compose.
- The repository migration applies once to the shared database. There is no API-
  or portal-specific migration command.
- Production Compose owns `arbiter-migrate`, `arbiter-bot`, `arbiter-api`,
  `arbiter-redis`, `arbiter-loki`, `arbiter-alloy`, and `arbiter-grafana`.
- Vercel serves the static portal artifact separately. The portal is not a
  Compose service and deploys only after a compatible API is ready.
- The bot and API share Postgres and Redis but run, log, verify, and roll back
  independently.

Use `.env.example` as the exhaustive configuration source. Keep API secrets in
the API runtime boundary and provide Vercel only `VITE_API_BASE_URL`. The proxy,
OAuth, cookie, origin, pool-capacity, and contract requirements live in
[API and portal deployment readiness](../api/deployment-readiness.md).

## Before Either Deploy Path

1. Select the approved source revision and record the intended migration, bot,
   API, and portal artifact identifiers. Retain the prior compatible identifiers.
2. Verify a current external Postgres backup and the existing Redis persistence
   path. A backup is not verified merely because a file exists.
3. Create the persistent bot/API log and observability directories with the
   reviewed numeric owners. Production Compose intentionally refuses to create
   the API log bind path.
4. Confirm database connection capacity for the bot, migration, bounded API pool,
   and operator reserve.
5. Confirm the approved API bind, HTTPS proxy, exact origins, Discord callback,
   and portal public API origin before any public traffic is enabled.

For dependency-advisory or image-reachability work, complete
[Runtime dependency audits](./dependency-audits.md) before rollout.

## First Deploy

Build the three Compose targets and the portal from the selected revision. The
portal command builds and scans the static artifact without deploying it:

```bash
docker compose -f docker-compose.prod.yml build --pull \
  arbiter-migrate arbiter-bot arbiter-api
VITE_API_BASE_URL=https://api.example.invalid pnpm build:portal
```

Replace the example portal origin with the reviewed production API origin for
the real artifact. Record immutable registry digests or image IDs and the portal
deployment artifact identifier before starting the rollout.

After the backup and operational approvals are confirmed, apply the migration
exactly once, start shared services, then start the two runtimes:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  arbiter-migrate
docker compose -f docker-compose.prod.yml up -d \
  arbiter-redis arbiter-loki arbiter-alloy arbiter-grafana
docker compose -f docker-compose.prod.yml up -d --force-recreate \
  arbiter-api arbiter-bot
```

Do not follow the one-off migration command with an unscoped `docker compose up`
that starts `arbiter-migrate` again. Verify the API and bot independently, then
deploy the compatible portal artifact to Vercel and complete its static and API
checks.

## Normal Update

For a normal update:

1. Record the new and prior compatible artifact identifiers.
2. Build or retrieve every affected artifact from the selected source revision.
3. Verify the current backup, then run `arbiter-migrate` once. `prisma migrate
   deploy` safely reports when no migration is pending; runtime startup never
   substitutes for this explicit step.
4. Recreate only the affected runtime services. An API-only update must not
   restart the bot, and a bot-only update must not restart the API or Redis.
5. Complete the minimum verification for every affected and shared dependency.
6. If the portal changed, deploy it only after API readiness and contract
   compatibility are confirmed.

Concrete runtime update commands are intentionally separate:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate \
  arbiter-api
docker compose -f docker-compose.prod.yml up -d --force-recreate \
  arbiter-bot
```

Run the API and bot lines only for the services selected by the approved update.
Shared-service recreation requires its own evidence and approval; it is not a
routine application rollout step.

## Minimum Verification

Container state is evidence, not proof that Arbiter works. Record these checks
for the deployed revision:

| Surface | Minimum evidence |
| --- | --- |
| Migration | `arbiter-migrate` exits successfully once and the expected migration history is present in external Postgres. |
| Bot | `arbiter-bot` remains running; its own log contains `Logged in`, `runtime.gateway.ready`, and `runtime.initialized`; perform the approved Discord smoke check when behavior changed. |
| API | Local `/api/v1/health` and `/api/v1/readiness` succeed independently; the approved public proxy rejects incorrect host/proxy input; responses carry the expected contract header. |
| Redis | Bot scheduled work and API session/rate-limit dependencies remain reachable without flushing, deleting, or recreating Redis. |
| Logs | Bot and API files are written to separate mounts; Alloy ships `{app="arbiter", service="bot"}` and `{app="arbiter", service="arbiter-api"}` streams to Loki. |
| Portal | The static artifact has the reviewed response headers, direct navigation works, and a real request succeeds only against a compatible API contract. |

Start API verification on the host loopback binding:

```bash
api_port="${API_PORT:-3000}"
curl -fsS "http://127.0.0.1:${api_port}/api/v1/health"
curl -fsS "http://127.0.0.1:${api_port}/api/v1/readiness"
curl -fsSI "http://127.0.0.1:${api_port}/api/v1/health" \
  | grep -i '^x-arbiter-api-contract-version:'
docker compose -f docker-compose.prod.yml logs --tail=100 \
  arbiter-api arbiter-bot
```

Health proves only that the HTTP process accepts requests. Readiness proves the
bounded Postgres and Redis checks. Complete the proxy, security-header, browser,
and contract matrix in the
[API and portal deployment-readiness runbook](../api/deployment-readiness.md).
Use [Redis and BullMQ](./redis-and-queues.md) for the queue and memory evidence.

## Persistent Data And Logs

Production host paths persist bot logs, API logs, Redis data, Loki data, Grafana
data, and Alloy state. The API log mount is separate so one runtime can fail or
roll back without obscuring the other. If paths or numeric container users
change, update and verify host ownership before restarting services.

Postgres backup and restore remain external operator procedures. Redis
persistence supports coordination but is not durable workflow authority. Never
reconstruct integrations, credentials, events, reviews, or merits from Redis.

For failed verification, stop the rollout and select the matching route in
[Recovery and incidents](./recovery.md).
