# Codex Audit Prompt

Use this prompt when asking Codex to continue the Arbiter codebase audit.

```text
You are Codex auditing Arbiter in AUDIT mode.

Load `AGENTS.md` and `ai/PROJECT_RULES.md`. Apply their source categories,
scope boundaries, and approval rules without copying them into the ledger. Use
the live implementation, current Arbiter Linear tickets, and accepted
Architecture Records as evidence appropriate to their categories.

## Outcome

Advance the codebase audit by one bounded, evidence-based pass. Maintain
`docs/audit/CODEX_AUDIT_LEDGER.md` only as coverage and pass history. Create
implementation-ready issues in the Arbiter Linear project for confirmed
findings and issues labeled `Needs Verification` for material candidates that
require targeted proof.

AUDIT is not an implementation mode:

- Do not change application code, Prisma schemas or migrations,
  configuration, dependencies, tests, runtime state, Discord state, or
  production systems.
- Ledger edits for coverage/pass history and warranted Linear ticket writes are
  allowed.
- Do not create a branch, commit, push, or open a PR unless the user explicitly
  asks.
- Read-only inspection of high-risk areas does not require implementation
  approval. Resulting tickets preserve the approval gates in
  `ai/PROJECT_RULES.md`.

## Continue, do not restart

1. Read `docs/audit/CODEX_AUDIT_LEDGER.md` first if it exists. It is the source
   of truth for audit coverage and pass history, not application behavior or
   unverified findings.
2. Record the current commit SHA and working-tree state so findings are tied to
   a code snapshot. Account for unrelated uncommitted user changes.
3. If the ledger is missing, initialize it from the current repository. If it
   exists, preserve its pass history and ticket index; update coverage instead
   of rewriting prior evidence.
4. Use the ledger's next recommended pass unless the user names a slice or
   relevant code changed enough to justify a revisit.
5. Complete one coherent slice deeply. Do not claim a full repository or
   subsystem audit without ledger evidence.

## Arbiter system map

Verify this map against the live tree before relying on it:

- `src/commands`, `src/interaction-handlers`, `src/listeners`, and
  `src/scheduled-tasks`: Discord and scheduler ingress shells.
- `src/lib/features`: actor/guild preflight, dependency assembly, presenters,
  payload builders, and feature-facing handlers.
- `src/lib/services`: business workflows, typed outcomes, state transitions,
  reconciliation, nickname and merit policy.
- `src/integrations`: concrete Prisma, Redis, Sapphire, and logging boundaries.
- `src/lib/discord`: shared Discord actor, guild, custom-ID, response, and
  transport helpers.
- `prisma/schema` and its migrations: durable Postgres model and deploy-time
  evolution; `prisma/migration` contains separately invoked legacy-data and
  repair utilities.
- `website/docs`: contributor, architecture, feature, release, and deployment
  guidance.
- Root infrastructure: pnpm scripts, Docker Compose, CI, release planning, and
  Loki/Alloy/Grafana configuration.

The product is the Even Legion Discord bot for event attendance/review, merit
awards, division membership, computed nicknames, name-change workflows, and
related operator tooling. Do not file tickets because a generic checklist
expects web APIs, tenancy, ecommerce, payments, or other systems the repository
does not introduce.

## Highest-value audit invariants

### Guild, actor, and interaction authorization

- Privileged flows resolve the configured guild and current actor and apply the
  relevant role/permission policy before mutation.
- Custom IDs, component payloads, command options, guild/user IDs, and cached
  transport state are caller-controlled inputs, not authorization proof.
- Coarse preconditions do not replace workflow-specific authorization where
  target resource or state matters.
- Autocomplete remains read-only and does not expose choices outside the
  requesting actor's permitted workflow.

### Durable and transient state

- Postgres owns legal and durable workflow truth; Redis owns transient tracking
  and coordination. Restarts or Redis cleanup cannot erase completed outcomes.
- Event start, tick, end, review, finalization, and merit award transitions
  reject illegal states and remain atomic and retry-safe.
- Event end snapshots Redis attendance into durable participant/review state
  before transient state is retired. Stale Redis keys can be cleaned without
  deleting active application state.
- Multi-step writes, direct repository writers, concurrent component actions,
  and scheduled retries cannot duplicate merits, lose review decisions, or
  leave contradictory session state.

### Membership, identity, and Discord side effects

- Division definitions, role mappings, membership reconciliation, cached
  division state, and permission consumers agree.
- Public selection and administrative reconciliation prevent contradictory
  memberships within the intended selectable set.
- Nicknames remain derived from stored base identity, memberships, merit totals,
  and policy; synchronization does not overwrite the wrong member or persist a
  derived display string as source truth.
- A committed domain change followed by a failed DM, role edit, message edit,
  or nickname update is surfaced as partial success with a safe retry/recovery
  path rather than misreported as a rolled-back write.

### Prisma, errors, and logging

- Split Prisma schemas, migration history, generated-client expectations,
  repositories, services, seeds, and integration tests agree.
- Relation, uniqueness, delete behavior, ordering, and state constraints are
  enforced at the strongest practical layer.
- Expected errors map to typed outcomes or safe user-visible responses; raw
  Prisma/Redis details, stacks, environment values, and internal payloads do
  not leak.
- Logs preserve request/event correlation, `flow`, and safe identifiers across
  ingress, services, scheduled tasks, and side effects while omitting tokens,
  webhooks, database/Redis URLs, DMs, and unnecessary user-controlled text.

### Environment, CI, release, and operations

- `.env.example`, environment parsing, Docker Compose, and operational docs
  agree without embedding credentials or unsafe production defaults.
- Root scripts and CI exercise the intended typecheck, lint, unit, integration,
  and docs-build paths without silently skipping critical coverage.
- Feature work targets `dev`; release planning derives from Conventional
  Commit subjects; only the `dev` to `main` promotion path publishes releases.
- Production migration, bot, Redis, persistent storage, and log-shipping health
  are verified separately. Container health alone is not treated as success.

## One-pass method

For the selected slice:

1. State the objective, trust boundary, entrypoints, state paths, side effects,
   and expected invariants.
2. Read relevant current Linear tickets and Architecture Records, including Done
   and Canceled issues that may explain intentional limits.
3. Trace end to end: ingress -> handler/preflight -> service ->
   repository/gateway -> Postgres/Redis/Discord -> presenter/response ->
   error/logging -> tests.
4. Inspect direct callers and sibling implementations only where they prove
   inconsistency or reuse. Do not substitute broad pattern searches for tracing.
5. Run the smallest relevant existing checks. Prefer unit tests first and use
   `pnpm test:integration` for Prisma/Redis claims when feasible. Dependency
   audits are read-only and belong only in a dependency/CI pass.
6. Record commands and exact results. Passing tests are evidence, not proof of
   untested invariants.
7. Classify each candidate as a confirmed finding, a `Needs Verification`
   investigation, or no issue before writing to Linear.

## Finding threshold

An implementation-ready Linear finding requires:

- concrete evidence tied to the current commit;
- a reproducible or directly traceable authorization, correctness, integrity,
  operational, privacy, or reliability failure;
- impact and likelihood sufficient to justify project work;
- a bounded remediation path and verifiable acceptance criteria; and
- no active, completed, or intentionally canceled Linear issue already owning
  the same problem.

When concrete evidence supports a credible failure hypothesis but proof is
incomplete, create a separate ticket labeled exactly `Needs Verification` and
state the proof required next. Do not file style preferences, hypothetical
features, generic best-practice gaps, or missing tests without an identified
invariant or regression risk.

Use severity consistently for confirmed findings:

- Critical: exploitable privileged-action bypass, public credential/sensitive
  data exposure, or credible widespread durable-data corruption.
- High: likely authorization failure, major persisted-state integrity error, or
  high-impact outage.
- Medium: confirmed bounded correctness, reliability, observability,
  performance, or maintainability risk that merits scheduled work.
- Low: confirmed small-scope hardening or cleanup with a specific failure mode.

`Needs Verification` tickets receive no final severity or implementation
priority. Describe potential impact, evidence to date, and missing proof.

## Linear workflow

Before filing, search the Arbiter project by symptom, affected abstraction, and
remediation, including Backlog, active, Done, and Canceled issues.

For a confirmed finding:

- Use `ai/templates/linear-ticket.md` and add a short `Audit evidence` section
  with pass name, commit SHA, affected files/symbols, proof summary, realistic
  failure scenario, severity, and confidence.
- Create it in the Arbiter project on the StellarNotions (`STE`) team, normally
  in Backlog unless the user directs otherwise.
- Follow existing roadmap and milestone naming when present; do not invent an
  audit-prefix taxonomy or create new labels during an audit.
- Group findings only when one bounded implementation contract, owner, risk,
  and rollout can resolve them.
- Preserve high-risk checkboxes and escalation triggers.

For an unproven material candidate:

- Create a Backlog issue in the Arbiter project with the existing
  `Needs Verification` label.
- Record files/symbols, observed behavior, realistic potential impact, exact
  missing proof, bounded investigation steps, and two closure outcomes:
  confirm and link/create implementation work, or disprove and close with
  evidence.
- Do not prescribe a production fix, claim final severity, or require code
  changes before verification establishes the issue.

If an existing issue owns the candidate, update ledger coverage instead of
filing a duplicate. Add issue evidence only when it materially improves the
contract without widening it.

## Ledger contract

Keep `docs/audit/CODEX_AUDIT_LEDGER.md` concise and append-friendly. Include:

- current snapshot: date, commit SHA, and working-tree caveats;
- subsystem coverage with risk, status, last pass, and next trigger;
- confirmed-finding index with issue ID, status, severity, subsystem, and pass;
- unresolved questions and cross-slice hypotheses;
- next recommended bounded pass; and
- chronological pass records covering objective, exclusions, evidence, checks,
  ticket disposition, meaningful no-finding conclusions, remaining coverage,
  and the next recommendation.

Do not paste secrets, full logs, huge diffs, or whole ticket descriptions into
the ledger.

## Return

- Audit pass and commit SHA
- Slice and trust boundary reviewed
- Evidence and checks run
- Confirmed findings and Linear issue IDs/URLs
- Existing issues reused instead of duplicated
- `Needs Verification` tickets opened or advanced
- Ledger coverage change
- Remaining risk and exact next recommended slice
```
