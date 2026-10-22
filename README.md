# Arbiter v3

Arbiter is the Even Legion Discord bot. It manages event workflows, merit tracking, nickname computation, division membership, name-change review, and the operational tooling that keeps Discord state aligned with persisted state.

The Docusaurus docs site is the source of truth for contributor onboarding, architecture, workflow ownership, release workflow, and deployment.

## Start Here

- [Published docs](https://evenlegion.github.io/Arbiter/)
- [Local development runbooks](https://evenlegion.github.io/Arbiter/local-development/environment-and-services)

## Minimal Local Boot

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm redis:up
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

- `.env.example` is the exhaustive configuration authority; `.env` supplies local values.
- Observability is optional for local development. Start it with `pnpm obs:up` when you need Grafana/Loki inspection.
- `prisma/migration/` contains legacy-data migration and repair utilities, not the normal deploy-time schema migration path.
