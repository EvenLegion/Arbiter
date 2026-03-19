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

Before opening or updating a PR into `dev`, run:

```bash
pnpm release:plan
```

That script:

- compares your branch against `dev`
- collects Conventional Commit subjects from the branch
- asks which bump is intended: `patch`, `minor`, or `major`
- writes a release-plan file under `.release-plans/`
- commits that plan file when needed

If the script cannot find meaningful Conventional Commit history, it fails instead of guessing.

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

## Common Failure Modes

Release workflow failures:

- the planner ignored commits because the commit subjects were not Conventional Commit subjects
- the wrong bump was selected and `pnpm release:plan` needs to be rerun
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
