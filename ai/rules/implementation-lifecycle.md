# Implementation Lifecycle

This file is the single owner of change-branch start, implementation handoff,
release planning, and CI reporting. `implement STE-NNN` is a ticket-backed
end-to-end request and authorizes its standard scoped Git/PR/Arbiter Linear and
review handoff. A standalone change request is local-only unless the user
explicitly requests external handoff. Neither form grants authority for
high-risk or destructive actions.

## Start from the live contract

1. Read the user request. When it identifies a Linear ticket, also read the live
   ticket, relations, comments, accepted Architecture Records, and any canonical
   Linear documents the ticket explicitly marks as binding. Confirm the issue
   belongs to the Arbiter project or surface the project conflict. Never invent
   a ticket or ticket state for a standalone request.
2. Confirm the goal, non-goals, locked decisions, acceptance/done criteria,
   affected ingress and layers, validation, dependencies, and high-risk approval
   state from available evidence.
3. For a replacement or migration ticket, inventory the superseded command,
   component protocol, service, repository surface, schema contract, runtime
   path, and its direct callers, exports, tests, docs, flags, and compatibility
   paths. Separate behavior that must migrate from obsolete baggage that should
   retire.
4. Surface only material ambiguity or required approval. Do not stop for routine
   implementation choices.

## Branch start

For a new ticket, implementation, or repository-change branch:

1. Run `git status --short --branch` and note all tracked and untracked changes.
2. If the worktree is not clean, stop before switching branches and ask how to
   reconcile the user-owned checkout.
3. Run `git switch dev`.
4. Run `git pull --ff-only origin dev`.
5. Run `git rev-list --left-right --count dev...origin/dev` and require `0 0`.
6. Create the work branch from local `dev`. A ticket-backed branch must include
   its Linear ID; Codex prefers `codex/STE-NNN-short-slug`. Use a descriptive
   branch without an invented ID for standalone work.

Do not branch feature work from `main`; `main` is the release branch reached by
promotion from `dev`. If local and remote `dev` remain ahead, behind, or
diverged, ask the user to reconcile them. Never reset, rebase, merge, stash,
discard, relocate changes, or create a separate worktree to bypass this rule
without explicit user approval.

Resuming an existing ticket or review-feedback branch does not require a new
branch or rebase unless requested.

## Implement and validate

- Keep changes bounded to the request and preserve the runtime shell -> handler
  -> service -> repository/gateway -> presenter ownership model.
- Change tactics after a failed approach; use available fallbacks. Stop only
  when progress requires user-only information, new authority, or a gated
  product, architecture, or safety decision.
- Run measurable checks named by the ticket plus the narrowest affected checks.
  The normal repository-wide validation set is:

    ```bash
    pnpm typecheck
    pnpm lint
    pnpm test
    pnpm docs:build
    ```

- Add `pnpm test:integration` when Prisma or Redis behavior changed, or when the
  important risk crosses workflow and storage coordination. If Docker is
  unavailable and the integration runner exits without executing coverage,
  report that explicitly rather than calling the suite passed.
- Use manual Discord validation when command registration/options,
  autocomplete, components, modals, permissions, or guild-member listeners
  changed. Never claim manual Discord coverage when credentials, a configured
  test guild, or the required live client were unavailable.
- Explain any required check that cannot run. Do not move a ticket to
  `In Review` while required local checks are failing or unexplained.
- Run `git diff --check` before handoff.
- Apply `ai/rules/documentation-impact.md` and record exactly one disposition.
  A deferred local-only follow-up blocks external handoff until the user
  supplies the Linear-ticket decision defined there.
- Apply `ai/rules/architecture-records.md`. A required record with no Linear
  ticket is provisional and blocks external handoff until the user supplies the
  ticket decision defined there.

## Replacement and retirement pass

Before handing off a replacement or migration ticket:

1. Migrate every in-repository caller within the ticket boundary and remove the
   superseded implementation in the same PR when removal is safe and bounded.
2. Use targeted searches to prove no old command route, custom-ID producer or
   parser, duplicate handler, dead export, stale test, obsolete config, or
   unneeded compatibility path remains within the boundary.
3. For each intentional remnant, record the concrete consumer, owner, reason,
   removal trigger, and linked Linear follow-up. A TODO alone is insufficient.
4. Report what was replaced, removed, intentionally retained, and verified.

Separate open tickets may leave a temporarily mixed program state. A completed
surface ticket may not leave its own replacement boundary partly migrated.

## External handoff and release planning

When the requested scope and required local validation are complete:

1. Review the diff against the request and, when present, its ticket and locked
   decisions; check layer boundaries, project rules, and unrelated-change risk.
2. Determine whether external handoff is authorized. Ticket-backed end-to-end
   work and an explicit user request for external handoff continue through the
   remaining steps. Otherwise stop at the local-only completion path: report the
   local branch or diff and validation, and do not commit solely for handoff, run
   the release planner, push, open or mutate a PR, or update Linear.
3. For authorized external handoff, commit only scoped changes with
   Conventional Commit subjects. Use multiple focused commits when that improves
   reviewability.
4. Before every push, resolve the current branch and run
   `pnpm release:plan:check`. The checker reads `.release-plans/*.json`, treats
   the parsed `branch` field as authoritative, and fails when zero or multiple
   plans own the branch. It also verifies the schema, `origin/dev` base, current
   merge base, semantic bump and target version, and recorded commit ancestry.
5. Reuse the existing plan without running `pnpm release:plan` when the checker
   accepts it and its release-note scope remains intended. A recorded `headRef`
   may be older than the current branch head; a later routine implementation or
   review-fix commit does not by itself make the plan stale.
6. If no matching plan exists, run
   `pnpm release:plan` exactly once after the scoped Conventional Commit history
   exists, supplying the intended bump, explicit public-note mode, contribution
   summary, and every mode-specific field required by
   `ai/rules/release-plans.md`. Use the smallest semantic bump compatible with
   user-visible and compatibility impact unless the ticket or user locks another
   bump. Inspect the generated plan and its automatic commit. Running the same
   classification again reuses a valid plan without writing or committing
   anything.
7. Repair an unreadable plan manually before rerunning the workflow because its
   branch ownership cannot be determined safely. Regenerate a matching parsed
   plan only when it records another branch or base, its merge base no longer
   matches current `origin/dev`, its bump is wrong, or later work materially
   changes release-note classification, grouping, contribution summary, or
   public copy. Regeneration must repeat the full intended classification and
   explain the reason with `--regenerate --reason` as defined by
   `ai/rules/release-plans.md`.
   Do not create a second plan for the same branch/worktree merely because a
   push is imminent. Do not create or update a plan for local-only work.
8. Review the classification, contribution summary, grouping, and any public
   description against `ai/rules/release-plans.md`. A `publish` plan must account
   for every pending contribution in its group. If the plan is inaccurate,
   correct the existing branch-owned plan without creating a second one. After
   editing it, rerun `pnpm release:plan:check` and commit the updated plan file
   before continuing to step 9.
9. Push the branch and open a ready-for-review PR against `dev`. Use a draft only
   when an unresolved decision prevents completion. Never open an ordinary
   feature PR directly against `main`.
10. When a Linear ticket exists, add the PR link if the integration does not do
    so automatically and move the issue to `In Review`. Never create or mutate a
    Linear issue merely to satisfy a standalone workflow.
11. Report whether GitHub checks have started or give their current status and
    URLs. Do not poll long-running CI to completion unless the user asks.
12. If automated reviewers are expected, use
    `ai/rules/github-review-lifecycle.md`; reviewer observation is distinct from
    CI polling.

For review-feedback work on an existing PR, preserve the branch's current
release plan. The same validity test applies: rerun `pnpm release:plan` only
when an accepted fix changes semantic-version classification, materially
changes release-note content, or proves the plan invalid or stale. Otherwise
commit and push the scoped fix without release-plan churn.

The `dev` to `main` release-prep and publish workflow is outside ordinary
feature implementation. Do not open, merge, or operate that promotion path
unless the user explicitly requests release work.

## Delegated Fable-to-Opus review handoff

When Fable is the implementation contractor, it owns the bounded ticket through
the initial external handoff above, not the interactive reviewer-observation
cycle. Fable must:

- complete implementation, local validation, documentation and Architecture
  Record dispositions, scoped Conventional Commit(s), release plan, push,
  ready PR into `dev`, Linear `In Review`, and current CI-status report;
- add an observable `Review handoff` note to the PR description and completion
  report naming the PR URL, handed-off head SHA, and required follow-up:
  `Opus 5 — ADDRESS_REVIEW_COMMENTS`;
- state that Fable has not processed PR feedback and report feedback already
  visible at handoff without acting on it; and
- stop without waiting for reviewers, replying to or resolving review threads,
  amending implementation from feedback, or merging the PR.

A separate Opus 5 `ADDRESS_REVIEW_COMMENTS` task then executes
`ai/prompts/codex-review.md` and `ai/rules/github-review-lifecycle.md`. That task
owns authoritative thread inspection, independent feedback decisions, accepted
fixes, replies, resolution, later pushes, and the bounded reviewer cycle. Its
decision ledger, commits, replies, resolved threads, validation, and
review-budget disposition provide the observable completion record.

This delegation changes ownership, not definition of done. It does not relax
scope, validation, release-plan, documentation, Architecture Record, approval,
PR, Linear, CI-reporting, or reviewer-completion requirements. Fable may handle
PR feedback only when the user explicitly overrides the boundary in the current
request.

## Final verification

Before reporting an implementation complete:

- confirm the request and, when present, ticket acceptance/done criteria and
  locked decisions are satisfied without unrelated scope;
- confirm required local checks pass or every skip is materially justified;
- confirm documentation-impact and Architecture Record dispositions;
- for external handoff, confirm Conventional Commit history, release plan,
  ready PR into `dev`, current checks, and Linear `In Review` when applicable;
- complete the applicable reviewer cycle within its proportional review budget
  or record the delegated Fable-to-Opus handoff; and
- report remaining risk, blocked items, and independently reviewable follow-up.

## Completion report

Lead with the outcome and include only relevant items:

- PR and Linear status, or the local-only boundary;
- changed scope;
- checks and current GitHub status;
- release-plan state when applicable;
- documentation-impact disposition;
- Architecture Record disposition;
- reviewer state when applicable; and
- remaining risks, blockers, or follow-up work.

Definition of done: requested behavior and ticket criteria are satisfied;
required checks pass or skips are justified; changes remain scoped; the
documentation and Architecture Record decisions are recorded; and the requested
local-only or end-to-end handoff is complete.
