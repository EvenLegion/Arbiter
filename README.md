# Arbiter v3

## Table of Contents

- [Arbiter v3](#arbiter-v3)
    - [Table of Contents](#table-of-contents)
    - [Stack](#stack)
    - [Requirements](#requirements)
    - [Local Development](#local-development)
    - [Script Reference](#script-reference)
    - [Release Workflow](#release-workflow)
    - [Environment Variables](#environment-variables)
    - [Logging Behavior](#logging-behavior)
    - [Production Deployment (VPS)](#production-deployment-vps)
        - [1) One-Time VPS Hardening](#1-one-time-vps-hardening)
        - [2) Prepare Persistent Host Directories](#2-prepare-persistent-host-directories)
        - [3) First Production Deploy](#3-first-production-deploy)
        - [4) Ongoing Deploys and New Migrations](#4-ongoing-deploys-and-new-migrations)
        - [5) Runtime Verification and Operations](#5-runtime-verification-and-operations)
        - [6) Start/Stop Bot Container Only](#6-startstop-bot-container-only)
        - [7) Apply a Code Upgrade](#7-apply-a-code-upgrade)
    - [Migration Folder Purpose](#migration-folder-purpose)

## Stack

- Sapphire framework (`@sapphire/framework` + subcommands/scheduled-tasks/utilities-store)
- Discord.js v14
- Prisma + PostgreSQL
- Redis (event tracking + scheduled tasks backend)
- Pino logging (`pino`, `pino-pretty`, optional Better Stack via `@logtail/pino`)

## Requirements

- Node.js 22+ recommended for local development
- pnpm 10.11.0 (pinned via `packageManager` in `package.json`)
- Docker + Docker Compose plugin
- Discord bot token + guild configuration in `.env`

## Local Development

1. Install dependencies.

```sh
pnpm install
```

2. Create local env file.

```sh
cp .env.example .env
```

3. Start local Postgres and Redis.

```sh
pnpm db:up
pnpm redis:up
```

4. Apply Prisma migrations.

```sh
pnpm db:migrate
```

5. Run the bot.

```sh
pnpm dev
```

Optional local helpers:

```sh
pnpm typecheck
pnpm lint
pnpm db:studio
```

Stop local infra:

```sh
pnpm db:down
pnpm redis:down
```

Reset local infra volumes:

```sh
pnpm db:reset
pnpm redis:reset
```

## Script Reference

App/runtime:

- `pnpm dev` - run bot from TypeScript source
- `pnpm build` - compile TypeScript
- `pnpm start` - run compiled bot (`dist/index.js`)
- `pnpm typecheck` - TypeScript type-check only
- `pnpm lint` - eslint

Database and seeding:

- `pnpm db:generate` - Prisma client generate
- `pnpm db:migrate` - `prisma migrate deploy`
- `pnpm db:seed` - main Prisma seed
- `pnpm db:seed:guild-members`
- `pnpm db:seed:events`
- `pnpm db:seed:event-merits`
- `pnpm db:seed:non-event-merits`

Migration data utilities:

- `pnpm db:fetch:guild-members`
- `pnpm db:fetch:event-sessions`
- `pnpm db:verify:merit-rank`
- `pnpm db:migrate:users` (fetch + seed guild members)

Release utilities:

- `pnpm release:plan` - scan current branch commits since `dev`, prompt for bump, and write a release plan file into `.release-plans/`
- `pnpm release:publish` - consume accumulated release plans, bump `package.json`, update `CHANGELOG.md`, and generate release notes output

Local docker services:

- `pnpm db:up | db:down | db:reset`
- `pnpm redis:up | redis:down | redis:reset | redis:logs`

Production docker helpers:

- `pnpm prod:build | prod:up | prod:down | prod:logs`

## Release Workflow

This repo uses committed release plan files plus GitHub Actions around the `dev` -> `main` release PR.

Why this exists:

- release notes are generated from actual Conventional Commit messages, not handwritten summaries
- release metadata is captured before a PR merges into `dev`, so release intent is explicit and reviewable in git
- `dev` becomes the accumulation branch for upcoming release notes
- the `dev` -> `main` PR becomes the release preparation point: pending release plans are consumed there, and merging that PR creates the tagged GitHub Release

This is a single-version app release flow. The app version lives in [package.json](./package.json), and releases are tagged like `v2.0.0`, `v2.0.1`, etc.

Branch flow:

1. Work on a normal branch with Conventional Commit messages such as `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `build:`, `ci:`, or `chore:`.
2. Before opening a PR into `dev`, run:

```sh
pnpm release:plan
```

3. The script:
    - finds commits on your current branch that are not yet in `dev`
    - filters to Conventional Commit subjects
    - prompts you for the release bump (`patch`, `minor`, or `major`)
    - writes the plan file into `.release-plans/`
    - stages only that plan file
    - creates a dedicated release-plan commit automatically
4. Open the PR into `dev`.

What `pnpm release:plan` actually does:

- compares your current branch against `dev`
- finds commits that are on your branch but not yet in `dev`
- keeps only commits whose subject matches the Conventional Commits format
- prompts you to choose the release bump for this branch: `patch`, `minor`, or `major`
- writes a release plan file into `.release-plans/`
- stages and commits that file as `Release plan for <branch>`

That release plan file is intentionally committed to git. It is the branch's release metadata and will be merged into `dev` with the rest of the branch.

Example contributor flow:

```sh
git checkout -b feat/improve-event-review
git commit -m "feat(event): improve event review navigation"
git commit -m "fix(event): handle empty attendee page"
pnpm release:plan
```

At that point, the branch contains both:

- the code changes
- the release plan describing how those commits should contribute to the next release

Release note grouping:

- `feat` -> Features
- `fix` -> Fixes
- `perf` -> Performance
- `refactor` -> Refactors
- `docs`, `test`, `build`, `ci`, `chore`, `style` -> Maintenance

When release generation runs in GitHub Actions, the notes are enriched with GitHub metadata:

- planned commits are mapped back to their merged PRs when possible
- release notes collapse to one line per PR instead of one line per commit
- each line includes the PR author and a link to the PR
- if GitHub metadata cannot be resolved for a commit, the release notes fall back to the raw commit-based entry instead of failing the release

Release flow:

1. Release plan files accumulate naturally as PRs merge into `dev`.
2. When a PR is opened or updated from `dev` into `main`, the GitHub Action in [release-pr.yml](./.github/workflows/release-pr.yml) runs automatically.
3. That workflow:
    - reads all pending `.release-plans/*.json` files
    - computes the highest requested bump
    - bumps [package.json](./package.json)
    - updates [CHANGELOG.md](./CHANGELOG.md)
    - writes the generated release notes into `.release-output/`
    - removes the consumed release plan files from the generated release prep branch
    - opens or updates a release prep PR into `dev` with those generated release changes
    - updates the `dev` -> `main` PR body to the consolidated release notes entry and links the release prep PR
4. When that `dev` -> `main` PR is merged, the GitHub Action in [release-publish.yml](./.github/workflows/release-publish.yml):
    - creates a git tag such as `v2.0.1`
    - publishes a GitHub Release using the generated notes already merged into `main`

The app version now starts from `v2.0.0`.

Contributor expectations:

- use Conventional Commit subjects consistently
- run `pnpm release:plan` before opening a PR into `dev`
- let `pnpm release:plan` create the dedicated release-plan commit
- if you add more Conventional Commit commits after generating the plan, rerun `pnpm release:plan` so the file stays current

Notes:

- the release bump is chosen manually because branch intent is not always safe to infer automatically
- release note content is still derived from commit messages, so commit subject quality matters
- commits that do not follow Conventional Commits are ignored by the release planner
- release automation commits such as `Release plan for ...` and `chore(release): prepare ...` are also ignored by the release planner
- this PR-based release flow is intended to work with protected `main` branches because the automation no longer pushes release commits directly to `main`
- if `dev` also requires pull-request-only changes, the workflow opens a release prep PR into `dev` instead of pushing directly
- merge the generated release prep PR into `dev` before merging `dev` into `main`, otherwise the prepared version/changelog/release-note files will not reach `main`

## Environment Variables

Use `.env.example` as the source of truth for all keys.

Minimum required to run the bot:

- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- `DATABASE_URL`
- Discord role/channel IDs referenced by command and feature logic

Important operational values:

- `NODE_ENV` (`development` or `production`)
- `LOG_LEVEL` (console log level)
- `LOCAL_FILE_LOG_LEVEL` (local file log level)
- `LOCAL_LOG_FILE_PATH`
- `BETTER_STACK_SOURCE_TOKEN`, `BETTER_STACK_INGESTING_HOST` (optional)
- `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`

## Logging Behavior

The logger is multi-target:

- Console (`pino-pretty`) uses `LOG_LEVEL`
- Local file (`pino/file`) uses `LOCAL_FILE_LOG_LEVEL` and writes to `LOCAL_LOG_FILE_PATH`
- Better Stack (`@logtail/pino`) uses `LOG_LEVEL` and is enabled only when both `BETTER_STACK_SOURCE_TOKEN` and `BETTER_STACK_INGESTING_HOST` are set

Operational notes:

- `LOG_LEVEL` affects both console and Better Stack output
- If `LOG_LEVEL=debug` locally, debug and above appear in console
- File logs do not rotate automatically in-app; use host-level rotation and/or increase `LOCAL_FILE_LOG_LEVEL`

## Production Deployment (VPS)

This repo includes:

- `Dockerfile` (multi-stage: `migrate` + runtime)
- `docker-compose.prod.yml` (services: `arbiter-migrate`, `arbiter-bot`, `arbiter-redis`)

### 1) One-Time VPS Hardening

Install baseline tools:

```sh
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release git ufw ripgrep
```

Install Docker Engine + Compose plugin (Ubuntu/Debian):

```sh
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Create non-root deploy user and grant Docker access:

```sh
sudo adduser deploy
sudo usermod -aG docker deploy
```

Re-login and verify:

```sh
docker --version
docker compose version
```

Configure firewall:

```sh
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status
```

Set timezone and NTP (important for log/event timestamps):

```sh
timedatectl set-timezone UTC
timedatectl set-ntp true
timedatectl status
```

### 2) Prepare Persistent Host Directories

```sh
sudo mkdir -p /opt/arbiter/redis-data /opt/arbiter/bot-logs
```

By default, compose maps users as:

- bot: `BOT_UID:BOT_GID` defaults to `1000:1000`
- redis: `REDIS_UID:REDIS_GID` defaults to `999:999`

Set ownership accordingly:

```sh
sudo chown -R 1000:1000 /opt/arbiter/bot-logs
sudo chown -R 999:999 /opt/arbiter/redis-data
```

Verify resolved compose users + current ownership:

```sh
docker compose -f docker-compose.prod.yml config | rg "user:"
stat -c "%u:%g %n" /opt/arbiter/bot-logs /opt/arbiter/redis-data
```

If you override `BOT_UID`/`BOT_GID`/`REDIS_UID`/`REDIS_GID` in `.env`, use those values for ownership instead.

### 3) First Production Deploy

```sh
git pull
cp .env.example .env   # first time only
chmod 600 .env
# edit .env with production values
# take a DB backup/snapshot before applying migrations
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

When to use:

- `docker compose -f docker-compose.prod.yml up -d --force-recreate`:
  use after image/env changes, or when a container is in a bad/restart-loop state and you want a clean recreate.
- `docker compose -f docker-compose.prod.yml logs -f arbiter-bot`:
  use immediately after deploy/restart to confirm boot, command registration, and runtime initialization.

Required production `.env` values include:

- `NODE_ENV=production`
- `DATABASE_URL`
- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- required Discord role/channel IDs used by the bot

Useful optional production `.env` values:

- `REDIS_DATA_DIR`, `BOT_LOGS_DIR`
- `BOT_UID`, `BOT_GID`, `REDIS_UID`, `REDIS_GID`
- `BOT_MEM_LIMIT`, `BOT_CPUS`, `REDIS_MEM_LIMIT`, `REDIS_CPUS`

### 4) Ongoing Deploys and New Migrations

Use this every time new migrations are added:

```sh
# take a DB backup/snapshot before applying migrations
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml run --rm arbiter-migrate
docker compose -f docker-compose.prod.yml up -d --force-recreate
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

This is why `arbiter-migrate` exists: runtime stays slim while Prisma CLI remains available in the migration service. You can keep `prisma` in `devDependencies` and still run production migrations safely.

### 5) Runtime Verification and Operations

Check effective container users after startup:

```sh
docker compose -f docker-compose.prod.yml exec arbiter-bot id
docker compose -f docker-compose.prod.yml exec arbiter-redis id
```

Tail logs:

```sh
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
docker compose -f docker-compose.prod.yml logs -f arbiter-redis
```

Stop services:

```sh
docker compose -f docker-compose.prod.yml down
```

### 6) Start/Stop Bot Container Only

Use these when you only want to operate the bot container and leave Redis running.

Start bot container:

```sh
docker compose -f docker-compose.prod.yml up -d arbiter-bot
```

Stop bot container:

```sh
docker compose -f docker-compose.prod.yml stop arbiter-bot
```

Restart bot container:

```sh
docker compose -f docker-compose.prod.yml restart arbiter-bot
```

Recreate bot container (without touching other services):

```sh
docker compose -f docker-compose.prod.yml up -d --force-recreate arbiter-bot
```

Tail bot logs:

```sh
docker compose -f docker-compose.prod.yml logs -f arbiter-bot
```

### 7) Apply a Code Upgrade

Use this when you want to deploy the latest bot code and recreate only the bot container:

```sh
git pull origin main
docker compose -f docker-compose.prod.yml build --pull
docker compose -f docker-compose.prod.yml up -d --force-recreate arbiter-bot
```

## Migration Folder Purpose

`prisma/migration` scripts are data migration utilities used to import legacy data into the new schema. They are separate from Prisma schema migrations and should be run intentionally as part of migration workflows, not on every bot deploy.
