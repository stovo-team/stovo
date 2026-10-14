# Intelligence Source v2 Backup and Restore Operations

**Status:** Proposed design
**Date:** 2026-10-14
**Scope:** Messenger repository only

## Goal

Provide operators with a runnable way to invoke the existing Intelligence Source v2 backup and restore coordinator from the documented self-hosted PostgreSQL backup workflow. Keep both Intelligence feature gates disabled by default. This work does not enable a tenant, run a canary, or prove that the external Intelligence consumer is ready.

## Current state

Messenger already implements `RegisterIntelligenceSourceV2BackupHorizon`, `MarkIntelligenceSourceV2BackupInventoryVerified`, `BeginIntelligenceSourceV2Restore`, and `CompleteIntelligenceSourceV2Restore` on the application server. The retention worker uses registered backup horizons and a recent complete-inventory checkpoint before pruning tombstones. Restore completion checks fresh consumer watermarks while serializing with connection writers.

There is no backup-controller or restore-controller in this repository. The self-hosting guide documents a manual `pg_dump` example, but does not invoke the Intelligence coordinator. Constructing the full application server from an operations command would also start unrelated backend workers and require Redis and other services.

## Design

Add a DB-only `intelligence-source-ops` executable at `backend/cmd/intelligence-source-ops`. It will load the existing backend database configuration, open only PostgreSQL, and invoke a small reusable Intelligence Source v2 operations service. Refactor the current server methods to delegate to that service so the CLI and HTTP application share the same transaction logic and validation without starting the full application.

The CLI will expose four operations:

1. `backup register` records the backup ID, exact UTC creation time, and last-restorable time. Run it before the dump starts so the existing registration method invalidates the prior inventory checkpoint before retention can prune metadata for the new backup. The registered horizon may not exceed 30 days.
2. `inventory verify` marks a complete external backup inventory with its UTC verification time. Run it only after the operator has checked that all currently restorable backups have registered horizons. Repeated verification is safe; a new backup registration makes the checkpoint stale again.
3. `restore begin` takes the restore ID and exact UTC creation time of the registered backup, closes the v2 restore gate, and writes the returned metadata-only tombstones as JSON to stdout. It must not emit content payloads or credentials.
4. `restore complete` takes the restore ID, fresh ledger-check time, and a JSON map of per-connection applied sequence high-water marks from stdin. It delegates final watermark checks and epoch update to the existing coordinator. Any validation, storage, or replay failure exits non-zero and leaves source access closed.

The CLI will use deterministic JSON output, strict timestamp parsing, a non-zero exit code for invalid input or coordinator errors, and no logging of database URLs, credentials, tombstone content, or caller-provided secrets. The command will not execute arbitrary SQL supplied by an operator.

Build the executable into the existing backend runtime image. The self-hosting guide will show one-shot `docker compose run --rm --no-deps` invocations using the backend service's environment and network, so operations can run while the web process is stopped. Update the Intelligence integration runbook with the same ordering and the remaining external-owner boundary.

## Operational sequence

For a backup, choose the exact UTC creation and expiry timestamps, register its horizon, create the PostgreSQL/object backups, then verify the complete inventory after confirming the backup is restorable. If creation fails after registration, the extra horizon is conservative: it can delay pruning, but cannot shorten tombstone retention.

For restore, keep source traffic stopped and both feature gates off, rotate `INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH` outside the database backup, restore PostgreSQL and matching objects, and run `restore begin` before starting the application. Replay every emitted tombstone in the corresponding Intelligence consumer scope. Then pass the consumer's applied-through watermarks and a ledger-check time no older than five minutes to `restore complete`. Start source traffic only after success and a separate rollout authorization.

## Boundaries and risks

- No provider-specific backup controller exists here. This change supplies a working operator command and manual runbook, but any external scheduler or managed-backup controller must still invoke the command at backup creation and inventory verification. Do not claim automated backup integration until that wiring is deployed and exercised.
- No Intelligence consumer client is added. Tombstone replay and watermark reporting remain an external consumer operation; the Messenger restore gate remains closed on failure or uncertainty.
- Preserve the 30-day restorable-backup limit and at least seven additional days of tombstone retention. Do not alter the schema or migration history for this CLI.
- Do not change the default values of `INTELLIGENCE_SOURCE_ENABLED` or `INTELLIGENCE_OIDC_ENABLED`, add production secrets, or connect a live tenant.

## Verification

- Add CLI contract tests for valid command parsing, strict UTC times, JSON input/output, malformed input, coordinator errors, and non-zero failure status. Verify outputs contain only backup metadata or tombstones and never payload text or credentials.
- Keep and run the existing synthetic PostgreSQL integration tests for backup horizon registration, inventory verification, restore gating, stale watermarks, and successful completion.
- Build the backend image and validate the documented Compose command/configuration without starting services.
- Run focused backend tests, backend lint, Atlas checksum verification (no migration changes expected), `git diff --check`, and relevant Compose configuration checks. Report unavailable tooling or disposable services rather than claiming those checks passed.

## Acceptance criteria

An operator can invoke each coordinator operation using a one-shot command from the backend image without starting Redis or application workers. The manual self-hosting instructions show the safe ordering for backup and restore. Invalid or incomplete restore evidence cannot reopen source routes. Both process gates remain default-off, and the docs continue to distinguish an operator path from automated controller integration or production readiness.
