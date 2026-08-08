# Architecture Records

This file is the single owner of the Architecture Record decision and format.
Completed Linear tickets in the Arbiter project are the project's long-term
architectural memory; do not create a parallel markdown ADR system by default.

## Decision

Add an Architecture Record when implementation establishes a durable decision
about infrastructure, Discord protocol or permission boundaries, a subsystem,
Prisma or Redis patterns, state ownership, caching, scheduled work, deployment,
observability, testing strategy, build/release tooling, dependencies, security,
performance, or a reusable framework pattern.

Normally skip a record for bug fixes, presentation-only changes, refactors with
no architectural change, simple CRUD, tests, documentation edits, routine
dependency bumps, and small implementation details.

Agents decide automatically. For ticket-backed work, append a required record
to the Linear ticket before moving it to `In Review` or `Done`; otherwise record
an intentional skip with the reason.

For standalone local-only work, a change that would require a record remains
provisional. Report `Deferred — no Linear ticket or external-handoff authority`
and do not invent a ticket or create a parallel ADR. Before external handoff,
ask the user to identify an existing Linear ticket or authorize creating one,
then append the record before opening the PR. Until then, external handoff is
blocked rather than silently omitting durable memory.

## Content

Write scan-first durable engineering intent, not a changelog, PR summary, file
inventory, implementation-minutiae essay, or dense paragraph. Aim for roughly
300-800 words; use more only when it materially improves future maintenance.

Use this structure:

### Architecture Record

**Status**

- Accepted, provisional, or intentionally limited.

**Problem**

- The durable problem being solved.

**Decision**

- The architectural decision.

**Rationale**

- Why this approach was selected.

**Alternatives Considered**

- Relevant alternatives and why they were rejected.

**Architecture**

- Components, high-level data flow, and interaction with the rest of Arbiter.

**Important Invariants**

- Assumptions and rules future changes must preserve.

**Contributor Guidance**

- Expected patterns and approaches to avoid.

**Extension Points**

- Where future work should plug in.

**Known Limitations**

- Intentional limits and expected improvements.

**Future Change Triggers**

- Evidence or conditions that should reopen the decision.

**Future Codex Guidance**

- Patterns to reuse and common mistakes to avoid.
