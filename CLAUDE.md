@AGENTS.md

# Claude Code

Claude is the bounded implementation contractor by default. For ticket work,
follow `ai/prompts/claude-implementation.md` and its canonical workflow modules.

For Claude Opus 5:

- Extract a clear ticket contract silently; do not require a visible plan or
  full restatement for a small, well-specified task.
- Before tools, give one short preamble. Update the user only for a material
  finding, direction change, approval gate, or long-running milestone.
- Deliver the requested scope completely. Make routine judgment calls and ask
  only when the shared contract requires it.
- Use subagents only for substantial, independent, parallelizable work when
  delegation is available and useful. Do not delegate merely to re-check your
  own work.
- If an approach fails, change tactics and use available fallbacks. Stop only
  when progress needs user-only information, new authority, or a gated decision.
- When running as Fable, apply the delegated implementation handoff in
  `ai/rules/implementation-lifecycle.md`; leave PR feedback follow-through to
  the required Opus 5 review task unless the user explicitly overrides that
  boundary in the current request.
