# GitHub Review Lifecycle

This file is the single owner of interactive GitHub feedback handling,
authoritative thread state, automated-review observation, and reviewer
completion. CI status reporting remains in
`ai/rules/implementation-lifecycle.md`.

## Review surfaces

When unresolved or resolved thread state matters, GitHub GraphQL
`reviewThreads` is authoritative. Fetch every page and retain, at minimum:

- thread ID, path, line/original line, `isResolved`, and `isOutdated`;
- comment ID, author, body, URL, and review association; and
- current and original commit OIDs, including REST `original_commit_id` for
  inline comments.

Use REST review comments, reviews, issue comments, requested reviewers, checks,
and PR reactions as complementary surfaces. Flat comments and
`gh pr view --comments` alone are insufficient.

## Delegated Fable-to-Opus ownership

A PR whose description carries the `Review handoff` marker from
`ai/rules/implementation-lifecycle.md` has intentionally split implementation
from review follow-through. Fable stops at the recorded head without observing
or acting on review feedback. A separate Opus 5 task invoked with
`ADDRESS_REVIEW_COMMENTS` owns this lifecycle and must use authoritative
`reviewThreads` state, independently decide every actionable finding, implement
accepted fixes, reply to and resolve decided threads, push later heads, and
complete the bounded reviewer cycle below.

The handoff marker is observable delegation, not reviewer completion. The Opus
5 task's decisions, commits, replies, thread-resolution state, validation, and
bounded reviewer-cycle result are the completion evidence. Unless the user
explicitly overrides the delegation, do not send review work back to Fable.

Re-fetch GraphQL thread state:

- immediately before deciding unresolved feedback;
- after a push, because lines and mutable commit associations may change;
- after replying to or resolving threads; and
- after the reviewer settle delay.

Match feedback across later pushes with the parent review `commit_id`, explicit
`Reviewed commit` or `Last reviewed commit` text, or inline
`original_commit_id`. Do not use an inline comment's mutable `commit_id` as
authoritative after later pushes.

## Feedback decisions

For every unresolved actionable thread, record one decision:

- `Accepted` — proved valid, proportionate, safe, and in scope;
- `Rejected` — false, redundant, already satisfied, or contrary to ticket or
  policy, with concise evidence; or
- `Declined` — technically possible but not proportionate in this PR because
  the likelihood and consequence are low relative to implementation
  complexity, regression risk, or validation cost; or
- `Deferred/blocked` — requires new authority, a high-risk gate, or a material
  product, architecture, or scope decision.

Independently prove suggestions against the reviewed revision, ticket, accepted
Architecture Records, current code/tests/contracts, installed versions, and
project rules. Deduplicate same-root-cause feedback.

Accept a finding when at least one of these is true:

- an ordinary supported path can cause materially incorrect behavior;
- it can lose data, misstate durable or transient state, cross a guild or actor
  authorization boundary, duplicate an award, or silently reverse committed
  user intent;
- it violates an explicit ticket requirement, contract, accepted Architecture
  Record, or repository invariant; or
- a small, local, readily testable fix materially reduces plausible risk.

Decline a finding when its benefit is disproportionate, including when it:

- depends on unsupported input, a theoretical contract extreme, or several
  independent low-probability events without a protected invariant at stake;
- has only cosmetic, self-correcting, or readily recoverable consequences;
- would add queues, locks, state-machine branches, abstractions, or validation
  burden whose complexity exceeds the demonstrated risk; or
- proposes defensive hardening without a concrete reachable failure.

Reviewer severity labels are advisory. Reachability, consequence, explicit
requirements, and fix complexity determine the decision. Rare findings that
threaten authorization, Postgres/Redis integrity, idempotency, data loss, or
live Discord safety remain material; the high-risk approval gate still applies.

For accepted items: patch, run proportionate checks, commit, push, reply when
useful, resolve the addressed thread, and re-fetch thread state. For rejected
or declined items: reply with concise evidence and, for declines, the risk and
complexity tradeoff; resolve the decided thread and re-fetch. Leave only
genuinely partial or blocked items unresolved, with the blocker reported.

If two consecutive rounds expose new defects in the same mechanism, stop
stacking incremental patches. Perform one bounded root-cause assessment.
Refactor only when it makes the implementation simpler and proves the invariant
more directly; otherwise decline or defer further hardening.

## Automated-review budget

The goal is material risk reduction, not zero automated-review comments.

`STANDARD_REVIEW` is the default for implementations and
`ADDRESS_REVIEW_COMMENTS`:

1. Observe one automated review of the completed implementation.
2. Decide its threads and address accepted feedback in one consolidated batch.
3. Observe one current-head follow-up review.
4. Decide and address any remaining high-value findings, but do not request,
   trigger, or wait for another automated review after that push.

A third automated cycle is allowed only when the preceding accepted fixes
materially changed authorization, Postgres/Redis persistence or coordination,
idempotency, transaction behavior, or live Discord safety. Standard review
never exceeds three automated cycles without explicit user instruction.

`EXHAUSTIVE_REVIEW` restores repeat-until-settled reviewer cycling and requires
an explicit current user request. Do not infer it from `implement STE-NNN`,
`ADDRESS_REVIEW_COMMENTS`, reviewer activity, or a prior exhaustive task.

Stop early when a follow-up review produces no accepted high-value finding, or
only rejected, declined, duplicate, P3/polish, or low-value hardening findings.
A fix pushed during the final permitted cycle does not automatically reopen
reviewer observation: validate it proportionately, settle the current threads,
report residual risk, and move on.

## Reviewer observation

After an implementation or review-fix push, determine the expected reviewer set
dynamically from repository-configured reviewer apps, explicitly requested
reviewers, pending reviewer checks or requests, and reviewer bots already active
on the PR. Exclude Linear linkbacks and ordinary CI bots.

For each head revision still inside the active review budget:

1. Check review summaries, inline comments, issue comments, PR reactions, and
   GraphQL thread state at approximately 2, 3, and 5 minutes.
2. From 5 through 10 minutes, check every 30 seconds.
3. After 10 minutes, back off to every 2 minutes.
4. At 60 minutes, mark a silent expected reviewer non-responsive and proceed.

Completion signals must belong to the current cycle. A formal current-head
review or documented current-cycle no-find signal qualifies. A Codex reviewer
bot's new PR-level `+1` qualifies for Codex; a Greptile `+1` alone is only
supplemental. Quota exhaustion or failed-review messages are terminal for
waiting but mean reviewer unavailable, not substantive review.

When every expected reviewer completes, terminally responds, or times out, wait
at least 45 seconds for state to settle. Then re-fetch every review surface and
GraphQL thread state and process new feedback within the active budget.

After a review-fix push, begin another head cycle only when the active review
budget permits it. Require another response only from reviewers GitHub shows as
requested, pending, retriggered, or newly active on that head. Once the budget
is exhausted, record late review activity but do not wait for or retrigger it
unless it exposes a material high-risk invariant violation or the user requests
another cycle.

Stop when:

- the PR closes or merges;
- every current thread has a recorded decision, and either the active review
  budget is exhausted or the latest cycle has no accepted high-value finding;
- a high-risk approval or user decision is required; or
- the user asks to stop.

Reviewer observation does not authorize polling long-running CI. Report current
checks after pushes and inspect failed logs when the user signals a failure.
