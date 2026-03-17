# Arbiter v3

Arbiter is the Even Legion Discord bot. It manages event workflows, merit tracking, nickname computation, division membership, name-change review, and the operational tooling that keeps Discord state aligned with persisted state.

The Docusaurus docs site is the source of truth for contributor onboarding, architecture, extension patterns, release workflow, and deployment.

## Start Here

- Docs site source:
  [website/docs](./website/docs)
- Published docs:
  [https://evenlegion.github.io/Arbiter/](https://evenlegion.github.io/Arbiter/)
- Fastest onboarding path:
  [website/docs/intro.md](./website/docs/intro.md)
- Local setup:
  [website/docs/onboarding/local-development.md](./website/docs/onboarding/local-development.md)
- Repository layout:
  [website/docs/onboarding/repository-map.md](./website/docs/onboarding/repository-map.md)
- Feature and extension rules:
  [website/docs/contributing/adding-features.md](./website/docs/contributing/adding-features.md)
- Logging and observability:
  [website/docs/architecture/logging-and-observability.md](./website/docs/architecture/logging-and-observability.md)
- Release workflow:
  [website/docs/contributing/release-workflow.md](./website/docs/contributing/release-workflow.md)
- Production deployment:
  [website/docs/contributing/production-deployment.md](./website/docs/contributing/production-deployment.md)

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

- `.env.example` is the source of truth for runtime configuration.
- `prisma/migration/` contains legacy-data migration and repair utilities, not the normal deploy-time schema migration path.
