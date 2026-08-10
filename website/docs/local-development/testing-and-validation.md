---
title: Testing And Validation
sidebar_position: 3
---

# Testing And Validation

Choose checks by the risk that changed, then finish with the ticket-required or repository-wide chain. The [root scripts](https://github.com/EvenLegion/Arbiter/blob/dev/package.json), package scripts, tests, and [CI workflow](https://github.com/EvenLegion/Arbiter/blob/dev/.github/workflows/ci.yml) are the executable authority.

## Risk-Based Matrix

| Change risk                                                               | Narrowest useful command                                                  | What it proves                                                             | Important limit                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Pure bot rule, presenter, or service branch                               | `pnpm test:unit`                                                          | Focused root unit behavior                                                 | Does not exercise package suites or real storage                   |
| Shared domain, API contract, API, or portal package                       | `pnpm test:packages`                                                      | All package-owned test suites                                              | Does not exercise the root bot suite                               |
| One package while iterating                                               | `pnpm --filter @arbiter/api test` or `pnpm --filter @arbiter/portal test` | That package's tests plus its scripted prerequisites                       | Broader consumers still need proportional validation               |
| Prisma, Redis, transaction, or cross-runtime storage behavior             | `pnpm test:integration`                                                   | Real ephemeral Postgres and Redis behavior                                 | Docker/Podman absence produces a skip, not coverage                |
| API production image and runtime envelope                                 | `pnpm api:container:smoke`                                                | Image contents, liveness, protected routes, file logging, graceful stop    | Does not prove Postgres/Redis readiness or real OAuth              |
| Portal compile and deployable artifact                                    | `VITE_API_BASE_URL=https://api.example.invalid pnpm build:portal`         | Typecheck, Vite build, and artifact safety checks                          | Does not prove browser interaction or real API compatibility       |
| Portal browser behavior without OAuth infrastructure                      | Browser harness plus portal dev server                                    | Navigation, forms, focus, responsive UI, and safe fixture session behavior | Harness is not an authentication or API integration test           |
| Documentation                                                             | `pnpm docs:build`                                                         | MDX, links resolved by Docusaurus, and production docs bundle              | Still inspect changed pages at desktop and mobile widths           |
| Discord registration, autocomplete, components, permissions, or listeners | Manual check in a configured non-production guild                         | Real Discord transport and client behavior                                 | Never claim this check without the required client and credentials |

For root bot behavior outside `tests/unit`, use `pnpm test:bot`. To run the root bot and all package suites together, use `pnpm test`.

## Repository And CI Chain

```bash
pnpm check
```

`pnpm check` is the repository-owned validation chain used by CI. It runs workflow lint, typecheck, application lint, unit tests, package tests, integration tests, and the docs build.

Read the integration output. If it says `Skipping integration tests because no container runtime was detected.`, record integration coverage as skipped even though the command exits zero.

Use `pnpm workflow:lint` directly while changing GitHub Actions. Use `pnpm typecheck`, `pnpm lint`, or an affected package command for a fast loop, but do not present a narrow loop as the complete repository chain.

## Portal Browser Harness

Run these in separate terminals:

```bash
pnpm --filter @arbiter/portal browser:harness
VITE_API_BASE_URL=http://127.0.0.1:3000 pnpm --filter @arbiter/portal dev
```

Open `http://127.0.0.1:4173`. Check the ticket-relevant task at desktop, narrow, and mobile widths. The [Staff Portal](../api/staff-portal.md) page lists the security boundaries and the full manual UI surface.

## Report What Actually Ran

A useful handoff names:

- exact commands and whether each passed, failed, or skipped
- the behavior or risk each check covered
- any required environment that was unavailable
- manual Discord or browser checks only when actually performed

Container health, a successful build, and a clean unit suite are different kinds of evidence. Keep them separate.
