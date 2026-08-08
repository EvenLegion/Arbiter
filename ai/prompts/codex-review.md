# Codex Review Prompt

Use this prompt to review a diff or PR against its user request and live Linear
ticket.

```text
Mode: <REVIEW_ONLY | ADDRESS_REVIEW_COMMENTS>

Ticket: <ticket link or body>
Diff or PR: <diff, branch, or PR>

Load:
- `AGENTS.md`
- `ai/PROJECT_RULES.md`
- `ai/rules/documentation-impact.md`
- `ai/rules/architecture-records.md`
- `ai/rules/github-review-lifecycle.md` for GitHub feedback or reviewer state
- `ai/rules/implementation-lifecycle.md` for review-fix mutation and handoff

Defaults:
- "review" means `REVIEW_ONLY`.
- "address comments", "fix review comments", "fix review feedback", and
  "apply PR feedback" mean `ADDRESS_REVIEW_COMMENTS`.
- Review work uses `STANDARD_REVIEW`; repeat-until-settled cycling requires an
  explicit `EXHAUSTIVE_REVIEW` request.

Inspect the exact revision, ticket and accepted decisions, changed files,
direct callers/imports, analogous implementations, relevant tests/contracts,
installed versions, existing review feedback, and required documentation or
Architecture Record disposition.

Apply the evidence threshold and repository review rules in `AGENTS.md`.
Historically high-value traces include:
- Discord ingress/custom ID -> handler actor/guild preflight -> service rule ->
  repository/gateway side effect -> presenter/reply/logging;
- Postgres transaction, Redis coordination, scheduled-task retry, concurrent
  mutation, commit-then-Discord-side-effect, and direct-writer paths;
- event start/tick/end/review/finalize transitions, attendance snapshotting,
  merit award idempotency, and stale Redis cleanup;
- division cache, role reconciliation, computed nickname, and name-change
  review paths; and
- interaction defer/reply/follow-up settlement, partial success, raw-error
  leakage, and secret-safe structured logs.

Independently prove external feedback. Reject false or redundant suggestions
with evidence. Decline technically possible feedback when its likelihood and
consequence do not justify the added complexity, regression risk, or validation
cost. Do not widen scope to make a suggestion true.

## REVIEW_ONLY

Return findings only, ordered by severity. Each finding includes file/line,
reachable path or violated invariant, consequence, and proof. If none qualify,
say so concisely and name any material verification limitation.

Do not edit files, commit, push, resolve/reply to comments, mutate the PR, or
mutate Linear.

## ADDRESS_REVIEW_COMMENTS

Use authoritative GraphQL thread state and complementary REST surfaces from the
review lifecycle. Produce a decision ledger for every unresolved actionable
thread: `Accepted`, `Rejected`, `Declined`, or `Deferred/blocked`, with concise
evidence and the proportionality decision defined by the lifecycle.

Patch accepted safe in-scope feedback, run proportionate checks, commit, push,
check for and reuse the branch's valid existing release plan, reply/resolve
decided threads, and re-fetch authoritative state. Do not regenerate the plan
for routine review-fix commits. Stop for any required approval or material
scope/product/architecture decision.

Report the decision ledger, new head, validation, current checks, expected
reviewer state, review-budget disposition, and any remaining actionable or
gated item. Follow the canonical bounded reviewer cycle after a review-fix push.
```
