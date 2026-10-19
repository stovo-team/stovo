---
title: "Intelligence Source v2 Backup Operations CLI and Restore Safety Plan"
type: implementation-plan
---

# Intelligence Source v2 Backup Operations CLI and Restore Safety Plan

> This plan was updated on 2026-10-15 while resolving PR #169 conflicts. Current `master` explicitly requires independent proof for restore completion; the earlier plan to expose `restore begin` and `restore complete` from same-database state is superseded. This implementation keeps restore fail-closed and limits the CLI to backup registration and inventory verification.

**Goal:** Add a DB-only operator CLI for Intelligence backup metadata and document the safe backup workflow and current restore boundary.

**Architecture:** Extract backup horizon registration and inventory verification into a reusable database-backed service. Keep the server's restore methods fail-closed according to current `master`; do not route around them from the CLI.

**Tech Stack:** Go, `database/sql`, PostgreSQL through `pgx`, standard-library flags/JSON, Docker multi-stage build, Docker Compose.

**Spec:** [2026-10-14-intelligence-backup-restore-operations-design.md](../specs/2026-10-14-intelligence-backup-restore-operations-design.md)

## Constraints

- Work only in the `stovo-messenger` repository and dedicated task worktree.
- Keep `INTELLIGENCE_SOURCE_ENABLED` and `INTELLIGENCE_OIDC_ENABLED` default-off; do not connect a live tenant or enable a canary.
- Keep `INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH` in deployment configuration outside database backups.
- Cap restorable-backup horizons at 30 days and preserve at least seven additional days of tombstone retention.
- Do not add migrations, production secrets, a public HTTP operations endpoint, arbitrary-SQL input, or a provider-specific controller.
- Do not expose restore completion based only on the Messenger database; preserve current-master fail-closed restore behavior.
- Never log database URLs, credentials, source payloads, or secrets. Use synthetic identities and disposable local services.

## Task 1: Extract Backup Inventory Operations

- Keep `RegisterIntelligenceSourceV2BackupHorizon` and `MarkIntelligenceSourceV2BackupInventoryVerified` in a reusable service.
- Have the server wrappers delegate to that service using the server's injected clock.
- Add integration coverage for the 30-day cap, inventory invalidation on new backup registration, retention cleanup, and the current server restore fail-closed behavior.

## Task 2: Add the DB-Only Operations CLI

- Build `backend/cmd/intelligence-source-ops` using only the existing PostgreSQL configuration and `pgx` driver; do not start application workers or Redis.
- Support `backup register --backup-id ID --created-at RFC3339-UTC --restorable-until RFC3339-UTC` and `inventory verify --verified-at RFC3339-UTC`.
- Reject `restore` commands with a clear non-zero error explaining that independent proof is not integrated.
- Test command parsing, UTC timestamps, exact success JSON, coordinator errors, and fail-closed restore-command rejection.

## Task 3: Package and Document the Operator Workflow

- Package the CLI in the backend runtime image and pass the restore epoch to the backend Compose service.
- Document registration before `pg_dump`, inventory verification after all database/object backups are checked, and the conservative effect of failed dumps.
- Document restore epoch rotation, disabled gates, and the independent-proof requirement; do not show unsupported restore CLI commands.
- Validate Docker image build, both Compose configurations, Atlas hash, lint, Go tests, and `git diff --check`.

## Final Verification

From `backend`, run `go test ./cmd/intelligence-source-ops ./internal/app`, `go test ./...`, `make lint`, and `atlas migrate hash --dir file://migrations`. This feature adds no migrations; the merge includes migration changes already present on `master`, so verify the resulting Atlas checksum file matches the current migration set.

From the repository root, run both Compose configuration commands from `CONTRIBUTING.md`, `docker build -t stovo-intelligence-source-ops-check ./backend`, and `git diff --check`.

Use only disposable PostgreSQL/Redis for integration tests. Report each unavailable required check precisely.
