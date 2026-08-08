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
review. Before every push from a working branch, run:

```bash
pnpm release:plan:check
```

The checker reads every JSON file under `.release-plans/` and treats the parsed
`branch` field as authoritative. It fails when no plan or multiple plans own the
current branch. It also checks the schema, `origin/dev` base, current merge base,
semantic bump and target version, and recorded commit ancestry. The check is
read-only and leaves the worktree unchanged. It deliberately does not judge the
quality of release-note prose; contributors and reviewers remain responsible
for the public copy.

Reuse the matching plan when it:

- parses successfully
- records the current branch
- uses `origin/dev` as its base
- records the current merge base with `origin/dev`
- still has the intended semantic bump and release-note scope

A routine later implementation or review-fix commit does not by itself make a
valid plan stale. Do not run the planner again merely because the branch moved
forward.

If no matching plan exists, first commit the scoped work with Conventional
Commit subjects, then choose the smallest intended semantic bump explicitly:

```bash
pnpm release:plan -- --bump patch
```

Use `minor` or `major` instead when the compatibility or member-facing impact
requires it. The script:

- compares your branch against `dev`
- collects Conventional Commit subjects from the branch
- uses the explicit `patch`, `minor`, or `major` bump (or prompts in an
  interactive terminal when `--bump` is omitted)
- writes a release-plan file under `.release-plans/`
- commits that plan file when needed

Running the same command again with an already-valid plan prints that it is
reusing the plan and performs no writes, staging, or commits.

If the script cannot find meaningful Conventional Commit history, it fails instead of guessing.

Release-plan descriptions are user-facing. They feed the changelog, GitHub
release notes, and optional Discord release announcement. Each description
should explain in plain language what changed, why it matters, and what members
or operators will notice. For maintenance-only work, say clearly that the
change is behind the scenes and does not alter Discord commands or member
behavior. Avoid file paths, ticket IDs, and unexplained technical terms.

Regenerate an existing matching plan only when it names the wrong base, records
an obsolete merge base after a rebase, has the wrong bump, or no longer
represents the release-note scope. State the reason explicitly:

```bash
pnpm release:plan -- --regenerate --bump patch --reason "the branch was rebased onto the current dev history"
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

The planner depends on those subjects for classification and generated release notes.

### Release Prep On `dev`

When a `dev` to `main` pull request is opened or updated, the release-prep workflow:

- reads pending release plans
- computes the highest required version bump
- updates `package.json`
- updates `CHANGELOG.md`
- generates release notes into `.release-output/`
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

The production Docker stack currently runs:

- a migration container
- the bot runtime container
- Redis
- Loki
- Alloy
- Grafana

Postgres is not part of the production compose stack. Production expects an external database reachable through `DATABASE_URL`.

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

- completed jobs are retained for at most 24 hours and 5,000 records
- failed jobs are retained for at most seven days and 1,000 records

Both the age and count limit apply, so whichever boundary is reached first
removes older finalized history as later jobs finish. The longer failed-job
window preserves useful diagnostics. These limits do not target active,
delayed, repeatable, or pending-retry jobs. Postgres remains the durable source
of event and review truth; Redis remains transient scheduling and tracking
state.

## Persistent Host Data

The production stack expects persistent host directories for:

- bot logs
- Redis data
- Loki data
- Grafana data
- Alloy data

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
    redis-cli --no-auth-warning -a "$REDIS_PASSWORD" -n "${REDIS_DB:-0}" "$@"
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
    redis-cli --no-auth-warning -a "$REDIS_PASSWORD" -n "${REDIS_DB:-0}" "$@"
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
  then run `pnpm release:plan -- --bump patch` with the intended bump
- the checker found duplicate branch owners or unreadable JSON; repair or remove
  the named file and rerun the read-only check
- the wrong bump or a rewritten merge base invalidated a plan; confirm the cause,
  then use explicit `--regenerate`, `--bump`, and `--reason` arguments
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
