---
title: Runtime Dependency Audits
sidebar_position: 13
---

# Runtime Dependency Audits

Use this runbook when a production dependency advisory requires artifact-level
reachability evidence. Dependency installation, image publication, production
rollout, and accepted security exceptions require their own authority; this
page does not grant it.

## Artifact Set

One source revision can produce four different dependency surfaces:

- the `arbiter-migrate` image target
- the final `arbiter-bot` runtime image
- the final `arbiter-api` runtime image
- the static portal artifact in `apps/portal/dist`

The root lockfile is necessary evidence but not sufficient evidence for any
shipped artifact. Arbiter requires Node.js `>=22.12.0 <23` and pins pnpm
`10.11.0`; both Dockerfiles use the repository's Node 22 and pnpm contract.

## Verification Path

1. Run `pnpm audit --prod` against the committed workspace lockfile and record
   the full advisory paths.
2. Build the migration, bot, and API final targets from the same committed
   manifest and lockfile.
3. Build the portal with the reviewed API origin. `pnpm build:portal` also checks
   that the artifact contains no source maps or server-only configuration markers.
4. Record an immutable digest or image ID for every container target and the
   portal artifact identifier. Verify the Node version inside each container
   target is within the repository range.
5. Inspect the installed package graph inside each final image, not only an
   intermediate build stage or pnpm's virtual store.
6. Trace whether compiled runtime or browser code can actually resolve and use
   the vulnerable package on Discord, Postgres, Prisma, Redis, scheduled-task,
   API, or portal paths.
7. Rebuild after remediation and prove the patched version on every reachable
   shipped path before rollout.

Packages stored under pnpm's virtual store are not automatically application-
reachable. Prisma tooling and optional peer packages can remain stored even when
the final runtime cannot resolve them. Record both the storage path and the
runtime-resolution/import evidence instead of treating either alone as proof.

## Exception Record

An accepted exception must identify the advisory, complete package path,
affected artifact, runtime-reachability evidence, owner, expiration date,
removal trigger, and the exact verification that must be repeated. Severity-only
suppression or a workspace-only audit is not sufficient.

After the audit, return to [Production deployment](./production-deployment.md)
and deploy only the reviewed artifact identifiers under explicit operational
approval.
