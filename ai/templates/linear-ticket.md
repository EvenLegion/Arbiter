# Linear Ticket Template

Use this structure by default for issues in the Arbiter project on the
StellarNotions (`STE`) team. Keep sections concise and omit sections marked
conditional when they do not apply.

## Title

## Goal

## Problem / context

## Scope

## Non-goals

## User-visible behavior

## Locked decisions

- [ ]

## Existing patterns and evidence to check

- [ ]

## Acceptance criteria

- [ ]

## Done when

- [ ]

## Test and validation requirements

- [ ] Unit coverage for deterministic rules, typed results, and presentation
      when applicable.
- [ ] Integration coverage for Prisma or Redis behavior when applicable.
- [ ] Manual Discord validation for command registration, autocomplete,
      components, modals, permissions, or gateway-listener behavior when
      applicable.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm docs:build`, or a
      documented narrower set justified by the change.

## Implementation boundary

- Relevant ingress and layer:
- Allowed files/areas:
- Forbidden files/areas:
- Dependencies and blockers:

## Risk and approval

- Risk level: Low / medium / high
- Current approval state: Not applicable / approved in current context /
  required before the named mutation.

Select `None`, or every applicable high-risk category:

- [ ] None
- [ ] Authentication, authorization, Discord permissions, or privileged roles
- [ ] Database schema or migrations
- [ ] Durable data deletion, production backfill, repair, restore, or another
      destructive operation
- [ ] Live Discord state or bulk role, nickname, channel, or member mutation
- [ ] Secrets, credentials, tokens, webhooks, or encryption
- [ ] Dependency installation
- [ ] Infrastructure, repository security settings, release publication, or
      production deployment
- [ ] Sensitive logging or observability

## Conditional impacts

Include only applicable items:

- Discord command, component, custom-ID, or permission impact:
- Postgres, Redis, schema, migration, backfill, rollback, or deployment-order
  impact:
- State-transition, idempotency, concurrency, or partial-success impact:
- Secrets, privacy, error, logging, or observability impact:
- Documentation-impact expectation:
- Architecture Record expectation:

## Escalation triggers

- [ ] A material requirement, acceptance criterion, or locked decision remains
      unresolved after evidence-first discovery.
- [ ] The work requires a new product, architecture, state-ownership,
      permission, data-model, dependency, infrastructure, or other gated
      decision.
- [ ] The requested scope does not fit one focused implementation and review
      pass.
- [ ] Referenced ingress, layer, schema, or contract does not exist.
- [ ] Tests or observed behavior contradict the requested contract.
- [ ] Progress requires user-only information or new authority.

## Review handoff

- [ ] Requested behavior and acceptance criteria are satisfied.
- [ ] Required local checks and manual validation pass, or skips are justified.
- [ ] Changes remain within the allowed scope and preserve layer ownership.
- [ ] Ticket branch, Conventional Commit(s), release plan, ready PR into `dev`,
      Linear status, and GitHub check state follow
      `ai/rules/implementation-lifecycle.md`, unless explicitly local-only.
- [ ] Documentation impact is recorded under
      `ai/rules/documentation-impact.md`.
- [ ] Architecture Record is added or intentionally skipped under
      `ai/rules/architecture-records.md`.
- [ ] Remaining risks and follow-up work are documented.
