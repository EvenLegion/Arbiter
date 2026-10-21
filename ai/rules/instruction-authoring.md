# Instruction Authoring

Load only when changing agent instructions, prompts, rules, or templates.

## Ownership and scope

Root `AGENTS.md` owns authority, model defaults, and routing. `CLAUDE.md` imports
it and contains only genuine Claude-specific deltas. Project Rules owns source
classification, scope, approval gates, and Arbiter invariants. Task procedures
belong in their routed workflow; human-facing concepts and runbooks belong in
`website/docs`. Keep one policy owner and link to it from direct consumers.

Admit a new rule for a concrete product, authority, security, persistence, or
platform constraint, or an evidenced recurring failure. Prefer positive,
observable instructions; retain explicit prohibitions for secrets, production,
destructive work, and approval boundaries. Reference repositories are read-only
design evidence. Record their actual path and revision; do not adopt their
business assumptions, commands, model launches, or permissions as Arbiter policy.

## Change and proof

1. Inspect branch, base, dirty state, actual loaders, linked rules, and direct
   consumers before editing. Read current source instead of assuming the active
   checkout, similarly named repository, or old branch is authoritative.
2. Put each rule at its narrowest reachable owner, update pointers, and remove
   replaced prose. Preserve project-specific constraints and classify material
   conflicts explicitly; retain the stricter Arbiter permission until the user
   decides otherwise. Do not add a second policy system or new test harness just
   to reorganize instructions.
3. Verify referenced paths, Markdown links/anchors, package scripts, and workflow
   sequencing against the task revision. Run `git diff --check` and available
   targeted Markdown formatting checks. Do not execute a documented production,
   repair, reset, credential, or release mutation merely to validate its syntax.
4. Run `pnpm docs:build` when rendered Docusaurus pages or their configuration
   change. Root/`ai` instruction-only edits need structural/reference checks and
   semantic review, not unrelated application suites. No dependency install or
   production access is implied by validation.
5. Check representative decisions: read-only review stays read-only; standalone
   edits stay local; ticket handoff retains its gates; dirty/concurrent work is
   preserved; high-risk work stops only at its exact gate; a clean review stops
   within budget; any push checks its release plan first. Use Astra when an
   independent review is requested. Static checks prove structure, not actual
   agent adherence; label unexecuted behavior as unverified.

Report changed owners/routes, preserved boundaries, reference revision, actual
checks and limitations, and unresolved policy decisions. Favor shorter reachable
guidance over copied summaries; do not impose arbitrary file-size quotas.
