---
title: Release Contributions And Source Publication
sidebar_position: 8
---

# Release Contributions And Source Publication

This page covers git-reviewed release provenance and the `dev` to `main` source
publication path. It does not cover or authorize production deployment. For
artifact rollout, start at [Production deployment](../operations/production-deployment.md).

## Working-Branch Path

Every working branch handed off for review owns exactly one release plan. The
plan records provenance and semantic-version intent; it is not automatically a
public release note.

1. Commit the scoped work with Conventional Commit subjects.
2. Before every push, run the read-only branch check:

    ```bash
    pnpm release:plan:check
    ```

3. Reuse the matching plan when its branch, `origin/dev` base, merge base,
   semantic bump, contribution summary, and public-note classification remain
   correct. Later implementation or review commits do not by themselves make a
   valid plan stale.
4. If the branch has no plan, run `pnpm release:plan` once after the scoped
   commits exist. Choose the smallest correct bump and an explicit mode:

    | Mode         | Use it when                                                             | Public note |
    | ------------ | ----------------------------------------------------------------------- | ----------- |
    | `standalone` | The branch completes one independently understandable outcome           | Required    |
    | `contribute` | The branch is one staged part of a named capability group               | None        |
    | `publish`    | The branch supplies the single final description for a capability group | Required    |
    | `internal`   | The branch needs provenance and versioning but no member-facing note    | None        |

    ```bash
    pnpm release:plan -- --bump patch --mode internal \
      --summary "Updates operator release and recovery guidance."
    ```

    `standalone` also requires `--section` and `--description`. `contribute`
    requires a stable lowercase kebab-case `--group` and `--section`. `publish`
    requires all three and must describe the complete group after inspecting
    every pending contribution in it.

5. Inspect the generated schema-version 2 JSON and its automatic commit, then
   rerun `pnpm release:plan:check` before pushing.

Only `standalone` and `publish` descriptions become changelog, GitHub release,
or optional Discord copy. `contributionSummary` remains maintainer-facing
provenance. Public descriptions should explain the completed outcome in terms
an Even Legion member can understand, not list files, tickets, services, or
security mechanisms.

## Reuse, Regeneration, And Repair

Regenerate a branch-owned plan only when its branch or base is wrong, its merge
base changed after history was rewritten, its bump is wrong, or later work
materially changed its release-note classification or copy. Repeat the complete
classification and record the reason:

```bash
pnpm release:plan -- --regenerate --bump patch --mode internal \
  --summary "Updates operator release and recovery guidance." \
  --reason "the branch was rebased onto the current dev history"
```

The tool never creates a second parsed plan for the same branch. If JSON is
unreadable or multiple plans claim the branch, repair the named files manually
before rerunning the checker. Do not guess ownership from a filename.

Schema-version 1 plans require an explicit classification migration:

```bash
pnpm release:plan:migrate -- --file old-plan.json --mode contribute \
  --group member-directory --section Features \
  --summary "Adds credential storage for the member-directory capability."
```

Review and commit the migrated plan. Supply `--description` for `standalone` or
`publish` mode.

## Read-Only Release Preview

On `dev` or a release-preparation checkout, run:

```bash
pnpm release:preview
```

The preview validates all pending plans and capability groups and renders the
exact consolidated public notes plus provenance manifest. It does not change a
version, write release output, consume plans, stage, or commit. Correct missing
or duplicate group publishers, conflicting sections, invalid public copy,
legacy schemas, and missing GitHub attribution before release preparation.

If a crashed process leaves `.release-publish.lock`, remove it only after
confirming that no release preparation is running, then rerun the read-only
preview before retrying.

## Source-Publication Path

Source publication is a reviewed two-PR sequence:

1. Open or update the repository `dev` to `main` pull request.
2. The Release Prep workflow reads every pending plan, selects the highest bump,
   validates and consolidates public notes, writes the version, changelog,
   release notes, and provenance manifest, and opens or updates a release-prep
   pull request back into `dev`.
3. Review and merge the release-prep pull request into `dev`.
4. Update and review the `dev` to `main` pull request so it contains the prepared
   release artifacts.
5. Merging `dev` to `main` triggers the Release Publish workflow, which creates
   the git tag and GitHub release from the already-reviewed notes and may post
   the optional Discord announcement.

The publish workflow does not build or deploy the bot/API images, apply the
database migration, change DNS or the reverse proxy, or deploy the portal.

## Common Source-Release Failures

- No plan owns the working branch: commit the scoped work, create the explicitly
  classified plan once, and rerun the checker.
- Duplicate or unreadable plans: repair only the named plan files, then rerun the
  read-only check.
- A group lacks exactly one publisher: correct the pending group plans and rerun
  `pnpm release:preview`.
- The `dev` to `main` PR lacks prepared artifacts: merge the generated release-prep
  PR into `dev`, then update the promotion PR.
- Generated release files were edited by hand: restore the workflow-owned output
  and regenerate it through the release-prep path.

Publication and deployment remain separate even when they use the same source
revision. Continue with [Production deployment](../operations/production-deployment.md)
only after the release and an operator-approved rollout are both ready.

## Hotfix Source Publication

When explicitly approved, a production fix may bypass unreleased `dev` work:

1. Fetch `main` and `dev`. Create an isolated `hotfix/<slug>` branch from current
   `origin/main`. Verify this release matches the deployed source separately.
2. Backport only approved fixes. Review the complete diff against main and run
   the relevant tests on this base. A dev-based branch retargeted to main is not
   an isolated hotfix.
3. Commit the changes and create the usual branch-owned plan with `--bump patch`.
   Planning and checking automatically use `origin/main` for `hotfix/*` branches.
4. Open a draft hotfix-to-main PR when publication is authorized. Release Prep
   creates a preparation PR back into that hotfix branch, never into dev.
5. Review and merge the preparation PR into the hotfix branch. CI requires the
   prepared patch version, notes and provenance before publication. Re-review
   the final diff and obtain merge/release approval before merging into main.
6. Release Publish tags that merged revision and creates its GitHub release.
   Hotfix releases do **not** post the optional Discord announcement. Deployment
   and event recovery remain separate, explicitly approved operations.
7. Reconcile the released fix and release metadata back into dev in a reviewed
   follow-up. Do not promote dev to production to accomplish this.

`node scripts/release/hotfix-check.mjs` is read-only and accepts pending or
prepared state; `--prepared` requires generated artifacts. It rejects dev-only
commit ancestry, a stale main base, foreign pending plans, non-patch bumps and
missing prepared metadata. This cannot identify unrelated code copied or
cherry-picked under new commits: diff review remains necessary. If main advances,
update the hotfix and regenerate/review its plan and artifacts before merging.

The first hotfix introducing these workflow changes must be reviewed especially
carefully: no GitHub workflow run or production rollout is implied by local tests.

### Review Fixes After Hotfix Preparation

After preparation consumes the pending plan, `pnpm release:plan:check` validates
its retained source plan and generated artifacts instead. Ordinary review fixes
may be committed and pushed without creating another plan or incrementing the
version again. Re-run checks and inspect the full diff.

If the correction changes the release classification or public description,
commit local work first, then run `node scripts/release/hotfix-refresh.mjs`.
This restores the pending source plan, resets only the package version and
changelog to main, and removes this hotfix's generated notes/provenance. Review
and commit that artifact reset, then run `pnpm release:plan -- --regenerate`
with `--bump patch`, the complete intended classification and `--reason`.
The preparation workflow generates a new reviewed artifact PR for the same patch
version. Do not invent a second plan or prepare the next patch on top of an
unpublished hotfix. The refresh command requires a clean checkout and does not
commit, push or publish anything.

If main advances after preparation, **refresh before integrating the new main**.
The refresh validates the old preparation against its recorded base and restores
that base's release metadata, even when `origin/main` now points elsewhere.
Commit the reset, update the branch onto current main, resolve any conflicts,
and regenerate the plan explicitly against current main. If another release
advanced the version, the new plan correctly targets its next patch instead.
Do not publish the stale prepared artifacts. The refresh is deliberately an
artifact reset, not an automatic merge, rebase, or conflict resolver.
