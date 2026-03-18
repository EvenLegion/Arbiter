---
title: Testing And Refactors
sidebar_position: 2
---

# Testing And Refactors

## Test Layers

The repo uses two main test layers:

- unit tests for pure logic, service branching, presenters, and edge helpers
- integration tests with Testcontainers for Postgres and Redis-backed workflows

Current commands:

```bash
pnpm test
pnpm test:unit
pnpm test:integration
```

- `pnpm test`
  Runs the default Vitest suite. Use it as the main pre-PR confidence check.
- `pnpm test:unit`
  Runs only the unit-test layer. Use it while iterating on pure logic, presenters, and service branching.
- `pnpm test:integration`
  Runs the Testcontainers-backed integration suite. Use it when persistence, Redis, or repository-backed workflows change.

## Runtime Notes

Integration tests require a working container runtime.

If Docker is unavailable, `pnpm test:integration`, which runs the storage-backed test layer, exits cleanly without running suites. That is useful for local work on machines without containers, but real persistence changes should still be validated with Docker available.

## What To Test

### Unit tests

Use unit tests for:

- pure parsing and formatting logic
- service result branching
- presenters and payload builders
- shared edge helpers like preflight, autocomplete, and responder behavior

### Integration tests

Use integration tests for:

- repositories
- persistence-backed workflows
- Redis tracking flows
- changes where the important behavior is coordination between service and storage

## Safe Refactor Workflow

1. read the relevant feature page in these docs
2. identify the handler, service, adapter, presenter, and repository involved
3. update unit tests for changed branching or presentation
4. update integration tests if persistence or Redis behavior changes
5. run:

```bash
pnpm typecheck
pnpm eslint src tests
pnpm test
pnpm docs:build
```

- `pnpm typecheck`
  Verifies TypeScript contracts. Use it after refactors and interface changes.
- `pnpm eslint src tests`
  Lints runtime and test code. Use it before opening a PR and after structural edits.
- `pnpm test`
  Runs the main test suite. Use it as the default final validation step.
- `pnpm docs:build`
  Builds the docs site. Use it when code changes affect documented paths, structure, or workflows.

## When Manual Discord Validation Still Matters

Automated tests cover most maintainable behavior, but manual Discord validation is still useful for:

- slash-command registration issues
- permission errors in the live client
- unusual Discord UI behavior around buttons, embeds, or modals

Use this rule:

- business behavior:
  automated tests
- Discord transport quirks:
  manual validation

## Failure Triage

- state transition or validation issue:
  start in the service
- copy, embeds, buttons, or pagination UI:
  start in the presenter or payload builder
- wrong rows or wrong persisted state:
  start in the repository or integration test
- Discord plumbing or preflight issue:
  start in the handler or shared edge helper

## Read This Next

- For code placement rules:
  [Codebase Terminology](/architecture/codebase-terminology)
- For feature entrypoints:
  [Command And Interaction Catalog](/reference/command-and-interaction-catalog)
- For docs update rules:
  [Maintaining Docs](/contributing/maintaining-docs)
