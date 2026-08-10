---
title: API And Portal Deployment Readiness
sidebar_position: 3
---

# API And Portal Deployment Readiness

This runbook prepares the standalone Arbiter API and staff portal for an approved deployment. It does not authorize DNS, certificates, firewall changes, secret creation, migration execution, service restart, Vercel project creation, or production deployment.

## Deployment Topology

Use two exact HTTPS origins under one parent domain when practical, for example `https://portal.arbiter.example` and `https://api.arbiter.example`.

- Vercel serves the static `apps/portal` artifact. The portal has no server function, database client, Redis client, OAuth secret, credential pepper, or bot token. It communicates only with the API origin in `VITE_API_BASE_URL`.
- The Arbiter host runs `arbiter-api` as a container separate from `arbiter-bot`. Production Compose binds the API to `127.0.0.1` by default. An approved HTTPS reverse proxy is the only public ingress.
- The API and bot use the same external Postgres database and canonical Prisma migration history. There is no portal database, API database, replica, synchronization process, or second schema authority.
- The API reuses the production Redis service under the bounded `arbiter:api:v1:` namespace. Postgres remains durable truth; Redis contains only expiring OAuth state, sessions, CSRF state, and rate limits.

The reverse proxy must preserve the exact public `Host`, set one `X-Forwarded-Host` value to that same host, and set one `X-Forwarded-Proto: https` value. The API rejects public routes when those values do not match `API_PUBLIC_URL`. Health and readiness remain available to local container checks without forged proxy headers. Network policy must still prevent direct public access because headers alone do not prove a trusted peer.

## Required Configuration

API-only secret configuration:

- `API_CREDENTIAL_PEPPER`: at least 32 random characters; changing it invalidates every issued API credential.
- `API_DISCORD_CLIENT_SECRET`: the Discord OAuth application secret.
- `DATABASE_URL` and optional `REDIS_PASSWORD`: existing Arbiter service credentials.

API public configuration:

- `API_PUBLIC_URL`: exact public HTTPS API origin with no path.
- `API_DISCORD_CALLBACK_URL`: the same origin plus `/api/v1/auth/discord/callback`.
- `API_ALLOWED_ORIGINS`: comma-separated exact portal origins; no wildcard.
- `API_AUTH_REDIRECT_URLS`: exact approved portal callback URLs whose origins also appear in `API_ALLOWED_ORIGINS`.
- `API_TRUST_PROXY=true`: required in production.
- `API_REDIS_NAMESPACE`: keep the dedicated default unless a reviewed namespace migration is planned.
- `API_DB_POOL_MAX`: default `4`, maximum `10`.

Vercel receives only `VITE_API_BASE_URL`, set to the exact public HTTPS API origin. Do not configure `DATABASE_URL`, Redis values, Discord secrets, the credential pepper, API cookies, or bot configuration in Vercel. The production portal build fails without a valid HTTPS API origin, generates an exact-origin Content Security Policy, produces no source maps, and scans the artifact for server-only configuration markers.

## Shared Contract Compatibility

`packages/api-contracts` is the compatibility authority. Every API response includes `X-Arbiter-Api-Contract-Version`; CORS exposes it to the portal. The portal fails closed before reading response data when the header is missing or does not match its compiled contract version.

Deploy API and portal revisions built from compatible contract history. A portal rollback is safe only to a revision with the same contract version as the running API. When a future incompatible contract is necessary, introduce an explicitly versioned coexistence window before changing the header value; do not make independent deployments race a breaking change.

## Database And Redis Capacity

The API opens its own bounded Postgres pool and sets `application_name=arbiter-api`. Before deployment, subtract the bot's measured peak connections and an operator/migration reserve from the database's connection limit. Set `API_DB_POOL_MAX` no higher than the remaining capacity; start at `4` unless current measurements justify less or more. A higher pool is not a substitute for query or deadline fixes.

Redis keys remain under the API namespace and have bounded TTLs. Do not share the namespace with BullMQ or bot tracking keys, change it during an incident without accepting session invalidation, or use `FLUSHDB`/`FLUSHALL` as API rollback.

## Approved Deployment Order

After separate operational approval:

1. Record immutable bot, API, and portal artifact identifiers; verify a current Postgres backup and the existing Redis persistence path.
2. Configure the exact domains, certificate, private API bind, reverse-proxy headers, Discord callback, API-only secrets, and Vercel public value.
3. Build the bot migration target and API image from the same reviewed revision. Build the portal with its production API origin and retain its artifact evidence.
4. Run the canonical `arbiter-migrate` step once against the existing database. Never run a portal or API-specific migration command.
5. Start or update `arbiter-api`; verify `/api/v1/health`, then `/api/v1/readiness`, proxy-host rejection, security headers, contract header, structured logs, and bounded dependency failures.
6. Run non-production or explicitly approved production API checks before making the portal generally available.
7. Deploy the compatible portal artifact to Vercel. Verify its response headers, generated Content Security Policy, exact API requests, session recovery, and direct navigation.
8. Verify the bot independently. API startup or rollback must not restart the bot unless a separately approved operational reason exists.

## Rollback And Safe Disablement

- Portal-only failure: roll Vercel back to a compatible artifact or disable portal access. The API and bot can remain running.
- API code failure before migration: restore the prior API image. The bot and portal are separate processes.
- API failure after the additive credential migration: restore a compatible API image and leave the unused additive tables in place. Dropping tables, credentials, or enums is destructive and needs separate approval.
- Authentication incident: block the API at the proxy, stop only `arbiter-api`, or rotate the Discord client secret. Existing API sessions remain in Redis until expiry unless the API namespace is deliberately changed or sessions are explicitly revoked.
- Credential incident: revoke affected credentials through the authoritative API workflow. Pepper rotation is a last-resort global invalidation requiring a remint and cutover plan.

A disabled API does not stop the bot and does not alter durable Arbiter data. A disabled portal does not revoke sessions or credentials by itself.

## Health, Logging, Backups, And Incidents

`/api/v1/health` proves only that the HTTP process is accepting requests. `/api/v1/readiness` checks the existing Postgres and both Redis clients under a bounded deadline. Remove an unhealthy API from proxy traffic even when health still returns 200.

The API writes redacted structured JSON to its persistent log mount. Alloy reads the separate API log path and labels it `service=arbiter-api`. Logs may include request ID, route, status, duration, integration ID, and credential prefix; they must not include authorization headers, cookies, CSRF/session values, OAuth codes/tokens, credential secrets/verifiers, URLs with credentials, raw payloads, or environment values. Portal builds have no analytics or telemetry integration; any future telemetry requires a new privacy and secret-handling review.

Continue the existing external Postgres backup and restore procedure. The portal has no durable backup surface. Redis persistence supports operations but is not durable workflow authority; expired or lost API sessions and rate-limit counters may be recreated, while Postgres credentials and integrations must never be reconstructed from Redis.

## V1 Integrator Guidance

V1 exposes `users:read` only. Directory results are current Postgres reads and never query Discord. They include every current division membership, raw total merits, and the canonical rank level/symbol; rank fields are `null` when no rank applies. Direct missing-user reads return 404, while batch/filter no-match results are empty. Query batches and pages are limited to 100, cursors are opaque and bounded, request bodies and execution time are limited, and Redis rate-limit failure fails closed. Treat 401 credentials as inactive, expired, revoked, archived, or invalid without trying to infer which state from the response.

## Non-Production Validation Checklist

Complete this checklist with synthetic users, integrations, and credentials before requesting production deployment:

- [ ] Build the production API image and portal artifact; run the portal artifact scan and confirm no source maps or server-only configuration markers.
- [ ] Confirm the API image contains no portal artifact/runtime and the bot image contains no API runtime dependency.
- [ ] Validate unauthenticated, non-staff, staff, creator, non-creator, and EXEC browser-session outcomes.
- [ ] Validate active, expired, revoked, and integration-archived credentials; valid and missing scopes; direct, batch, division, rank, list, pagination, invalid cursor, body, deadline, and rate limits.
- [ ] Validate OAuth missing/expired/reused/mismatched state, idle and absolute session expiry, logout, CSRF failure, unlisted origin, invalid redirect, and exact cookie attributes.
- [ ] Validate Postgres, Redis session, and Redis rate-limit outages fail closed with sanitized responses and logs.
- [ ] Validate direct API bypass and incorrect host/proxy headers are rejected while local health/readiness checks work.
- [ ] Validate API and portal security headers plus the exact-origin portal Content Security Policy.
- [ ] Validate a mismatched or absent contract-version header prevents portal use.
- [ ] Validate one-time credential display disappears on refresh/navigation and is absent from URL, history, browser storage, logs, screenshots, fixtures, and built artifacts.
- [ ] Validate overlapping mint-before-revoke rotation, creator revoke, EXEC revoke-any, non-creator denial, repeated revoke, expiry, and archive behavior.
- [ ] Validate desktop, narrow/mobile, keyboard, refresh, callback, and direct-navigation portal behavior.
- [ ] Run full workspace, integration, documentation, Compose-render, API container smoke, and portal production-build checks.
- [ ] Record every real deployment input still needed and obtain separate operational approval before changing live systems.

The main compromise is intentional: the portal and API can deploy independently only while their shared contract stays compatible, and the API trusts proxy headers only inside a separately enforced private network boundary. These constraints avoid another database, a portal backend, and live Discord coupling.
