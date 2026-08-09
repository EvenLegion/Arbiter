---
title: Standalone API
sidebar_position: 4
---

# Standalone API

The Arbiter API is an HTTP process that runs independently from the Discord bot. It establishes the runtime, contract, storage, and observability boundaries that future account and directory features will use without coupling their lifecycle to Discord.

## Current Capability

The API currently provides infrastructure endpoints only:

| Method      | Route               | Purpose                                                                 |
| ----------- | ------------------- | ----------------------------------------------------------------------- |
| `GET, HEAD` | `/api/v1/health`    | Process liveness. Returns `200` without checking external dependencies. |
| `GET, HEAD` | `/api/v1/readiness` | Checks the API-owned Postgres pool and Redis client.                    |

The API has no business-data route, OAuth flow, portal, or production exposure yet. The versioned contract package defines only the `users:read` permission name for the next authenticated surface; defining the name does not grant access or expose user data.

The API reuses Arbiter's canonical Postgres schema and existing Redis service. It owns its own bounded database pool and Redis client, and stopping it closes only those API-owned resources. The Discord bot and shared services continue running.

## Start It From Source

Install the workspace and start the existing local dependencies:

```bash
pnpm install
pnpm db:up
pnpm redis:up
pnpm db:migrate
```

Copy `.env.example` to `.env`, then start the API from a separate terminal:

```bash
pnpm dev:api
```

Verify it:

```bash
curl -i http://127.0.0.1:3000/api/v1/health
curl -i http://127.0.0.1:3000/api/v1/readiness
```

Build and run the compiled process with:

```bash
pnpm build:api
pnpm start:api
```

The API can run at the same time as `pnpm dev`; neither process starts or stops the other.

## Start It In Docker

The API-only Compose file builds the independent image and connects back to the already-running, host-published development Postgres and Redis services:

```bash
pnpm db:up
pnpm redis:up
docker compose -f docker-compose.api.yml up --build
```

The Compose project:

- binds the API to `127.0.0.1:${API_PORT:-3000}`
- mounts `./logs` at `/app/logs`
- uses `host.docker.internal` to reach the existing local dependencies
- does not create Postgres, Redis, storage volumes, or production networking

Set `API_DATABASE_URL` if the database needs a different container-reachable address. Stop only this API project with:

```bash
docker compose -f docker-compose.api.yml down
```

## Responses And Request IDs

Successful responses use a `data` object and a `meta.requestId` value. Error responses use a stable code, safe message, and the same request ID:

```json
{
	"error": {
		"code": "not_found",
		"message": "Route not found"
	},
	"meta": {
		"requestId": "9d2f0c18-6b0d-4fe7-bd0e-7fa4e1762a1c"
	}
}
```

Every response also includes `X-Request-Id`. A valid incoming `X-Request-Id` is preserved; otherwise the API generates one. Use that value to correlate a caller-visible failure with logs.

## Configuration

`.env.example` is the canonical configuration reference. The main API settings are:

| Variable                    | Default              | Meaning                                                        |
| --------------------------- | -------------------- | -------------------------------------------------------------- |
| `API_HOST`                  | `127.0.0.1`          | Listen address for source runs                                 |
| `API_PORT`                  | `3000`               | Listen port                                                    |
| `API_LOG_FILE_PATH`         | `logs/api.log`       | Structured JSON file read by Alloy                             |
| `API_LOG_LEVEL`             | `info`               | Minimum level written to the file                              |
| `API_CONSOLE_LOG_LEVEL`     | `info`               | Minimum level mirrored as JSON to stdout; `silent` disables it |
| `API_BODY_LIMIT_BYTES`      | `65536`              | Maximum request-body size                                      |
| `API_REQUEST_TIMEOUT_MS`    | `10000`              | Per-request deadline                                           |
| `API_READINESS_TIMEOUT_MS`  | `2000`               | Dependency readiness deadline                                  |
| `API_SHUTDOWN_TIMEOUT_MS`   | `10000`              | Graceful-shutdown deadline                                     |
| `API_DB_POOL_MAX`           | `4`                  | Maximum API-owned Postgres connections                         |
| `API_REDIS_NAMESPACE`       | `arbiter:api:v1`     | Prefix reserved for API-owned Redis keys                       |
| `API_REDIS_MAX_TTL_SECONDS` | `3600`               | Maximum lifetime for API-owned Redis values                    |
| `DATABASE_URL`, `REDIS_*`   | shared repo settings | Existing Postgres and Redis connection settings                |

Configuration is validated before the server listens. Invalid startup errors identify the field but do not echo secret values.

## Logging And Observability

The API is connected to Arbiter's existing file-first observability stack:

```text
API -> logs/api.log -> Alloy -> Loki -> Grafana
```

API logs are structured JSON with `app=arbiter`, `service=arbiter-api`, and the current environment. Completed requests include `requestId`, method, normalized path, status code, and duration. Dependency failures record only a dependency name and error class. Headers, cookies, authorization values, query values, request bodies, database or Redis URLs, passwords, tokens, and raw dependency errors are not logged.

Start the local stack before or after the API:

```bash
pnpm obs:up
pnpm dev:api
```

For the containerized API, `docker-compose.api.yml` writes the same `logs/api.log` file through the shared `./logs` directory. The observability Compose project mounts that directory read-only, and Alloy labels the stream as `service=arbiter-api` before sending it to Loki.

Open Grafana at `http://127.0.0.1:3001` by default. The provisioned **Arbiter Logs** dashboard includes API entries in request-ID and error views. In Explore, isolate API logs with:

```logql
{app="arbiter", service="arbiter-api"}
```

Trace one request with:

```logql
{app="arbiter", service="arbiter-api"} | json | requestId = "<request-id>"
```

Use `API_CONSOLE_LOG_LEVEL=silent` when the file/Loki path is the only desired destination. Changing console mirroring does not disable the file destination.

## Shutdown And Failure Behavior

`SIGINT` and `SIGTERM` stop accepting requests, wait for active HTTP work, close API-owned Postgres and Redis clients, and exit. A bounded timeout force-closes remaining HTTP connections. Startup, shutdown, request completion, dependency warnings, and fatal process errors all use the same structured logger.

Readiness returns only `ready` or `not_ready`. It intentionally does not reveal which dependency failed or include a raw error. Liveness remains available while a dependency is temporarily unavailable.

## Validation

Useful API-specific checks are:

```bash
pnpm --filter @arbiter/api test
pnpm build:api
pnpm test:integration
pnpm api:container:smoke
pnpm docs:build
```

The integration suite starts real Postgres and Redis containers and proves that stopping the API does not close separately owned bot-side clients. The container smoke test verifies the production dependency set, liveness, file logging, and graceful shutdown without deploying anything.

## Current Boundaries

This foundation deliberately does not include:

- a user-directory endpoint or any permission beyond the `users:read` contract name
- OAuth, sessions, browser credentials, or portal code
- a second database, Redis service, or schema migration
- production proxy, TLS, network exposure, resource sizing, or deployment wiring
- Discord bot process ownership or bot-token access

Those changes require their own ticket scope and deployment or security approval where applicable.
