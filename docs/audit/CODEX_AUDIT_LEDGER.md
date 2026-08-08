# Codex Audit Ledger

This file records bounded audit coverage and ticket disposition. It is not an
application-behavior specification.

## Current snapshot

- Date: 2026-08-08
- Audited commit: `40cada1963ed8a9c99d42c06ec462fd364352006`
- Branch: `codex/arbiter-agent-setup`
- Base: `origin/dev`
- Working tree: clean before this ledger was initialized; the branch adds agent
  workflow documentation and does not change application behavior.

## Subsystem coverage

| Subsystem                                              | Risk   | Status                     | Last pass                | Next trigger                            |
| ------------------------------------------------------ | ------ | -------------------------- | ------------------------ | --------------------------------------- |
| Dependencies and runtime graph                         | High   | Reviewed                   | 2026-08-08 modernization | After STE-259 or dependency changes     |
| BullMQ and Redis operations                            | High   | Reviewed                   | 2026-08-08 modernization | After STE-260 or scheduler changes      |
| Production observability deployment                    | High   | Reviewed                   | 2026-08-08 modernization | After STE-261 or topology changes       |
| Agent, CI, release, and repository setup               | Medium | Reviewed for modernization | 2026-08-08 modernization | After workflow/security-setting changes |
| Discord authorization and custom IDs                   | High   | Not reviewed               | —                        | Next bounded application pass           |
| Event attendance/review state transitions              | High   | Not reviewed               | —                        | After authorization pass                |
| Membership, identity, merits, and Discord side effects | High   | Not reviewed               | —                        | After event-state pass                  |
| Prisma schema, repositories, errors, and logging       | High   | Partial map only           | 2026-08-08 modernization | Targeted application pass               |

## Confirmed findings

| Issue                                                                                                                      | Status  | Severity | Subsystem                | Pass                     |
| -------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | ------------------------ | ------------------------ |
| [STE-259](https://linear.app/stellarnotions/issue/STE-259/remediate-reachable-production-dependency-vulnerabilities)       | Backlog | High     | Dependencies/runtime     | 2026-08-08 modernization |
| [STE-260](https://linear.app/stellarnotions/issue/STE-260/bound-bullmq-retention-and-right-size-redis-production-defaults) | Backlog | High     | BullMQ/Redis             | 2026-08-08 modernization |
| [STE-261](https://linear.app/stellarnotions/issue/STE-261/harden-production-observability-exposure-and-credentials)        | Backlog | Medium   | Observability deployment | 2026-08-08 modernization |

## Unresolved questions and cross-slice hypotheses

- GitHub secret scanning and push protection are disabled; Actions defaults to
  write and may approve pull requests. Review repository security policy and
  bypass actors before proposing settings changes.
- CI is valid but lacks workflow lint, stale-run cancellation, timeouts, and an
  explicit runtime engine contract. Adopt only the Whisk Taker controls useful
  for this smaller bot rather than copying its application-specific classifier
  or browser suite.
- `coverage/` contains 243 tracked generated files (about 3.9 MB) and is not
  ignored. Remove it from version control after confirming no documentation
  depends on the artifacts.
- The `org-accept` feature writes through Prisma directly. A targeted trace is
  needed before deciding whether this violates a correctness boundary or is a
  documented transaction owner.
- The release-plan policy is now idempotent in agent instructions, but CI does
  not mechanically verify one matching branch-owned plan.

## Next recommended bounded pass

Trace one privileged event-management flow end to end, starting with event
start/end and component custom IDs: Discord ingress -> actor/guild preflight ->
service -> Postgres/Redis -> Discord side effects -> response/error/logging ->
unit and integration coverage.

## Pass history

### 2026-08-08 — Repository modernization, dependencies, and operations

- Objective: compare Arbiter's repository/agent setup with current Whisk Taker
  practices and deeply inspect dependency, release, CI, and production
  operations boundaries.
- Exclusions: no application, dependency, infrastructure, repository-setting,
  credential, production, or Discord mutation.
- Evidence:
    - Inspected agent policy, release scripts/plans, package scripts, CI and docs
      workflows, GitHub rulesets/security settings, dependency graph, Dockerfile,
      production Compose, environment example, scheduler construction, schema
      layout, documentation, and tracked generated files.
    - GitHub rulesets require pull requests, one approval, resolved threads, and
      the `build_validation` check on `dev`; secret scanning/push protection and
      code scanning are not enabled, and Actions SHA pinning is not required.
    - `pnpm audit --prod --json`: 12 high, 44 moderate, 5 low advisories.
    - No BullMQ completed/failed-job retention is configured; Redis production
      default remains 256 MiB despite the prior queue-growth/OOM incident.
    - Production Compose publishes Loki/Grafana on all interfaces and defaults
      Grafana credentials to `admin/admin`.
- Checks:
    - `pnpm typecheck`: passed.
    - `pnpm lint`: passed.
    - `pnpm test:unit`: 90 files and 318 tests passed.
    - `pnpm test:integration`: 18 files and 42 tests passed; emitted the pg 9
      concurrent-query deprecation warning.
    - `pnpm docs:build`: passed; emitted a non-fatal dynamic-require warning.
- Ticket disposition: created STE-259, STE-260, and STE-261 after duplicate
  search found no Arbiter-project owner. No `Needs Verification` ticket was
  warranted in this slice.
- Meaningful no-finding conclusions: current TypeScript/lint/test/docs gates
  pass; production image is multi-stage and non-root; Redis persistence and
  health checks exist; branch rulesets are substantially stronger than the old
  project age suggests.
- Remaining coverage: all product authorization, state-transition, membership,
  identity, merit, and side-effect flows.
- Next: privileged event start/end authorization and state integrity.
