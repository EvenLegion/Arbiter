---
title: Maintaining Docs
sidebar_position: 3
---

# Maintaining Docs

The docs are part of the architecture surface of the repo. If the code shape changes, the docs should change in the same PR.

## When Docs Updates Are Required

Update docs when you change:

- a command, subcommand, autocomplete option, button, or modal surface
- a feature handler, service, presenter, gateway, or repository path referenced in docs
- the preferred extension pattern for a feature
- local-development or test expectations
- the meaning of a layer such as handler, service, gateway, or utility

## Docs Update Checklist

Before merging a change, check:

- did any referenced file path move?
- did a command or interaction surface change?
- did a contributor workflow change?
- did the preferred place for new code change?
- did a feature gain a new extension point or subdomain?
- did test or local-dev expectations change?

If the answer to any of those is yes, update the docs in the same change.

## Which Page Should You Update?

- onboarding or setup expectations:
  `onboarding/`
- shared runtime or transport pattern:
  `architecture/`
- workflow-specific behavior:
  `features/`
- entrypoint and ownership lookup:
  `reference/`
- contributor process:
  `contributing/`

## File Reference Rule

Every docs page that names source files should be checked after refactors.

Practical rule:

1. search the docs for the old filename or old path
2. update every reference in the same PR
3. run `pnpm docs:build`

## Minimum Validation For Docs Changes

Run:

```bash
pnpm docs:build
```

Also run normal code validation if the docs change is paired with application changes:

```bash
pnpm typecheck
pnpm eslint src tests
pnpm test
```

## Good Docs Changes

Good docs changes are:

- specific
- path-accurate
- task-oriented
- explicit about where to extend the code

Avoid:

- vague “look in the feature folder” guidance when a smaller set of files is known
- architecture claims that are no longer true
- feature pages that describe only behavior, but not where the code lives
