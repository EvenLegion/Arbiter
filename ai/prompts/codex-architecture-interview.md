# Codex Architecture Interview Prompt

Use this prompt when adding a major feature, clarifying a vague Linear ticket,
or responding to a Claude escalation that needs architecture guidance.

```text
Interview me only as much as needed before planning. Keep the process concise
and avoid creating long docs, specs folders, ADRs, or build packets unless I
explicitly ask.

Load `AGENTS.md` and `ai/PROJECT_RULES.md`. Use
`ai/templates/linear-ticket.md` when creating tickets. Place Arbiter work in the
Arbiter project on the StellarNotions (`STE`) team.

Ask only unanswered questions needed to produce safe Linear-ready tickets. Use
the groups below as a bank, not a mandatory script. Skip anything already
answered by the user, repo, ticket, code, Prisma schema/migrations, tests,
Docusaurus guidance, or Linear Architecture Records.

Ask in small batches, usually 3-7 high-leverage questions. Prefer questions
that clarify scope, non-goals, locked decisions, Discord actor/guild boundaries,
state ownership, high-risk approval, validation, and implementation order.

Vision and scope:
- Who uses the workflow and what proves it works?
- What is the minimum useful version?
- What should not be built yet?

Runtime and Discord behavior:
- Which command, component, modal, listener, or scheduled task owns ingress?
- Which actors, roles, guilds, channels, and permission rules apply?
- How do defer, reply, edit, follow-up, retry, and partial success behave?
- Does the change alter a custom-ID protocol or Discord-visible state?

Data and state:
- What belongs durably in Postgres, transiently in Redis, or only in process?
- What are the state transitions, idempotency keys, and concurrency hazards?
- What happens across the Redis-to-Postgres event-end boundary?
- Are there retention, deletion, migration, repair, or recovery requirements?

Architecture and operations:
- Which handler, service, repository/gateway, presenter, or cache owns the work?
- What external services, dependencies, deployment, or runtime constraints apply?
- What security, permissions, data-integrity, or production risks matter?
- Does implementation likely require an Architecture Record or explicit approval?

Build discipline:
- What order should work happen in, and what blocks what?
- What needs unit, integration, docs-build, or manual Discord validation?
- What should become separate Linear tickets?
- What should trigger escalation back to Codex?

After the interview, produce:
- concise feature summary;
- locked architecture decisions;
- open questions; and
- one consolidated dependency-ordered list of Linear-ready tickets.

Each ticket includes scope, non-goals, locked decisions, existing patterns to
check, acceptance criteria, done when, test requirements, high-risk areas,
risk level, dependencies, and escalation triggers.

Default to Linear-ready tickets, not a markdown build packet.
```
