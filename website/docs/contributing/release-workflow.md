---
title: Release Workflow
sidebar_position: 2
---

# Release Workflow

Arbiter uses a release-plan workflow built around the `dev` to `main` promotion path.

The important idea is that release intent is reviewed in git before the actual release is published.

## What The Workflow Is Optimizing For

The release process is designed to keep three things explicit:

- which changes are intended for the next release
- what version bump is expected
- what release notes should be generated

That is why the repo uses committed release plans instead of relying on someone to remember release notes later.

## The Branch Model

At a high level:

- feature work lands on a working branch
- feature branches merge into `dev`
- `dev` is promoted to `main`
- a merged `dev` to `main` PR triggers publishing

Release metadata is prepared before that final publish step.

## Contributor Flow On A Feature Branch

Before opening or updating a PR into `dev`, run:

```bash
pnpm release:plan
```

That script:

- compares your branch against `dev`
- collects Conventional Commit subjects from the branch
- asks you which bump is intended: `patch`, `minor`, or `major`
- writes a release-plan file under `.release-plans/`
- commits that plan file when needed

If the script cannot find meaningful Conventional Commit history on your branch, it fails instead of guessing.

## Commit Message Expectations

The release planner depends on Conventional Commit subjects.

Good examples:

- `feat: add ...`
- `fix: correct ...`
- `refactor: simplify ...`
- `docs: update ...`

Why it matters:

- the planner ignores commits it cannot classify
- generated release notes are grouped by commit type
- bad commit subjects turn into bad release notes

## What Happens When `dev` Is Prepared For Release

When a `dev` to `main` pull request is opened or updated, the release-prep workflow runs.

Its job is to:

- read pending release plans
- compute the highest required version bump
- update `package.json`
- update `CHANGELOG.md`
- generate release notes into `.release-output/`
- remove consumed release plans
- open or update a release-prep PR back into `dev`

That last step is important. The generated release artifacts do not magically appear on `dev`; they arrive through the release-prep PR and should be reviewed and merged there first.

## What Happens When `main` Receives The Release

When the `dev` to `main` PR is merged, the publish workflow runs.

It:

- resolves the version from `package.json`
- creates the git tag
- creates the GitHub release
- uses the generated release notes already merged into `main`
- optionally posts the release announcement to Discord if the webhook secret is configured

The release publish job expects the release notes to already exist. It is a publishing step, not a note-authoring step.

## Files And Directories To Know

- `.release-plans/`
  pending release metadata created from feature branches
- `.release-output/`
  generated release notes and output artifacts
- `scripts/release/`
  local release-planning and release-prep tooling
- `.github/workflows/release-pr.yml`
  release-prep automation
- `.github/workflows/release-publish.yml`
  publish automation

## Common Failure Modes

### The Planner Ignored My Commits

Check the commit subjects first. If they are not Conventional Commit subjects, the planner will not know how to classify them.

### The Wrong Bump Was Selected

Run `pnpm release:plan` again and choose the correct bump. The bump is intentionally a human decision, not something inferred blindly from commit type.

### The `dev` To `main` PR Does Not Contain Prepared Release Artifacts

That usually means the generated release-prep PR into `dev` has not been merged yet.

### A Contributor Edited Generated Release Files Manually

Avoid doing that unless the release automation itself is the thing being changed. Generated release artifacts should come from the workflow, not from ad hoc manual editing.

## Practical Rules

- run `pnpm release:plan` before opening a PR into `dev`
- rerun it if your branch gains more relevant commits later
- keep Conventional Commit subjects clean
- merge the release-prep PR into `dev` before merging `dev` into `main`
- treat generated release files as workflow output, not as handwritten docs

## What To Read Next

- contributor design and validation rules:
  [Making Changes Safely](/contributing/adding-features)
- production runtime operations:
  [Production Deployment](/contributing/production-deployment)
