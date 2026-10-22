# Codex Audit Ledger

This file records bounded audit coverage and ticket disposition. It is not an
application-behavior specification.

## Current snapshot

- Date: 2026-08-09
- Audited commit: `0bd3a9537c1474df61696632c8810598c0437927`
- Branch: `codex/STE-300-split-deployment-hardening`
- Base: `origin/dev`
- Working tree: the branch and `origin/dev` point at the same commit. An active
  STE-300 worker owns 23 modified and two untracked files, including all three API
  runbooks reviewed here. `apps/portal/scripts/browser-api-harness.mjs` became
  modified during the pass without changing the audited commit or documentation
  paths. This pass inspected that unstable working snapshot plus the deployed site
  but did not modify those files. Only this ledger was changed by the audit.

## Subsystem coverage

| Subsystem                                              | Risk   | Status                      | Last pass                | Next trigger                            |
| ------------------------------------------------------ | ------ | --------------------------- | ------------------------ | --------------------------------------- |
| Dependencies and runtime graph                         | High   | Reviewed                    | 2026-08-08 modernization | After STE-259 or dependency changes     |
| BullMQ and Redis operations                            | High   | Reviewed                    | 2026-08-08 modernization | After STE-260 or scheduler changes      |
| Production observability deployment                    | High   | Reviewed                    | 2026-08-08 modernization | After STE-261 or topology changes       |
| Agent, CI, release, and repository setup               | Medium | Reviewed for modernization  | 2026-08-08 modernization | After workflow/security-setting changes |
| Documentation site and API integrator surface          | Medium | Partial: v1 API and portal  | 2026-08-09 API docs      | Recheck final STE-300 head              |
| Discord authorization and custom IDs                   | High   | Partial: event + membership | 2026-08-08 membership    | Review remaining privileged flows       |
| Event attendance/review state transitions              | High   | Reviewed through finalize   | 2026-08-08 review        | After event-integrity fixes             |
| Membership, identity, merits, and Discord side effects | High   | Partial: division flows     | 2026-08-08 membership    | Review manual merit and rank effects    |
| Prisma schema, repositories, errors, and logging       | High   | Partial: membership         | 2026-08-08 membership    | Continue with manual merit persistence  |

## Confirmed findings

| Issue                                                                                                                            | Status   | Severity | Subsystem                  | Pass                     |
| -------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- | -------------------------- | ------------------------ |
| [STE-259](https://linear.app/stellarnotions/issue/STE-259/remediate-reachable-production-dependency-vulnerabilities)             | Done     | High     | Dependencies/runtime       | 2026-08-08 modernization |
| [STE-260](https://linear.app/stellarnotions/issue/STE-260/bound-bullmq-retention-and-right-size-redis-production-defaults)       | Done     | High     | BullMQ/Redis               | 2026-08-08 modernization |
| [STE-261](https://linear.app/stellarnotions/issue/STE-261/harden-production-observability-exposure-and-credentials)              | Canceled | Medium   | Observability deployment   | 2026-08-08 modernization |
| [STE-284](https://linear.app/stellarnotions/issue/STE-284/prevent-overlapping-live-event-reservations-for-one-voice-channel)     | Backlog  | High     | Event draft creation       | 2026-08-08 lifecycle     |
| [STE-285](https://linear.app/stellarnotions/issue/STE-285/make-event-activation-and-end-recoverable-across-redis-failures)       | Backlog  | High     | Event state transitions    | 2026-08-08 lifecycle     |
| [STE-288](https://linear.app/stellarnotions/issue/STE-288/make-review-decision-writes-atomic-with-event-finalization)            | Backlog  | High     | Event review/finalization  | 2026-08-08 review        |
| [STE-289](https://linear.app/stellarnotions/issue/STE-289/make-post-finalization-discord-effects-observable-and-recoverable)     | Backlog  | Medium   | Event finalization/Discord | 2026-08-08 review        |
| [STE-291](https://linear.app/stellarnotions/issue/STE-291/serialize-public-division-selection-per-guild-member)                  | Backlog  | Medium   | Public division selection  | 2026-08-08 membership    |
| [STE-292](https://linear.app/stellarnotions/issue/STE-292/make-division-reconciliation-atomic-and-preserve-unmapped-memberships) | Backlog  | Medium   | Membership reconciliation  | 2026-08-08 membership    |

## Unresolved questions and cross-slice hypotheses

- GitHub secret scanning and push protection are disabled; Actions defaults to
  write and may approve pull requests. Review repository security policy and
  bypass actors before proposing settings changes.
- `coverage/` contains 243 tracked generated files (about 3.9 MB) and is not
  ignored. Remove it from version control after confirming no documentation
  depends on the artifacts.

## Next recommended bounded pass

After STE-300 reaches its final head, recheck the published API route/schema/error
reference, navigation, and credential-handling guidance against the shared
contracts and deployed site. Then resume the deferred manual merit award and
merit-rank side-effect pass.

## Pass history

### 2026-08-09 — API documentation site and integrator experience

- Objective: audit the contributor documentation site for the standalone API,
  staff portal, integrator guidance, deployment readiness, and a possible
  portal-hosted documentation/playground surface without colliding with the active
  STE-300 implementation.
- Trust boundary: published prose and examples are untrusted descriptions of the
  versioned contracts and HTTP handlers; API credentials and staff browser sessions
  must remain separate authorization mechanisms; a browser playground must not
  persist, log, prefill, or transmit a credential anywhere except the configured
  API origin.
- Exclusions: no API, portal, documentation-source, configuration, dependency,
  runtime, production, branch, commit, push, or PR mutation. The audit did not use
  live credentials or data. The worker-owned STE-300 working tree remained intact.
- Evidence:
    - Read live STE-300 (In Progress), its completed STE-293/298/299 predecessors,
      post-MVP STE-320/321, the Arbiter project, and current project resources. No
      accepted Architecture Record is attached as a project resource, and STE-300
      already owns the API/portal documentation and deployment-readiness outcome.
    - Compared `packages/api-contracts` route, scope, request, response, and error
      schemas with the API handlers and current `website/docs/api` pages. The
      endpoint table covers every current static and dynamic HTTP route; the sole
      `users:read` scope, directory fields, filter semantics, null-rank behavior,
      bounds, pagination, authentication split, and rate-limit policy agree with
      current code.
    - The deployed Standalone API and Staff Portal pages return 200, while the new
      worker-owned deployment-readiness page is not deployed yet. The deployed and
      source Getting Started page still says the API has no business route even
      though directory and management routes are current behavior.
    - The explicit sidebar omits the new deployment-readiness page, so the built
      page is reachable only through inline links. The committed local Postman
      directory collection is not linked from the documentation site. API route
      and schema prose is manually maintained; there is no checked-in OpenAPI
      description or contract-derived interactive reference.
- Checks:
    - `pnpm docs:build`: passed and generated all ten pages, including deployment
      readiness; emitted the existing non-fatal dynamic-require warning.
    - A read-only route extraction compared the contract constants with the
      Markdown inventory; all ten static contract paths plus four dynamic
      integration/credential paths are represented.
    - A targeted credential-pattern scan found no credential secret or populated
      API-only secret in `website/docs` or `postman`.
- Ticket disposition: no new issue. STE-300 already owns the confirmed stale
  onboarding statement and final v1 guidance. Navigation, Postman discoverability,
  a machine-readable reference, and a portal playground are product/documentation
  enhancements without a separately proven correctness or security failure. Audit
  evidence was added to STE-300 instead of widening or duplicating its scope.
- Meaningful no-finding conclusions: the current API route inventory and public
  directory contract are accurate; the docs preserve browser-session versus API-key
  authorization, Postgres/Redis authority, one-time credential delivery, exact
  origins, redaction, bounded reads, and no-live-deployment limits; the site build
  catches broken Markdown links.
- Remaining coverage: final STE-300 edits may change every audited API runbook. A
  portal playground still needs an explicit product and security contract before
  implementation, especially spec authority, credential memory lifetime, allowed
  routes, request destination, cookie separation, telemetry, and future mutations.
- Next: re-audit the final STE-300 head and deployed site, then return to manual
  merit award and rank side effects.

### 2026-08-08 — Division membership and Discord reconciliation

- Objective: trace public selectable-division buttons, staff durable membership
  correction, `org_accept`, guild-member role reconciliation, cached definitions,
  nickname projection, Postgres writes, Discord effects, and recovery behavior.
- Trust boundary: button custom IDs and member role caches are caller/runtime
  inputs; configured-guild membership and Legionnaire capability authorize the
  public flow; StaffOnly plus configured-guild preflight authorizes staff flows;
  Discord roles drive public selection while Postgres owns durable memberships.
- Exclusions: no application, schema, migration, runtime, Discord, production,
  branch, commit, push, or PR mutation. The audited membership files are unchanged
  from `origin/dev`; only the existing audit ledger was edited.
- Evidence:
    - Read the live Arbiter project, all project issues including archived states,
      project resources, and the existing `Needs Verification` label. The project
      still has no attached Architecture Record resources. Symptom, abstraction,
      and remediation searches found no issue owning either membership defect.
    - Public selection separately reads cached roles, removes observed conflicts,
      and adds the selected role without member-scoped coordination. A controlled
      concurrent Navy/Support probe made both actions return `joined` and left
      both mutually exclusive roles present.
    - Reconciliation derives desired IDs only from divisions with role mappings,
      but compares that set with all existing memberships. A controlled probe
      showed an existing null-mapped membership being scheduled for deletion.
    - Reconciliation performs additions and removals as independent repository
      writes. A failure injected after the add left the addition applied before
      the service threw; the guild-member listener has no guaranteed retry and
      nickname sync does not run after that failure.
    - Staff membership mutation intentionally updates durable membership and an
      optional nickname rather than Discord roles; contributor docs explicitly
      distinguish this administrative correction path from public role-first
      selection. `org_accept` owns its multi-write Prisma transaction and rolls
      back the reachable prior-nickname state when its INT role grant fails.
- Checks:
    - Three read-only `tsx --eval` probes reproduced the concurrent selector,
      unmapped-membership deletion, and partial reconciliation failure paths.
    - Focused Vitest unit run: 12 files and 38 tests passed at `f2b503b`.
    - Postgres integration run: 20 files and 49 tests passed at `f2b503b`. Existing
      tests cover sequential reconciliation and repository writes, not the
      confirmed concurrency, null-mapping, or second-write failure cases.
- Confirmed findings:
    - [STE-291](https://linear.app/stellarnotions/issue/STE-291/serialize-public-division-selection-per-guild-member)
      (Medium): overlapping public joins can both report success and leave two
      mutually exclusive selectable roles, which reconciliation can persist.
    - [STE-292](https://linear.app/stellarnotions/issue/STE-292/make-division-reconciliation-atomic-and-preserve-unmapped-memberships)
      (Medium): reconciliation deletes memberships Discord cannot represent and
      can commit additions before a later removal failure.
- Ticket disposition: capacity was available again. Live STE-284/285 already own
  the first two prior event findings, and concurrently created STE-288/289 own the
  two prior review findings. STE-290 was created during that Linear race and was
  immediately marked duplicate of STE-288. New Backlog Bugs STE-291 and STE-292
  own this pass; no `Needs Verification` ticket was warranted.
- Meaningful no-finding conclusions: configured-guild and StaffOnly/Legionnaire
  gates are present; malformed or stale division custom IDs fail safely; public
  single-action join/leave prevents contradictory selectable roles; staff durable
  membership mutation accurately reports nickname partial success; division cache
  initialization and scheduled refresh use Postgres definitions; nickname output
  is computed from stored base identity, durable memberships, and merit totals.
- Remaining coverage: manual merit award authorization and event linkage,
  medal/nickname/rank partial success, then name-change review and remaining
  privileged flows and targeted error/logging boundaries.
- Next: manual merit award and merit-rank side effects end to end.

### 2026-08-08 — Event review snapshot, finalization, and merit integrity

- Objective: trace event-end attendance snapshotting, durable participant and
  review state, concurrent decision/finalization actions, atomic merit creation,
  review/tracking presentation, nickname/rank effects, cleanup, and recovery.
- Trust boundary: Redis attendance is caller-independent transient input that
  must become durable before review; custom IDs and concurrent staff actions are
  untrusted inputs; Postgres pending-review state authorizes decision mutation
  and finalization; Discord effects occur after the durable commit.
- Exclusions: no application, schema, migration, runtime, Discord, production,
  branch, commit, push, or PR mutation. The external `f2b503b` commit touched only
  Prisma config/test files and did not change this slice.
- Evidence:
    - Read all 25 current Arbiter-project issues, targeted Done/Canceled search
      results, the live `Needs Verification` label, and STE-283's explicit
      workspace-capacity blocker. No issue owns either confirmed failure, and the
      project still has no attached Architecture Record documents.
    - Review initialization snapshots Redis, maps known Discord users, persists
      participant stats and default decisions, then clears Redis. Its writes are
      retry-safe in the inspected failure order: Redis is cleared only after both
      durable write phases, existing decisions are not overwritten, and a later
      message-sync retry can rebuild from Postgres.
    - `recordEventReviewDecision` checks pending state, then calls an unconditional
      Prisma upsert in a separate operation. Finalization independently changes
      state and selects decisions inside its transaction. A decision request that
      passes the first check can therefore commit after finalization selected merit
      rows, leaving the durable decision inconsistent with awarded merits.
    - Finalization uses a Postgres compare-and-set and one transaction for final
      state plus merit creation, so concurrent submit actions do not duplicate
      current runtime awards. The schema's `skipDuplicates` is not itself the
      safeguard because no event-award uniqueness constraint exists.
    - After that transaction commits, nickname/rank sync, tracking-summary edits,
      timeline messages, tracked-channel deletion, and review-message sync run as
      sequential best-effort work. Several failures are logged but still return
      `review_finalized`; thrown failures produce a generic failed interaction,
      while a retry is rejected because the event is already final. There is no
      reconciliation entrypoint for incomplete post-commit effects.
- Checks:
    - Focused Vitest unit run: 5 files and 27 tests passed at `f2b503b`.
    - Focused Postgres/Redis integration run: 4 files and 14 tests passed at
      `f2b503b`. The existing tests cover sequential state locking and merit
      persistence but not decision/finalization interleavings or post-commit
      recovery.
- Confirmed findings:
    - `event-review-finalization-race-01` (High): decision writes are not
      atomically conditional on pending-review state, so a concurrent decision can
      land after finalization and contradict the merits actually awarded.
    - `event-finalization-side-effects-01` (Medium): finalization can report full
      success despite failed Discord/nickname effects, or report generic failure
      after the durable commit, with no safe retry/reconcile path.
- Ticket disposition: symptom/abstraction/remediation searches across all Arbiter
  statuses found no owner. STE-283 is not a duplicate and explicitly excludes
  merit changes. The findings were filed as STE-288 and STE-289. During routing,
  STE-286 and STE-287 were created from stale pre-capacity state, then immediately
  marked Duplicate of the concurrently filed STE-284 and STE-285. No
  `Needs Verification` ticket was warranted.
- Meaningful no-finding conclusions: configured-guild actor preflight and service
  capability checks are present; decision custom IDs cannot mutate a non-attendee
  through the production action; attendance snapshot retry order preserves Redis
  until durable writes succeed; final state and merit creation are atomic; current
  submit concurrency is guarded by the database state compare-and-set.
- Remaining coverage: division membership authorization and reconciliation,
  cached division semantics, nickname computation outside event finalization,
  manual merit side effects, then targeted error/logging boundaries.
- Next: public/staff division membership mutation through Postgres, Discord roles,
  cached definitions, nickname projection, and partial-success recovery.

### 2026-08-08 — Privileged event start/end authorization and state integrity

- Objective: trace `/event start`, Start/Cancel/End components, the versioned
  Event Ping component, Postgres event state, Redis tracking/coordination, Discord
  presentation, interaction settlement, and focused tests.
- Trust boundary: Discord command options and custom IDs are caller-controlled;
  configured-guild actor capability and current Postgres state authorize durable
  mutation. Postgres owns legal event state and Redis owns transient tracking and
  per-session operation locks.
- Exclusions: no application, schema, migration, runtime, Discord, production,
  branch, commit, push, or PR mutation. Review decisions, final merit creation,
  and nickname effects were mapped but not deeply audited in this pass.
- Evidence:
    - Read the full live STE-265 contract and all 25 Arbiter-project issues,
      including Done and Canceled; no issue owns either confirmed failure. The
      project currently has no attached Architecture Record resources.
    - `resolveEventStartCommand` and `createDraftEventSession` do not use the
      existing DRAFT/ACTIVE voice-channel reservation query. The database permits
      the same channel ID on different event sessions, so repeated starts can
      create and activate overlapping sessions that track and award independently.
    - `transitionEventSession` commits ACTIVE or ENDED_PENDING_REVIEW before
      calling Redis `startTracking`/`stopTracking`. Those calls can throw; ACTIVE
      recovery enumerates Redis IDs only, while failed End Event retries are
      rejected by durable state and no other caller retries review initialization.
    - Start/Cancel/End and Event Ping component handlers independently resolve
      actor capability; services recheck capability and current state. End Event
      and Event Ping share a bounded, token-owned Redis operation lock. Event Ping
      also constrains mentions and conditionally persists its receipt.
- Checks:
    - Focused Vitest run: 5 files and 36 tests passed at
      `ed7f08552e2f03e485cafee6b4c04ee61502613e`.
    - Covered lifecycle unit/integration tests, handler settlement, Event Ping
      service behavior, and Redis operation-lock integration.
- Confirmed findings:
    - `event-channel-reservation-01` (High): event start bypasses the existing
      voice-channel reservation invariant and permits overlapping DRAFT/ACTIVE
      sessions with duplicate attendance/merit potential.
    - `event-transition-recovery-01` (High): Redis failures after durable
      activation/end can leave an untracked ACTIVE event or an ended event with
      no initialized review and no bounded recovery path.
- Ticket disposition: duplicate search found no owner. The initial write was
  blocked by Linear's workspace free-issue limit; after capacity became available,
  the findings were filed as STE-284 and STE-285. No `Needs Verification` ticket
  was warranted because both failures are directly traceable.
- Meaningful no-finding conclusions: current custom-ID parsers reject malformed
  session IDs; button ingress does not trust custom IDs for authorization; current
  state compare-and-set prevents repeated state transitions; Event Ping/End Event
  mutual exclusion is token-owned and expiry-bounded; all focused tests pass.
- Remaining coverage: review snapshot atomicity, concurrent review actions,
  finalization/merit idempotency, nickname and Discord partial success, then
  membership/identity flows.
- Next: event end snapshot, review initialization, finalization, and merit awards.

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
