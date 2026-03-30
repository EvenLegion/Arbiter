# Arbiter v3

Arbiter is the Even Legion Discord bot. It manages event workflows, merit tracking, nickname computation, division membership, name-change review, and the operational tooling that keeps Discord state aligned with persisted state.

The Docusaurus docs site is the source of truth for contributor onboarding, architecture, workflow ownership, release workflow, and deployment.

## Start Here

(Published docs)[https://evenlegion.github.io/Arbiter/](https://evenlegion.github.io/Arbiter/]

## Minimal Local Boot

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm redis:up
pnpm obs:up
pnpm db:migrate
pnpm dev
```

## Docs Commands

```bash
pnpm docs:dev
pnpm docs:build
pnpm docs:serve
```

## Notes

- `.env` is the source of truth for runtime configuration.
- `prisma/migration/` contains legacy-data migration and repair utilities, not the normal deploy-time schema migration path.
