---
title: Release Workflow
sidebar_position: 4
---

# Release Workflow

## What This Flow Is Optimizing For

Arbiter uses committed release plan files plus GitHub Actions around the `dev` to `main` promotion flow.

That design exists so:

- release intent is reviewed in git, not remembered later
- release notes are derived from Conventional Commit history
- the `dev` branch accumulates upcoming release metadata
- the `dev` to `main` PR becomes the release-preparation checkpoint

This is a single-version app release flow. The app version lives in `package.json`, and releases are tagged as `vX.Y.Z`.

## Contributor Workflow

Use this sequence on feature branches:

1. make normal commits with Conventional Commit subjects
2. before opening a PR into `dev`, run:

```bash
pnpm release:plan
```

`pnpm release:plan` scans your branch commits against `dev`, prompts for the intended version bump, and writes a release-plan file into `.release-plans/`. Use it before opening or updating a PR into `dev`.

3. commit the generated release plan file if the script did not already do it for you
4. open the PR into `dev`

The release planner:

- compares your branch against `dev`
- collects Conventional Commit subjects not yet in `dev`
- asks for the intended bump: `patch`, `minor`, or `major`
- writes a plan file into `.release-plans/`
- creates a release-plan commit

## Commit Message Expectations

Use Conventional Commit subjects where possible:

- `feat`
- `fix`
- `perf`
- `refactor`
- `docs`
- `test`
- `build`
- `ci`
- `chore`
- `style`

Why it matters:

- the release planner ignores non-Conventional subjects
- release note grouping depends on those commit types
- poor commit subjects produce poor release notes

## How Release Notes Are Grouped

The current grouping is:

- `feat` -> Features
- `fix` -> Fixes
- `perf` -> Performance
- `refactor` -> Refactors
- `docs`, `test`, `build`, `ci`, `chore`, `style` -> Maintenance

During release generation, GitHub metadata is used to map commits back to merged PRs when possible. That keeps release notes closer to contributor-visible work than raw commit lists.

## Automation Flow

### When `dev` is prepared for release

The workflow in `.github/workflows/release-pr.yml`:

- reads pending `.release-plans/*.json` files
- computes the highest requested bump
- updates `package.json`
- updates `CHANGELOG.md`
- writes generated notes into `.release-output/`
- removes the consumed release plan files from the generated prep branch
- opens or updates the release-prep PR

### When `main` receives the release

The workflow in `.github/workflows/release-publish.yml`:

- creates the git tag
- publishes the GitHub Release
- uses the already-generated notes merged into `main`

## Common Rules

- run `pnpm release:plan`, which generates the branch release metadata, before opening a PR into `dev`
- rerun it if you add more Conventional Commit commits later
- do not hand-edit release output unless the release process specifically expects it
- merge the generated release-prep PR into `dev` before merging `dev` into `main`

## Common Failure Modes

### The planner ignored a commit

Check the commit subject. If it is not a Conventional Commit subject, it will not contribute to the plan.

### The bump is wrong

Run `pnpm release:plan` again, which regenerates the branch release metadata, and choose the correct bump. The release bump is intentionally chosen manually.

### The `dev` to `main` PR is missing prepared release files

That usually means the release-prep PR into `dev` was not merged yet.

## Files And Directories To Know

- `.release-plans/`
  pending release metadata per branch
- `.release-output/`
  generated release artifacts used by automation
- `.github/workflows/release-pr.yml`
  release preparation automation
- `.github/workflows/release-publish.yml`
  publish/tag automation
- `scripts/release/`
  local release planning and publishing scripts

## Read This Next

- For general contributor workflow rules:
  [Adding Features](/contributing/adding-features)
- For local command usage:
  [Local Development](/onboarding/local-development)
- For runtime and deployment operations:
  [Production Deployment](/contributing/production-deployment)
