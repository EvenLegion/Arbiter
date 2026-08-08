# Documentation Impact

This file is the single owner of the implementation documentation-impact
decision.

Update documentation when a change materially affects what a developer,
operator, integrator, or future contributor needs to know to use or safely
modify Arbiter, including:

- setup, prerequisites, scripts, ports, configuration, or local services;
- commands, components, permissions, custom-ID protocols, or supported Discord
  workflows;
- Postgres, Redis, migration, repair, error handling, logging, observability,
  testing, release, deployment, or operational procedures;
- layer boundaries, subsystem ownership, state ownership, extension points, or
  important invariants;
- a recurring failure mode that belongs in troubleshooting; or
- behavior that makes current guidance inaccurate or safety-relevantly
  incomplete.

Documentation captures stable concepts, workflows, boundaries, and invariants.
Link to canonical implementation sources for exhaustive fields and details that
would drift.

Documentation is normally unnecessary for an internal behavior-preserving
refactor, a bug fix restoring documented behavior, tests alone,
presentation-only polish, a routine dependency bump with no usage change, or a
small implementation detail. Correct any page the change makes inaccurate.

## Disposition

Every implementation handoff records exactly one:

1. `Updated` — list the pages changed.
2. `Not needed` — give a concise reason tied to this framework.
3. `Follow-up required` — link an independently reviewable Linear ticket and
   explain why documentation is substantial or depends on later work.

For standalone local-only work that genuinely needs later documentation but has
no Linear authority, report
`Deferred — no Linear ticket or external-handoff authority`. Do not invent or
create a ticket. Before external handoff, ask the user to identify an existing
Linear ticket or authorize creating one, then link the follow-up. Until that
decision is supplied, external handoff is blocked.

Update small, directly verifiable guidance in the same ticket. Never leave
current commands, configuration, safety guidance, or supported workflows
knowingly inaccurate.

## Information ownership

- Root `README.md`: product North Star, minimal onboarding, and links.
- Docusaurus under `website/docs`: contributor, architecture, feature, testing,
  troubleshooting, release, deployment, and operational guidance.
- Code, tests, Prisma schemas and migrations, package scripts, and
  configuration: exhaustive current implementation truth.
- Arbiter Linear tickets: requested scope, acceptance, status, handoff, and
  separately reviewable follow-up.
- Linear Architecture Records: durable decisions, rationale, boundaries,
  invariants, and extension guidance.
- `docs/audit/CODEX_AUDIT_LEDGER.md`: internal audit coverage, not public
  developer documentation.

Link these sources instead of copying policy among routing files, prompts,
README, Docusaurus, and Linear.
