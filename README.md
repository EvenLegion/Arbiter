# Arbiter v3

Arbiter is the Even Legion Discord bot. It manages event workflows, merit tracking, nickname computation, division membership, name-change review, and the operational tooling that keeps Discord state aligned with persisted state.

The Docusaurus docs site is the source of truth for contributor onboarding, architecture, workflow ownership, release workflow, and deployment.

## Start Here

- Docs site source:
  [website/docs](./website/docs)
- Published docs:
  [https://evenlegion.github.io/Arbiter/](https://evenlegion.github.io/Arbiter/)
- Fastest onboarding path:
  [website/docs/intro.md](./website/docs/intro.md)
- Task-based entrypoint:
  [website/docs/onboarding/choose-your-task.md](./website/docs/onboarding/choose-your-task.md)
- Local setup:
  [website/docs/onboarding/local-development.md](./website/docs/onboarding/local-development.md)
- Codebase tour:
  [website/docs/onboarding/repository-map.md](./website/docs/onboarding/repository-map.md)
- Runtime architecture:
  [website/docs/architecture/runtime-overview.md](./website/docs/architecture/runtime-overview.md)
- State and integrations:
  [website/docs/architecture/data-and-storage.md](./website/docs/architecture/data-and-storage.md)
- Event and merit workflows:
  [website/docs/features/event-system.md](./website/docs/features/event-system.md)
- Membership and identity workflows:
  [website/docs/features/division-and-membership.md](./website/docs/features/division-and-membership.md)
- Contribution rules:
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
