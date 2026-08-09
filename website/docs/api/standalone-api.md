---
title: Standalone API
sidebar_position: 4
---

# Standalone API

The Arbiter API is an HTTP process that runs independently from the Discord bot. It owns browser authentication for the separately deployed portal while sharing Arbiter's canonical Postgres and Redis authorities without coupling its lifecycle to Discord.

## Current Capability

The API exposes infrastructure and browser-authentication endpoints:

| Method      | Route                           | Purpose                                                                                                                  |
| ----------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GET, HEAD` | `/api/v1/health`                | Process liveness. Returns `200` without checking external dependencies.                                                  |
| `GET, HEAD` | `/api/v1/readiness`             | Checks the API-owned Postgres pool and Redis client.                                                                     |
| `POST`      | `/api/v1/auth/discord/start`    | Creates browser-bound OAuth state and returns the Discord authorization URL.                                             |
| `GET`       | `/api/v1/auth/discord/callback` | Consumes the one-use state, resolves Discord identity, creates a staff session, and redirects to an approved portal URL. |
| `GET`       | `/api/v1/auth/session`          | Returns session expiry and a CSRF token for an authorized current staff session.                                         |
| `GET`       | `/api/v1/auth/me`               | Returns the safe canonical identity and current `STAFF` or `EXEC` role.                                                  |
| `POST`      | `/api/v1/auth/logout`           | Validates CSRF, revokes the Redis session, and clears the browser cookie.                                                |

The API package also contains transport-independent integration and credential lifecycle services backed by Arbiter's canonical database. They can create, list, edit, and archive shared integrations; mint, list, authenticate, and revoke credentials; and record last use at a bounded interval. No HTTP management or directory route invokes those services yet, so defining the lifecycle does not expose user data.

The package also contains a transport-independent user-directory read service. It reads canonical users, every durable division membership, raw merit totals, and the shared merit-rank policy from the existing Arbiter database. Queries support up to 100 Discord IDs, multiple division codes, exact/minimum/maximum ranks, a bounded page size, and opaque keyset cursors. Filter categories intersect, while multiple division codes match any requested division. Unknown division codes and malformed cursors fail validation. The repository performs a bounded page read inside one repeatable-read snapshot and never loops over users or contacts Discord. No HTTP directory route exists yet.

The only credential permission is `users:read`. A minted secret is returned once, while Postgres stores only a non-secret lookup prefix and an HMAC-SHA-256 verifier keyed by `API_CREDENTIAL_PEPPER`. Expired, revoked, unknown, malformed, or archived-integration credentials authenticate as the same invalid-credential outcome. Integration archive and credential revocation retain the first authoritative actor and timestamp under retries or concurrency.

The API reuses Arbiter's canonical Postgres schema and existing Redis service. It owns its own bounded database pool and Redis client, and stopping it closes only those API-owned resources. The Discord bot and shared services continue running.

Discord OAuth proves only the Discord user ID and requests only the `identify` scope. The callback discards the OAuth access token immediately after identity resolution and never writes OAuth tokens to Postgres, Redis, logs, responses, or the portal. Every protected request re-reads the canonical User and current division memberships from Postgres. At least one `STAFF` division membership is required; `EXEC` is derived only from the `EXEC` division code. Removing or changing membership affects the next request.

## Start It From Source

Install the workspace and start the existing local dependencies:

```bash
pnpm install
pnpm db:up
pnpm redis:up
pnpm db:migrate
```

Copy `.env.example` to `.env`, generate a private API credential pepper of at least 32 characters, and assign it to `API_CREDENTIAL_PEPPER`. Create a non-production Discord application, register the exact local `API_DISCORD_CALLBACK_URL`, and set its client ID and secret in the API-only variables. For local development, one option for the credential pepper is:

```bash
openssl rand -base64 48
```

Then start the API from a separate terminal:

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
- passes only explicit API, Postgres, and Redis settings instead of injecting bot-only credentials from `.env`
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
		"message": "Route not found",
		"requestId": "9d2f0c18-6b0d-4fe7-bd0e-7fa4e1762a1c"
	}
}
```

Every response also includes `X-Request-Id`. A valid incoming `X-Request-Id` is preserved; otherwise the API generates one. Use that value to correlate a caller-visible failure with logs.

## Configuration

`.env.example` is the canonical configuration reference. The main API settings are:

| Variable                           | Default              | Meaning                                                                      |
| ---------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| `API_HOST`                         | `127.0.0.1`          | Listen address for source runs                                               |
| `API_PORT`                         | `3000`               | Listen port                                                                  |
| `API_LOG_FILE_PATH`                | `logs/api.log`       | Structured JSON file read by Alloy                                           |
| `API_LOG_LEVEL`                    | `info`               | Minimum level written to the file                                            |
| `API_CONSOLE_LOG_LEVEL`            | `info`               | Minimum level mirrored as JSON to stdout; `silent` disables it               |
| `API_BODY_LIMIT_BYTES`             | `65536`              | Maximum request-body size                                                    |
| `API_REQUEST_TIMEOUT_MS`           | `10000`              | Per-request deadline                                                         |
| `API_READINESS_TIMEOUT_MS`         | `2000`               | Dependency readiness deadline                                                |
| `API_DB_CONNECT_TIMEOUT_MS`        | `5000`               | Postgres connection-establishment timeout                                    |
| `API_REDIS_CONNECT_TIMEOUT_MS`     | `5000`               | Redis connection-establishment timeout                                       |
| `API_SHUTDOWN_TIMEOUT_MS`          | `10000`              | Graceful-shutdown deadline                                                   |
| `API_DB_POOL_MAX`                  | `4`                  | Maximum API-owned Postgres connections                                       |
| `API_CREDENTIAL_PEPPER`            | required             | API-only HMAC key; at least 32 characters and never logged                   |
| `API_DISCORD_CLIENT_ID`            | required             | Discord OAuth application ID; the API does not use the bot application token |
| `API_DISCORD_CLIENT_SECRET`        | required             | API-only OAuth secret; never sent to the portal or logs                      |
| `API_DISCORD_CALLBACK_URL`         | required             | Exact registered API callback; HTTPS except local development/test           |
| `API_ALLOWED_ORIGINS`              | required             | Comma-separated exact credentialed browser origins; no wildcard              |
| `API_AUTH_REDIRECT_URLS`           | required             | Comma-separated exact post-login URLs whose origins must also be allowed     |
| `API_AUTH_STATE_TTL_SECONDS`       | `600`                | Maximum lifetime for single-use browser-bound OAuth state                    |
| `API_SESSION_IDLE_TTL_SECONDS`     | `1800`               | Sliding idle session limit and browser-cookie lifetime                       |
| `API_SESSION_ABSOLUTE_TTL_SECONDS` | `28800`              | Non-sliding absolute session limit                                           |
| `API_REDIS_NAMESPACE`              | `arbiter:api:v1`     | Prefix reserved for API-owned Redis keys                                     |
| `API_REDIS_MAX_TTL_SECONDS`        | `3600`               | Maximum lifetime for API-owned Redis values                                  |
| `DATABASE_URL`, `REDIS_*`          | shared repo settings | Existing Postgres and Redis connection settings                              |

Configuration is validated before the server listens. Invalid startup errors identify the field but do not echo secret values.

Production origins, callbacks, and redirects must use HTTPS. Local HTTP is accepted only for explicit `localhost` or `127.0.0.1` entries outside production. Redirects are compared as complete URLs, CORS reflects only an exact configured origin with credentials, and wildcard origins are rejected at startup and request time.

Relative `API_LOG_FILE_PATH` values resolve from the repository/application root, not the `apps/api` package working directory. The default therefore reaches the same root `logs/api.log` file whether the API starts through a root script or a filtered pnpm package command. Absolute container paths are preserved.

## Logging And Observability

The API is connected to Arbiter's existing file-first observability stack:

```text
API -> logs/api.log -> Alloy -> Loki -> Grafana
```

API logs are structured JSON with `app=arbiter`, `service=arbiter-api`, and the current environment. Completed requests include `requestId`, method, normalized path, status code, and duration. Dependency failures record only a dependency name and error class. Headers, cookies, authorization values, query values, request bodies, database or Redis URLs, credential peppers, Discord secrets, OAuth codes or tokens, session and CSRF identifiers, verifiers, passwords, and raw dependency errors are not logged.

## Browser Session And CSRF Policy

OAuth state and sessions are opaque 256-bit values. Redis keys contain SHA-256 digests rather than the browser values, use the existing `arbiter:api:v1:` namespace, and always have bounded TTLs. OAuth state is bound to a short-lived HttpOnly cookie scoped to the Discord OAuth routes and consumed atomically before validation, so overlapping login starts share one browser binding while expired, mismatched, or replayed callbacks still fail.

The API-host session cookie is HttpOnly, `Secure` in production, `SameSite=Lax`, host-only, and scoped to `/api/v1`. Protected reads refresh its idle lifetime while Redis enforces both the sliding idle limit and a non-sliding absolute limit. Successful authentication replaces and revokes any previous session; logout requires the session's CSRF token in `X-CSRF-Token`, revokes the Redis record, and clears the cookie.

`SameSite=Lax` is intentional for production custom domains under one parent domain: the portal and API may be different origins while remaining the same site. A portal hosted on an unrelated site may have its credentialed requests blocked by browser third-party-cookie policy even when CORS is configured correctly. Production deployment should therefore use same-site custom hostnames; changing to `SameSite=None` is a separate security and deployment decision.

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

`SIGINT` and `SIGTERM` stop accepting requests, wait for active HTTP work, close API-owned Postgres and Redis clients, and exit. A bounded timeout force-closes remaining HTTP connections. If dependency cleanup still cannot complete by that deadline, the API exits nonzero so hung sockets cannot keep the container alive indefinitely. Startup, shutdown, request completion, dependency warnings, and fatal process errors all use the same structured logger.

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

The integration suite starts real Postgres and Redis containers and proves OAuth replay/TTL behavior, idle and absolute session expiry, current STAFF/EXEC authorization, canonical directory hydration/filtering/pagination, indexed Discord-ID lookup planning, and that stopping the API does not close separately owned bot-side clients. The HTTP harness exercises an external configured origin across start, session, CSRF logout, and CORS. The container smoke test verifies the production dependency set, liveness, file logging, and graceful shutdown without deploying anything. A real Discord callback still requires a non-production Discord application and registered callback; never use production credentials for local validation.

## Current Boundaries

This foundation deliberately does not include:

- a user-directory or credential-management HTTP endpoint, or any permission beyond `users:read` (the directory read service is internal until its route ticket)
- portal pages or portal-owned secrets, database access, or Redis access
- a second database, Redis service, schema authority, or synchronization path
- production proxy, TLS, network exposure, resource sizing, or deployment wiring
- Discord bot process ownership or bot-token access

Those changes require their own ticket scope and deployment or security approval where applicable.
