---
title: Logging And Observability
sidebar_position: 4
---

# Logging And Observability

Arbiter treats logging as part of the runtime contract, not as an afterthought.

That matters because the bot owns long-lived workflows, background tasks, and side effects that are hard to debug from Discord alone.

## The Logging Model

Arbiter uses structured Pino logs with a file-first pipeline.

At runtime:

- the bot writes structured JSON logs to a file
- optional console output mirrors logs for local development
- Alloy tails the log file
- Loki stores the logs
- Grafana reads from Loki

The same basic flow exists locally and in production, which means a debugging technique learned in development still applies after deployment.

## Execution Contexts And Correlation

Every ingress creates an execution context.

That context carries:

- a request or event identifier
- a `flow` name
- transport metadata
- optional workflow-specific bindings

For interactive flows, the request identifier is usually the Discord interaction ID. For listeners and scheduled tasks, Arbiter generates or passes a context-specific ID instead.

This gives you a way to connect:

- the top-level ingress
- any child workflow logs
- side-effect failures
- user-visible error messages that include a request ID

## Why The `flow` Field Matters

The `flow` value is one of the most useful fields in the entire logging model.

It gives each ingress or workflow a stable, human-readable label that survives refactors better than line numbers or deeply nested file paths. When you are debugging behavior, searching for the flow is often faster than searching for a file.

## What Good Logs Look Like In This Repo

Good Arbiter logs usually answer three questions:

- what workflow was running
- what identifiers mattered
- whether the operation succeeded, failed, or only partially succeeded

Helpful bindings commonly include:

- Discord user ID
- guild ID
- command name or subcommand
- event session ID
- request ID
- action name

The repo already follows this pattern in commands, interactions, listeners, and tasks. New work should extend that pattern rather than inventing a new style.

## Logging Expectations By Layer

### Runtime Shells

Should log:

- ingress received
- ingress completed
- uncaught failure

### Feature Handlers

Should log:

- important rejection reasons when they matter operationally
- unexpected failures
- contextual identifiers that make the failure actionable

### Services

Services often return typed results instead of logging heavily themselves. That is fine. The important thing is that the caller logs meaningful outcomes when state changes, partial failures, or rejected transitions matter.

### Gateways And Side Effects

Side-effect helpers should log failures that otherwise disappear, especially when Discord operations fail after domain state already changed.

## Partial Success Matters

Several Arbiter workflows can succeed with warnings.

Examples:

- a domain update succeeded but a Discord DM failed
- an event channel was added but not every public confirmation message was posted
- nickname sync completed for most users but some members failed

Those should not be logged as clean success. Distinguish full success, rejection, unexpected failure, and partial success.

## Local Observability Workflow

For local debugging:

1. start the bot
2. optionally start `pnpm obs:up`
3. reproduce the issue
4. search by request ID, flow name, command name, event session ID, or user ID

Even without Grafana, the structured log file is still the ground truth.

## Production Observability Workflow

In production, the same identifiers matter:

- request ID from a user-visible error message
- flow name from logs
- event session ID for long-lived workflows
- Discord user ID for user-specific issues

The purpose of the file-first pipeline is to make the bot's logs durable and collectable without depending on an attached terminal session.

## Common Logging Mistakes

- logging only a generic error string without workflow identifiers
- failing to include request IDs in user-visible failure paths that require operator follow-up
- treating partial success as clean success
- hiding important failures inside swallowed Discord-side exceptions
- adding noisy debug logs everywhere instead of a few strong context-rich logs at meaningful boundaries

## Observability Config Ownership

Repo-owned observability config currently lives outside the runtime code in the observability and Docker configuration. When you change the logging pipeline, think in terms of the whole chain:

- bot log emission
- file destination
- log shipper
- log storage
- log viewer

## What To Read Next

- how execution contexts are created at ingress:
  [Request Flow And Extension Points](/architecture/discord-execution-model)
- the high-level runtime shape those logs belong to:
  [System Overview](/architecture/runtime-overview)
