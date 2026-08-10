---
title: Staff Portal
sidebar_position: 5
---

# Staff Portal

`apps/portal` is Arbiter's separately deployable staff frontend. It produces static assets suitable for Vercel and communicates only with the standalone API over credentialed HTTPS. It has no server backend, Prisma or Redis client, OAuth secret, credential pepper, database URL, or authoritative authorization state.

## What Staff Can Do

Authenticated staff can view the shared integration registry, register integrations, and open an integration's direct credential-management URL. Credential views show only safe metadata: label, non-secret prefix, creator, `users:read` scope, derived status, creation and expiry times, revocation audit timestamps, and bounded last-use time. Existing secrets and verifiers are never returned.

Any current staff member may mint a credential for any active integration. The API accepts only `users:read`, defaults expiry to one year, rejects expiry beyond one year, and generates the credential secret inside the API process. The portal displays that new secret once in ephemeral React view state with an explicit copy-and-store warning. Refreshing, navigating, signing out, manually refreshing credential metadata, or dismissing the panel removes it. The portal never persists it automatically or writes it to URLs, browser history, local storage, session storage, analytics, or logs. Choosing **Copy secret** is an explicit user action that writes the value to `navigator.clipboard` so it can be moved into the destination secret manager.

The API remains authoritative on every request:

- any current staff member may register an integration
- any current staff member may list safe credential metadata and mint for an active integration
- the creator or a current `EXEC` member may edit active integration metadata
- a credential's creator may revoke it, while a current `EXEC` member may revoke any credential
- only a current `EXEC` member may archive an integration
- archive is idempotent and immediately invalidates associated credentials

The portal uses those rules only to present likely controls. Client state never grants permission. The API re-reads the session's current Postgres-backed staff role and enforces the policy again before each operation.

Names are unique after trimming leading and trailing whitespace, collapsing internal whitespace to a single space, and lowercasing. Updates and archive requests include the record's last observed `updatedAt`; a concurrent change returns the typed `stale` outcome instead of silently overwriting newer intent.

## Public Configuration

The only required portal environment variable is:

| Variable            | Purpose                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | Public API origin only, such as `https://api.example.org`; no path, query, credentials, or secret data |

HTTPS is required except for explicit `localhost` and `127.0.0.1` development origins. Production builds reject local HTTP configuration at runtime. Do not create `VITE_` variables for API secrets: Vite variables are public browser bundle input.

For the intended cookie policy, production should place portal and API custom hostnames under the same parent site. The API session remains host-only, HttpOnly, and `SameSite=Lax`; the portal sends `credentials: include` but cannot read the cookie. Every mutation also sends the API-issued CSRF token in `X-CSRF-Token`. CORS reflects only an exact configured origin.

## Local Development And Build

Copy the public example and start the API and portal separately:

```bash
cp apps/portal/.env.example apps/portal/.env.local
pnpm dev:api
pnpm --filter @arbiter/portal dev
```

Build the Vercel artifact without deploying it:

```bash
VITE_API_BASE_URL=https://api.example.invalid pnpm build:portal
```

The output is `apps/portal/dist`. `apps/portal/vercel.json` declares the Vite build, static output directory, and SPA navigation rewrite. Configure the Vercel project root as `apps/portal`; do not add portal-side secrets or server functions.

## Safe Browser Harness

When a non-production Discord OAuth application is unavailable, the repository includes an in-memory browser harness. It exists only under the portal's `scripts` directory, has fixed fake identity data, performs no database or Redis access, and is never imported into the production bundle.

Run these in separate terminals:

```bash
pnpm --filter @arbiter/portal browser:harness
VITE_API_BASE_URL=http://127.0.0.1:3000 pnpm --filter @arbiter/portal dev
```

Open `http://127.0.0.1:4173` and choose **Continue with Discord**. The harness redirects through its local fixture sign-in route, sets an HttpOnly fixture session, and returns to the portal; protected harness routes still require that session and mutations also require its CSRF token. Validate direct navigation and refresh, create and edit forms, credential metadata, one-time secret dismissal and disappearance after refresh/navigation, revoke confirmation, overlapping mint-before-revoke rotation, archive confirmation copy, archived filtering, keyboard focus and Escape dismissal, and desktop/narrow/mobile layouts. API HTTP integration tests separately prove real session, CSRF, CORS, actor-policy, expiry, archive, stale, and dependency outcomes; the harness is UI validation, not an auth substitute.

## Failure Behavior

The portal maps typed validation, conflict, forbidden, stale, archived, session, and dependency outcomes to safe task-oriented copy. Request IDs are shown when available. Raw database, Redis, OAuth, stack, or response details are never rendered. A stale response refreshes the registry before another edit is allowed, and an expired session returns the user to sign-in.

If a timeout, network interruption, or unavailable service makes a registry mutation outcome uncertain, the portal retries only operations that safely converge, then refreshes the registry. It never retries mint automatically because a committed mint whose response was lost has an unrecoverable secret. Instead it refreshes credential metadata and tells the operator to inspect recently created credentials by their unique non-secret prefix and creation time, then revoke any unexpected credential by its credential ID before minting another. Revocation preserves the API's first authoritative actor and timestamp; after an interrupted revoke, the portal retries the idempotent revoke once so any in-flight database update settles before it reports the preserved result.
