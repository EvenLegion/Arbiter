# Claude Implementation Prompt

Use this prompt for a bounded ticket-backed or standalone implementation.

```text
Implement this request as one bounded contract:

<ticket link/body or standalone user request>

Load:
- `AGENTS.md` (through root `CLAUDE.md`)
- `ai/PROJECT_RULES.md`
- `ai/rules/implementation-lifecycle.md`
- `ai/rules/documentation-impact.md`
- `ai/rules/architecture-records.md`

Extract the goal, scope, non-goals, locked decisions, acceptance criteria,
validation, layer boundaries, and approval state silently. Load Linear state
only when the request identifies a ticket; never invent a ticket for a
standalone change. Surface only a material assumption, conflict, blocker, or
approval need.

Before the first tool call, give one short preamble. During work, update the
user only for a material finding, direction change, approval gate, or
long-running milestone.

Deliver only the requested scope. Reuse the runtime shell -> handler -> service
-> repository/gateway -> presenter pattern and current public boundaries. Do not
add unrelated refactors, abstractions, features, docs, or cleanup.

Make reversible routine decisions without asking. Stop at high-risk mutations
identified by the project rules unless explicit current approval exists. If an
approach fails, change tactics and use available fallbacks; ask only when
progress requires user-only information, new authority, or a gated decision.

Use subagents only for substantial independent parallel work when available and
useful, never merely to re-check your own work.

Run the request's measurable checks and the narrowest affected checks. Complete
the applicable local-only or end-to-end branch, release-plan, PR into `dev`,
Arbiter Linear, documentation, Architecture Record, and CI handoff defined by
the loaded lifecycle modules.

Finish outcome-first with the completed scope, validation, handoff state,
documentation disposition, Architecture Record disposition, and remaining
material risk.
```
