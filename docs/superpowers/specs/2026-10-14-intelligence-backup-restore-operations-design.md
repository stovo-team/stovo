---
title: "Intelligence Source v2 Backup Operations CLI and Restore Safety"
type: design
---

# Intelligence Source v2 Backup Operations CLI and Restore Safety

**Status:** Updated for current-master restore policy
**Original date:** 2026-10-14
**Updated:** 2026-10-15
**Scope:** Messenger repository only

## Goal

Give operators a runnable way to register restorable backup horizons and verify a complete backup inventory through the self-hosted PostgreSQL workflow. Preserve the current fail-closed restore behavior until Messenger has an independent proof source for post-backup tombstones or a tested full-scope consumer reset path.

This work does not enable a tenant, run a canary, prove external Intelligence consumer readiness, or provide an automated backup controller.

## Current state

Messenger stores backup horizons, the complete-inventory checkpoint, restore gates, and the tombstone ledger in PostgreSQL. The retention worker prunes backup metadata only when a recent complete inventory has been verified. There is no backup controller in this repository.

Current `master` explicitly treats the restore gate and tombstone ledger as untrusted after a database rollback because both can be restored to the same stale snapshot. The server's restore begin path blocks source routes and returns unavailable; restore completion cannot reopen them. Same-database tombstones or consumer watermarks do not prove that all post-backup invalidations were replayed.

## Design

Add a DB-only `intelligence-source-ops` executable at `backend/cmd/intelligence-source-ops`. It loads the existing database configuration, opens only PostgreSQL, and invokes a reusable `IntelligenceSourceV2Operations` service for backup inventory updates. Server methods delegate backup registration and inventory verification to the same service while preserving the server's injected clock.

The CLI supports two operations:

1. `backup register` records the backup ID, exact UTC creation time, and last-restorable time. Run it before the dump so a new backup invalidates the prior inventory checkpoint. Restorability may not exceed 30 days.
2. `inventory verify` records a complete external backup inventory after the operator checks every currently restorable backup. Registering another backup invalidates this checkpoint.

The CLI does not expose `restore begin` or `restore complete`. It returns a non-zero error for restore commands and does not query same-database state to claim restore completion. Restore remains unavailable until a verified independent off-host tombstone journal or a tested authoritative reset/reindex of all affected Intelligence scopes is integrated.

The command uses deterministic JSON success output, strict UTC timestamps, non-zero exit codes for invalid input or coordinator errors, and generic errors without database URLs, credentials, payloads, or secrets. It executes no arbitrary SQL supplied by an operator.

Build the executable into the backend runtime image. The self-hosting guide uses one-shot `docker compose run --rm --no-deps` invocations so backup metadata operations do not start Redis or application workers.

## Operational sequence

For a backup, register the exact creation time and last-restorable time before starting the dump. Create the PostgreSQL and matching object backups, check the complete list of currently restorable backups, then verify the inventory. If a dump fails after registration, leave the conservative horizon in place; it may delay pruning but cannot shorten tombstone retention.

For a database restore, keep source traffic stopped and both feature gates disabled. Set a new unpredictable `INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH` outside the backup, restore PostgreSQL and matching objects, and keep the gates disabled after restore. The epoch mismatch keeps v2 source routes unavailable. Do not treat a restored database ledger or a successful health check as restore proof.

Restore support requires either a current tombstone journal from independent off-host state with completeness proven against the selected backup, or a tested reset/reindex of every affected Intelligence scope from an authoritative current source. Neither path is implemented here. Keep the gates disabled until a selected path is implemented and verified with disposable backups.

## Boundaries and risks

- No provider-specific backup controller exists here. External backup scheduling must invoke registration and inventory verification; do not claim automated backup integration until that wiring is deployed and exercised.
- No independent restore proof source or full-scope Intelligence reset/reindex is implemented. The restore coordinator remains fail-closed; do not bypass it or claim consumer readiness.
- Preserve the 30-day restorable-backup limit and at least seven additional days of tombstone retention. Do not alter schema or migration history for this CLI.
- Do not change default values of `INTELLIGENCE_SOURCE_ENABLED` or `INTELLIGENCE_OIDC_ENABLED`, add production secrets, or connect a live tenant.

## Verification

- Test valid backup registration and inventory verification, strict UTC parsing, malformed arguments, generic coordinator errors, and explicit rejection of restore commands.
- Keep and run synthetic PostgreSQL integration tests for backup horizon registration, inventory invalidation, restore fail-closed behavior, and retention cleanup.
- Build the backend image and validate the documented Compose configuration without starting services.
- Run focused backend tests, backend lint, Atlas checksum verification, `git diff --check`, and relevant Compose configuration checks. Report unavailable tooling or disposable services rather than claiming those checks passed.

## Acceptance criteria

An operator can register a backup horizon and verify a complete inventory through a one-shot command without starting Redis or application workers. The runbook documents backup ordering and the current restore constraints. Restore commands cannot reopen source routes; both process gates remain default-off, and documentation distinguishes manual backup operations from automated controller integration or restore readiness.
