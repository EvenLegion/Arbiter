# Release Plans

This file is the canonical owner of release-plan classification and public-copy
requirements. The implementation lifecycle owns when planning, checking, and
handoff occur; this file owns what a plan means and how its public note is
classified.

## Contribution contract

Every externally handed-off working branch owns one schema-version 2 plan. The
plan is always a provenance and semantic-version record, but it is not always a
public release bullet.

Before creating or regenerating a plan, classify it explicitly:

- `standalone` — one complete, independently understandable outcome. Requires a
  public description and section; group must be absent.
- `contribute` — one staged contribution to a named capability. Requires a
  stable lowercase kebab-case group and section; description must be absent.
- `publish` — the single final public description for a named capability group.
  Requires the group, description, and section. Inspect every pending plan in
  the group before writing the release-level outcome.
- `internal` — provenance and versioning only. Group, description, and section
  must be absent.

Every plan also requires `contributionSummary`: concise implementation context
for maintainers. It is never rendered as Discord or changelog copy. Commit
metadata remains intact for traceability regardless of public-note mode.

A capability group must have exactly one `publish` plan before release prep.
Every `contribute` and `publish` plan in the group must use the same section.
Release preparation fails rather than guessing when the publisher is missing,
duplicated, or conflicts with group metadata.

## Creation and reuse

Create a missing plan only after scoped Conventional Commits exist. Supply the
semantic bump, classification, and contribution summary explicitly. Examples:

```bash
pnpm release:plan -- --bump patch --mode internal \
  --summary "Updates repository-owned release validation and preview tooling."

pnpm release:plan -- --bump minor --mode contribute \
  --group member-directory --section Features \
  --summary "Adds the canonical member-directory read model."

pnpm release:plan -- --bump minor --mode publish \
  --group member-directory --section Features \
  --description "Approved Even Legion tools can read Arbiter's current member directory, including division memberships, merit totals, and ranks, with safe filtering and usage limits." \
  --summary "Exposes the completed member-directory capability to approved integrations."
```

Reuse a valid plan after routine later commits. Regeneration must repeat the
complete intended classification and supply `--regenerate`, the intended bump,
and `--reason`.

## Public descriptions

Only `standalone` and `publish` plans carry public descriptions. Describe the
completed release-level outcome, not the implementation step performed by the
current PR.

- Start with what Arbiter now lets members, staff, operators, or approved tools
  do or learn.
- Prefer two sentences and roughly 40-80 words unless more context is essential.
- Include two or three concrete capabilities that distinguish the outcome.
- Assume no understanding of software architecture or web-security vocabulary.
- Avoid terms such as OAuth, endpoint, route, read model, contract, Postgres,
  Redis, CORS, CSRF, HMAC, frontend, backend, artifact, topology, or
  infrastructure unless the term is essential and immediately explained by its
  user benefit.
- A recognized product term such as member-directory API is acceptable when the
  same sentence explains what it provides.
- Replace mechanism lists with audience meaning, such as only authorized staff
  can access the website.
- Do not announce tests, developer tools, internal documentation, or supporting
  services as member features.
- Do not use future, foundation, or behind-the-scenes framing when the grouped
  release completes the capability.
- Do not repeat no-member-impact disclaimers for every staged contribution;
  `contribute` and `internal` plans emit no public note.

Avoid: `Adds Discord OAuth sessions, exact-origin browser protection, and API authorization.`

Prefer: `Authorized staff can sign in to Arbiter's staff website with Discord and manage which approved tools can access the member directory.`

Before accepting copy, check whether a nontechnical Discord member could explain
the feature, whether the note describes the final group outcome, and whether
another pending plan would sound like the same feature.

## Preview, migration, and release prep

Run `pnpm release:preview` on `dev` or a release-preparation checkout to validate
all pending plans and render the exact consolidated notes plus provenance
manifest without writing, staging, deleting, versioning, or committing anything.
Release preparation uses the same aggregation result, considers every plan's
bump, writes public notes and a provenance manifest, and only then consumes all
included plans.

Schema-version 1 plans are never classified implicitly. Migrate each one with
`pnpm release:plan:migrate`, supplying the file, mode, summary, and any fields
required by that mode. Review and commit the result explicitly. Migration
preserves branch and commit provenance while retiring the legacy per-commit
public-label field.
