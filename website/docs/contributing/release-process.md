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

   | Mode | Use it when | Public note |
   | --- | --- | --- |
   | `standalone` | The branch completes one independently understandable outcome | Required |
   | `contribute` | The branch is one staged part of a named capability group | None |
   | `publish` | The branch supplies the single final description for a capability group | Required |
   | `internal` | The branch needs provenance and versioning but no member-facing note | None |

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
