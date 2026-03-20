# Integration Tests

These tests use real infrastructure:

- Postgres via Testcontainers
- Redis via Testcontainers

They are intentionally focused on repository and workflow behavior, not Discord client automation.

Current goals:

- validate the first critical Postgres-backed workflows with real schema and seed data
- validate Redis-backed event tracking behavior with a real Redis instance
- keep fixtures small and scenario-specific

Do not add raw production dumps here. Prefer minimal fixtures and sanitized prod-shaped scenarios only when they add coverage that focused fixtures cannot.
