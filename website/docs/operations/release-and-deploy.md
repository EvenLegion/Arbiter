---
title: Operations
sidebar_position: 7
---

# Operations

This page covers the parts of Arbiter most contributors do not need every day: release prep, promotion to production, and production deployment itself.

If you are new to the repo, you can skip this page until you are preparing a release or operating the production stack.

## Release Model

Arbiter uses a release-plan workflow built around the `dev` to `main` promotion path. The important idea is that release intent is reviewed in git before the actual release is published.

### Branch Flow

At a high level:

- feature work lands on a working branch
- feature branches merge into `dev`
- `dev` is promoted to `main`
- a merged `dev` to `main` PR triggers publishing

### Contributor Expectations

Each working branch owns exactly one release plan by the time it is pushed for
review. That plan is a contribution and provenance record; it is not
automatically a public release bullet. Before every push from a working branch,
run:

```bash
pnpm release:plan:check
```

The checker reads every JSON file under `.release-plans/` and treats the parsed
`branch` field as authoritative. It fails when no plan or multiple plans own the
current branch. It also checks schema version 2, explicit public-note
classification, contribution metadata, the `origin/dev` base, current merge
base, semantic bump and target version, and recorded commit ancestry. The check
is read-only and leaves the worktree unchanged.

Reuse the matching plan when it:

- parses successfully
- records the current branch
- uses `origin/dev` as its base
- records the current merge base with `origin/dev`
- still has the intended semantic bump, contribution summary, classification,
  capability group, and public-copy scope

A routine later implementation or review-fix commit does not by itself make a
valid plan stale. Do not run the planner again merely because the branch moved
forward.

If no matching plan exists, first commit the scoped work with Conventional
Commit subjects, then choose the smallest intended semantic bump and classify
the contribution explicitly. Internal work records provenance without a public
note:

```bash
pnpm release:plan -- --bump patch --mode internal \
  --summary "Updates repository-owned release validation and preview tooling."
```

Use `standalone` for one complete public outcome:

```bash
pnpm release:plan -- --bump minor --mode standalone --section Features \
  --description "Members can now see complete event attendance and merit outcomes in one review flow, including the final duration, participant decisions, and awarded totals." \
  --summary "Completes the event review presentation and final outcome reporting."
```

Use `contribute` for a staged part of a named capability and `publish` exactly
once for the plan that supplies the group's final public description:

```bash
pnpm release:plan -- --bump minor --mode contribute \
  --group member-directory --section Features \
  --summary "Adds the canonical member-directory read model."

pnpm release:plan -- --bump minor --mode publish \
  --group member-directory --section Features \
  --description "Approved Even Legion tools can read Arbiter's current member directory, including division memberships, merit totals, and ranks, with safe filtering and usage limits." \
  --summary "Exposes the completed member-directory capability to approved integrations."
```

Group identifiers use stable lowercase kebab case. Every plan in a group uses
the same section, and the group must have exactly one publisher before release
prep. A publish-plan author must inspect every pending plan in the group before
writing the description.

Use `minor` or `major` instead of `patch` when compatibility or member-facing
impact requires it. The script:

- compares your branch against `dev`
- collects Conventional Commit subjects from the branch
- uses the explicit `patch`, `minor`, or `major` bump
- validates the explicit public-note mode and its required fields
- writes a release-plan file under `.release-plans/`
- commits that plan file when needed

Running the same command again with an already-valid plan prints that it is
reusing the plan and performs no writes, staging, or commits.

If the script cannot find meaningful Conventional Commit history, it fails instead of guessing.

Only `standalone` and `publish` descriptions become user-facing changelog,
GitHub, and optional Discord copy. `contribute` and `internal` plans intentionally
emit no bullet. Keep `contributionSummary` concise and technical enough for
maintainers; it is provenance metadata and is never substituted for public copy.
Public descriptions explain the completed capability in language an average
Even Legion Discord member can understand, without file paths, ticket IDs, or
unexplained implementation and web-security terminology.

Regenerate an existing matching plan only when it names the wrong base, records
an obsolete merge base after a rebase, has the wrong bump, or no longer
represents the release-note scope. State the reason explicitly:

```bash
pnpm release:plan -- --regenerate --bump patch --mode internal \
  --summary "Updates repository-owned release validation and preview tooling." \
  --reason "the branch was rebased onto the current dev history"
```

Regeneration replaces only the plan whose parsed `branch` field owns the
current branch. An unreadable plan or duplicate branch-owned plans cannot be
chosen safely: repair or remove the specific bad file manually, then rerun the
checker. The tool never creates a second plan for the branch.

Good commit subjects look like:

- `feat: add ...`
- `fix: correct ...`
- `refactor: simplify ...`
- `docs: update ...`

The planner depends on those subjects for commit provenance. Public-note
classification and final public prose always come from explicit plan fields.

### Migrating Legacy Plans

Schema-version 1 plans are rejected with an actionable migration error because
the tooling must not infer whether old commit descriptions are standalone,
grouped, or internal. Migrate each file explicitly, for example:

```bash
pnpm release:plan:migrate -- --file old-plan.json --mode contribute \
  --group member-directory --section Features \
  --summary "Adds credential storage for the member-directory capability."
```

The migration keeps branch, version, and commit provenance, removes the legacy
per-commit public-label field, and writes schema version 2. Review, stage, and
commit the migrated plan. Supply `--description` for standalone or publish mode.

### Read-Only Release Preview

Before release preparation, run:

```bash
pnpm release:preview
```

The command validates every pending plan and capability group, resolves
available pull-request and contributor attribution, and prints the exact
consolidated notes plus provenance manifest. It does not bump a version, write
output, delete plans, stage, or commit. Missing publishers, duplicate publishers,
conflicting group sections, invalid public descriptions, and legacy schemas fail
with the affected group and plan names plus recovery guidance.

An unpushed working-branch commit can appear without GitHub attribution in a
local preview, with a warning to push and preview again. Release preparation is
strict: it fails before consuming plans if GitHub metadata cannot be resolved,
so the committed provenance manifest never silently drops available PR or
contributor attribution.

Release preparation also holds a repository-local `.release-publish.lock` from
preview through successful publication or rollback. Concurrent CLI or imported
callers fail instead of racing snapshots. If a process crashes and leaves the
lock behind, remove it only after confirming that no release preparation is
still running, then rerun the read-only preview before retrying publication.
Repository mutations roll back together if release preparation fails. GitHub
Actions output metadata is emitted only after those mutations complete, with
`release_created=true` written last; an output-channel failure therefore cannot
advertise a rolled-back release as successful.

Review the combined preview as one announcement. The Discord publisher truncates
the release-note embed at 4,000 characters, so consolidate overlapping outcomes
before release prep instead of relying on truncation.

### Release Prep On `dev`

When a `dev` to `main` pull request is opened or updated, the release-prep workflow:

- reads pending release plans
- computes the highest required version bump
- validates and consolidates public notes with the same logic as the read-only
  preview
- updates `package.json`
- updates `CHANGELOG.md`
- generates release notes into `.release-output/`
- generates a deterministic provenance manifest in `.release-output/` with
  every consumed plan, commit, associated pull request, and contributor
- removes consumed release plans
- opens or updates a release-prep PR back into `dev`

That release-prep PR should be reviewed and merged into `dev` before `dev` is merged into `main`.

### Publish On `main`

When the `dev` to `main` PR is merged, the publish workflow:

- resolves the version from `package.json`
- creates the git tag
- creates the GitHub release
- uses the generated release notes already merged into `main`
- optionally posts a release announcement to Discord if the webhook secret is configured

The publish job expects the release notes to already exist. It is a publish step, not a note-authoring step.

## Production Model

The production Docker stack defines:

- a migration container
- the bot runtime container
- the standalone API runtime container
- Redis
- Loki
- Alloy
- Grafana

The independently buildable `Dockerfile.api` is used by both the local-only `docker-compose.api.yml` and the production stack. Production Compose prepares the API beside the bot, reusing the existing external Postgres database and Redis service. It binds to loopback by default and does not create or configure the required HTTPS reverse proxy, DNS, certificates, firewall rules, secrets, migration execution, or deployment. Those remain explicit operator actions requiring separate approval. Follow the [API and portal deployment-readiness runbook](../api/deployment-readiness.md).

The API follows the production observability contract: it writes structured JSON to `API_LOG_FILE_PATH`, defaults to `logs/api.log`, and Alloy assigns that file `service=arbiter-api` before shipping it to Loki. Local source and API-container runs share `./logs` with the observability stack. Production Compose mounts `API_LOGS_DIR` into the API and read-only into Alloy; the service must not bypass the redaction and request-ID fields already established here.

Postgres is not part of the production compose stack. Production expects an external database reachable through `DATABASE_URL`.

The API image uses the same canonical generated Prisma client and `DATABASE_URL`, opens a separately bounded pool, and reuses the existing Redis service under `arbiter:api:v1:`. It contains no Discord bot token requirement and no portal runtime. Build and smoke-test it without deploying it:

```bash
pnpm build:api
pnpm api:container:smoke
```

### Runtime Dependency Verification

Arbiter's production images require Node.js 22.12.0 or newer and earlier than Node.js 23, and install with the repository's pinned pnpm 10 release. Dependency security checks must verify both the lockfile and the pruned images:

1. run `pnpm audit --prod` against the workspace lockfile
2. build both the final bot runtime and migration targets from the committed manifest and lockfile
3. record the immutable image digest for each target and verify that each reports a Node.js version in the supported range
4. inspect the installed package graph inside both final targets
5. confirm that patched versions are present on Discord, Postgres, Prisma, Redis, and scheduled-task paths

Do not treat every package stored under pnpm's virtual store as application-reachable. Check whether the final image exposes the package through Node resolution and whether compiled runtime code imports it. Prisma peer tooling can leave helper packages in the image even when the Prisma CLI and their optional server dependencies are not resolvable at runtime.

Any accepted audit exception must record the advisory, complete package path, runtime reachability evidence, owner, expiration date, and removal trigger. A severity-only suppression or workspace-only audit is not enough.

### Why The Migration Container Exists

Schema migration is an explicit deployment step rather than an invisible side effect of bot startup. That separation makes failed migrations easier to reason about and keeps the runtime container focused on running the bot.

## Production Inputs

Use `.env.example` as the source of truth for supported configuration.

At minimum, production needs:

- `NODE_ENV=production`
- `DATABASE_URL`
- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- the Discord role and channel IDs the bot depends on

The standalone API additionally requires `API_DISCORD_CLIENT_ID`, `API_CREDENTIAL_PEPPER`, and `API_DISCORD_CLIENT_SECRET`. Store the pepper and client secret only in the API runtime's secret configuration and do not inject either into the bot, portal, logs, build artifacts, or migration command. Use at least 32 randomly generated characters for the credential pepper. Changing it invalidates every existing API credential, so rotation requires an explicit credential-remint and cutover plan. Rotating the Discord client secret requires updating only the API runtime and the Discord application; existing browser sessions remain valid until their Redis expiry or explicit revocation.

Configure `API_DISCORD_CALLBACK_URL`, `API_ALLOWED_ORIGINS`, and `API_AUTH_REDIRECT_URLS` as exact HTTPS values. Production should place the API and portal on custom hostnames under the same parent domain so the host-only `SameSite=Lax` API cookie remains compatible with browser credential rules. Wildcard CORS, unrelated redirect origins, and bot-token injection into the API are rejected boundaries, not deployment shortcuts.

### API Credential Migration And Rollback

The integration and credential migration is additive to Arbiter's existing Postgres database. It creates `ApiIntegration`, `ApiCredential`, their enum, indexes, and foreign keys to canonical `User` records. It performs no backfill, copy, synchronization, or production execution as part of development.

For an approved deployment:

1. take and verify the normal external Postgres backup
2. provision `API_CREDENTIAL_PEPPER` in the API runtime secret boundary
3. run the canonical `pnpm db:migrate` deploy step once against the existing database
4. verify the new tables, constraints, and migration record before starting API code that uses them
5. start the API with its bounded `API_DB_POOL_MAX`; keep enough connection capacity for the bot and operator access

Before migration, rollback is a normal code/image revert. After the additive migration has applied, an older bot or health-only API can run while leaving the unused tables in place. Dropping the tables, enum, or credential records is destructive and requires separate approval; do not improvise a production down migration. Restore from the verified backup only under the database recovery procedure and explicit operational authority.

Event Ping specifically requires both `EVENT_PING_CHANNEL_ID` and
`EVENT_PING_ROLE_ID`. The bot must be able to view and send messages in the
configured destination, access active event tracking threads and stored summary
messages, and mention the configured role. Startup fails configuration
validation when either Event Ping value is missing.

Operationally important values also include:

- log file configuration
- Redis connection settings
- persistent volume directories
- container resource limits
- Grafana credentials
- image tag overrides if you use them

The production Redis container defaults to a 1 GiB memory limit. The previous
256 MiB limit did not leave enough headroom for Arbiter's observed scheduler
workload. Override `REDIS_MEM_LIMIT` only from current host measurements, and
keep enough host memory available for the bot and observability containers.

Scheduled-task job history is also bounded at the queue level:

- completed jobs become eligible for removal after 24 hours, with at most 5,000
  records retained
- failed jobs become eligible for removal after seven days, with at most 1,000
  records retained

Both the age and count limit apply, so whichever boundary is reached first
selects older finalized history for removal. BullMQ performs that cleanup
lazily: a later successful job prunes eligible completed history, and a later
failed job prunes eligible failed history. The longer failed-job window
preserves useful diagnostics. These limits do not target active, delayed,
repeatable, or pending-retry jobs. Postgres remains the durable source of event
and review truth; Redis remains transient scheduling and tracking state.

## Persistent Host Data

The production stack expects persistent host directories for:

- bot logs
- API logs
- Redis data
- Loki data
- Grafana data
- Alloy data

The API log uses its own persistent `API_LOGS_DIR` mount. Alloy reads that mount separately from bot logs and labels the stream as `service=arbiter-api`. Production Compose will not create the API log path: provision it before startup with ownership matching `API_UID` and `API_GID`, following the API deployment-readiness runbook.

If those paths move or change ownership, update the environment configuration to match. The bot and Redis containers may run under explicit numeric users, so host ownership matters.

## First Deploy

A normal first deploy looks like this:

1. check out the repo on the host
2. create and secure `.env`
3. make sure the expected persistent directories exist
4. build the images
5. run the migration container
6. start the stack
7. inspect bot logs

Repo-specific commands:

```bash
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

Before running migrations against production, take a database backup or otherwise ensure you have a rollback plan for durable data.

The Event Ping rollout adds a nullable receipt timestamp and requires no
backfill. Apply the additive migration and set both Event Ping environment
values before starting the new bot image. A rollback may restore the prior bot
image and environment while leaving the nullable column in place. Removing the
column is destructive and is not part of the normal rollback.

## Normal Update Deploy

For a standard application update, the loop is the same:

```bash
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

Use `--force-recreate` when:

- images changed
- environment values changed
- a service is in a bad state and you want a clean replacement

## What To Verify After Deploy

At minimum, verify:

- the migration step completed successfully
- the bot container stays healthy and connected
- Redis is reachable from the bot
- logs are still being written to the expected mounted directory
- Alloy is shipping logs and Grafana can still query Loki

The bot log stream is usually the fastest first check after deployment.

### Redis and Scheduled-Task Verification

Production deployment and rollback require separate operational approval. Before
an approved deployment, retain the prior bot image under an immutable rollback
tag, preserve a secure copy of the active environment configuration, and record
the current measurements below. Never use `FLUSHALL`, `FLUSHDB`, volume removal,
or broad queue cleanup as part of this procedure.

Check the Redis container's current usage and configured memory ceiling:

```bash
docker stats --no-stream arbiter-v3-redis
docker compose -f docker-compose.prod.yml exec -T arbiter-redis sh -lc '
redis_cli() {
  if [ -n "$REDIS_PASSWORD" ]; then
    REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -n "${REDIS_DB:-0}" "$@"
  else
    redis-cli -n "${REDIS_DB:-0}" "$@"
  fi
}
redis_cli INFO memory | grep -E "^(used_memory_human|maxmemory_human|mem_fragmentation_ratio):"
redis_cli DBSIZE
'
```

Inspect only the scheduled-task queue counters. Completed and failed are
sorted-set history; active and waiting are lists; delayed and repeatable work
are sorted sets:

```bash
docker compose -f docker-compose.prod.yml exec -T arbiter-redis sh -lc '
redis_cli() {
  if [ -n "$REDIS_PASSWORD" ]; then
    REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli -n "${REDIS_DB:-0}" "$@"
  else
    redis-cli -n "${REDIS_DB:-0}" "$@"
  fi
}
printf "completed="; redis_cli ZCARD bull:scheduled-tasks:completed
printf "failed="; redis_cli ZCARD bull:scheduled-tasks:failed
printf "active="; redis_cli LLEN bull:scheduled-tasks:active
printf "waiting="; redis_cli LLEN bull:scheduled-tasks:wait
printf "delayed="; redis_cli ZCARD bull:scheduled-tasks:delayed
printf "repeatable="; redis_cli ZCARD bull:scheduled-tasks:repeat
'
```

After an approved deployment:

1. Confirm `arbiter-v3-bot` logs both `Logged in` and `runtime.initialized` and
   remains running.
2. Re-run the memory and queue-counter checks. A transient active count is
   normal; active, delayed, repeatable, and retry work must not disappear.
3. In the mounted bot log, confirm at least three consecutive
   `task.eventTrackingTick` entries with `task.completed`, spanning at least two
   configured tracking intervals. Also confirm no intervening `task.failed`
   entries for that flow.
4. Recheck memory and queue counts after the observation window. Finalized
   history should remain inside the documented count limits and memory should
   stay comfortably below the 1 GiB container ceiling.

If bot readiness, repeat scheduling, event-tracking ticks, or Redis health
regresses, redeploy the retained prior bot image and restore the prior approved
application configuration, but keep `REDIS_MEM_LIMIT` at 1 GiB or the current
higher value. Lower that limit only when fresh memory measurements explicitly
prove the smaller ceiling safe. Recreate the bot by default; recreate Redis only
for a separately approved Redis-specific correction. Do not delete the Redis
data directory. Rolling back the bot stops future pruning under the new policy,
but finalized history already removed by retention cannot be restored.

## Common Failure Modes

Release workflow failures:

- the planner ignored commits because the commit subjects were not Conventional Commit subjects
- `pnpm release:plan:check` found no branch-owned plan; commit the scoped work,
  then run `pnpm release:plan` with the intended bump, explicit mode, summary,
  and required mode-specific fields
- the checker found duplicate branch owners or unreadable JSON; repair or remove
  the named file and rerun the read-only check
- the wrong bump or a rewritten merge base invalidated a plan; confirm the cause,
  then use explicit `--regenerate`, `--bump`, full classification, and `--reason`
- release preview found a missing or duplicate group publisher, conflicting
  group sections, invalid public copy, or a legacy plan; correct the named plans
  or run the explicit migration command, then preview again
- the `dev` to `main` PR does not contain prepared release artifacts because the release-prep PR into `dev` was not merged
- generated release files were edited manually instead of coming from the workflow

Deployment failures:

- assuming production Postgres is in the compose stack when it is actually external
- skipping the migration container and hoping runtime startup will handle schema drift
- forgetting to create or mount persistent host directories
- changing container user IDs without fixing host ownership
- checking only container health instead of the actual bot logs

## Operational Notes

- Production uses the same file-first logging model as development, so deployment issues usually show up either as "the bot failed to start" or "the bot started but logs are not being shipped."
- Redis is part of the production stack because event tracking depends on it. If Redis is down, live event workflows will degrade even if the bot process is still alive.
- Because Postgres is external, database reachability is one of the first things to verify when the bot fails early in production.
