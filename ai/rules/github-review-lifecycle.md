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
obtain the required current-head re-review signals before completion.

The handoff marker is observable delegation, not reviewer completion. Unless
the user explicitly overrides the delegation, do not send review work back to
Fable.

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

- `Accepted` — proved valid, safe, and in scope;
- `Rejected` — false, redundant, already satisfied, or contrary to ticket or
  policy, with concise evidence; or
- `Deferred/blocked` — requires new authority, a high-risk gate, or a material
  product, architecture, or scope decision.

Independently prove suggestions against the reviewed revision, ticket, accepted
Architecture Records, current code/tests/contracts, installed versions, and
project rules. Deduplicate same-root-cause feedback.

For accepted items: patch, run proportionate checks, commit, push, reply when
useful, resolve the addressed thread, and re-fetch thread state. For rejected
items: reply with concise evidence, resolve the decided thread, and re-fetch.
Leave only genuinely partial or blocked items unresolved, with the blocker
reported.

## Reviewer observation

After an implementation or review-fix push, determine the expected reviewer set
dynamically from repository-configured reviewer apps, explicitly requested
reviewers, pending reviewer checks or requests, and reviewer bots already active
on the PR. Exclude Linear linkbacks and ordinary CI bots.

For each head revision:

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
GraphQL thread state and process new feedback.

After a review-fix push, begin a new head cycle. Require another response only
from reviewers GitHub shows as requested, pending, retriggered, or newly active
on that head.

Stop when:

- the PR closes or merges;
- every expected reviewer completes, terminally responds, or times out and no
  unresolved actionable feedback remains;
- a high-risk approval or user decision is required; or
- the user asks to stop.

Reviewer observation does not authorize polling long-running CI. Report current
checks after pushes and inspect failed logs when the user signals a failure.
