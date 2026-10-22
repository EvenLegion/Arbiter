# STE-298 Postman quick start

This directory contains a Postman collection for the directory endpoints added by STE-298 and a local environment with no credentials embedded.

## Import and configure Postman

1. Import `Arbiter-STE-298.postman_collection.json` and `Arbiter-Local.postman_environment.json`.
2. Select **Arbiter API — Local** in Postman.
3. Set `apiKey` to a synthetic local credential with the `users:read` scope.
4. Set `discordUserId` to a user that exists in the local Arbiter database.
5. Keep `baseUrl` as `http://127.0.0.1:3000` unless `API_PORT` was changed.
6. Run **Infrastructure / Health** and **Infrastructure / Readiness** first, then the authenticated directory requests.

The collection saves `nextCursor` after **Query first page** when another page exists. Reduce that request's `limit` if the local database has too few users to produce a cursor.

## Run the API from source

Requirements: Node `>=22.12.0 <23`, pnpm `10.11.0`, Docker, and Docker Compose.

From the repository root:

```bash
corepack enable
corepack prepare pnpm@10.11.0 --activate
pnpm install
test -f .env || cp .env.example .env
pnpm db:up
pnpm redis:up
pnpm db:migrate
```

If `.env` already exists, do not overwrite it. Configure at least:

```dotenv
DATABASE_URL=postgresql://arbiter:arbiter@localhost:5432/arbiter
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=arbiter
REDIS_DB=0
API_HOST=127.0.0.1
API_PORT=3000
API_CREDENTIAL_PEPPER=<at-least-32-random-characters>
API_DISCORD_CLIENT_ID=<non-production-Discord-application-id>
API_DISCORD_CLIENT_SECRET=<non-production-Discord-application-secret>
API_DISCORD_CALLBACK_URL=http://127.0.0.1:3000/api/v1/auth/discord/callback
API_ALLOWED_ORIGINS=http://127.0.0.1:4173,http://localhost:4173
API_AUTH_REDIRECT_URLS=http://127.0.0.1:4173/auth/callback,http://localhost:4173/auth/callback
```

Generate the local credential pepper with `openssl rand -base64 48`. The same pepper must remain configured for credentials minted with it.

Start the API in a separate terminal:

```bash
pnpm dev:api
```

Health should return `200`; readiness should return `200` with `data.status = "ready"`.

To exercise the rate limit without sending 61 requests, temporarily set `API_DIRECTORY_RATE_LIMIT_REQUESTS=3`, restart the API, and send the same authenticated directory request four times inside one minute. The fourth response should be `429` with `Retry-After` and `X-RateLimit-*` headers.

## Run the API in Docker

After configuring `.env` and starting the host Postgres and Redis services:

```bash
pnpm db:up
pnpm redis:up
docker compose -f docker-compose.api.yml up --build
```

Stop only the API Compose project with:

```bash
docker compose -f docker-compose.api.yml down
```

## Credential and data prerequisite

The directory routes require a credential minted with exactly the `users:read` scope. This directory-focused collection does not perform staff OAuth or credential management. Use the authenticated local staff portal or the transport-independent credential service to create a **synthetic local-development** credential, and make sure `API_CREDENTIAL_PEPPER` matches the pepper used when it was minted.

The direct-user request also needs canonical user data in the selected local database. An empty freshly migrated database can pass health/readiness and return an empty query page, but it cannot return a direct user or support credential authentication until local fixture data and a synthetic credential exist.

Do not use production credentials or production data for this workflow. Never insert a verifier manually or reuse a live credential.
