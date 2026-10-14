# Intelligence Source v2 Backup and Restore Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]` syntax for tracking.

**Goal:** Add a DB-only operator CLI that invokes Messenger's existing Intelligence Source v2 backup and restore coordinator, and document its manual self-hosted workflow.

**Architecture:** Extract the four backup/restore operations from `app.Server` into a reusable database-backed service. A new Go command will construct only that service and PostgreSQL connection, package its binary into the backend image, and expose safe one-shot Compose instructions without starting Redis or application workers.

**Tech Stack:** Go, `database/sql`, PostgreSQL through `pgx`, standard-library flags/JSON, Docker multi-stage build, Docker Compose.

**Spec:** [2026-10-14-intelligence-backup-restore-operations-design.md](../specs/2026-10-14-intelligence-backup-restore-operations-design.md)

## Global Constraints

- Work only in the `stovo-messenger` repository and the dedicated task worktree.
- Keep `INTELLIGENCE_SOURCE_ENABLED` and `INTELLIGENCE_OIDC_ENABLED` default-off; do not connect a live tenant or enable a canary.
- Keep `INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH` in deployment configuration outside database backups.
- Cap every registered restorable-backup horizon at 30 days; preserve at least seven additional days of tombstone retention.
- Do not add migrations, production secrets, a public HTTP operations endpoint, arbitrary-SQL input, or a provider-specific controller.
- Do not claim automated controller integration or consumer readiness; external backup scheduling and Intelligence tombstone replay remain external.
- Never log database URLs, credentials, source payloads, or secrets. Failed or incomplete restore verification must leave source access closed.
- Use synthetic identities and disposable local services. Run only the relevant checks in `CONTRIBUTING.md` and report unavailable checks.

## Review Focus

- Registering a backup must stale the inventory checkpoint before the dump starts; cover this with an application integration assertion.
- An unregistered, inadmissible, or expired backup must not return tombstones or reopen source access; cover this with restore integration tests.
- Missing, behind, or stale consumer watermarks must keep the restore gate closed; preserve the existing restore integration assertions.
- Malformed timestamps/JSON and coordinator errors must fail without emitting DSNs, payloads, credentials, or caller-provided secret markers; cover this with CLI contract tests.
- One-shot Compose runs must receive the configured database and restore epoch while avoiding backend dependencies; validate both documented Compose configs and build the image.

---

### Task 1: Extract the Backup and Restore Coordinator Service

**Files:**
- Create: `backend/internal/app/intelligence_source_v2_operations.go`
- Modify: `backend/internal/app/intelligence_source_v2_retention.go`
- Test: `backend/internal/app/intelligence_source_v2_integration_test.go`

**Interfaces:**
- Produces `NewIntelligenceSourceV2Operations(db *sql.DB, restoreEpoch string) *IntelligenceSourceV2Operations`.
- Produces methods `RegisterIntelligenceSourceV2BackupHorizon(context.Context, string, time.Time, time.Time) error`, `MarkIntelligenceSourceV2BackupInventoryVerified(context.Context, time.Time) error`, `BeginIntelligenceSourceV2Restore(context.Context, string, time.Time) ([]IntelligenceSourceV2RestoreTombstone, error)`, and `CompleteIntelligenceSourceV2Restore(context.Context, string, map[string]int64, time.Time) error`.
- Existing `(*Server)` methods remain as thin wrappers and use the server's injected clock. The public constructor uses UTC wall clock time.

- [ ] **Step 1: Add an integration assertion for the reusable operations constructor.** Extend `TestIntelligenceSourceV2RetentionAndRestoreRequireFreshTombstoneReplay` to invoke the new service for backup registration, restore begin/completion, and inventory verification. Assert that registration immediately sets `intelligence_source_v2_backup_inventory_state.complete=false`. Add `TestIntelligenceSourceV2OperationsRejectUnregisteredBackupAndKeepRestoreBlocked` to prove an unregistered backup is refused and the gate remains blocked. Keep assertions for the 30-day cap, tombstone return, refusal before replay, stale-watermark refusal, successful completion, and retention cleanup.
- [ ] **Step 2: Run the focused integration test to verify the new API is missing.** Run from `backend`: `go test ./internal/app -run '^TestIntelligenceSourceV2(OperationsRejectUnregisteredBackupAndKeepRestoreBlocked|RetentionAndRestoreRequireFreshTombstoneReplay)$' -count=1`. Expected: FAIL to compile because `NewIntelligenceSourceV2Operations` is not defined.
- [ ] **Step 3: Extract the four database operations and tombstone JSON tags into `IntelligenceSourceV2Operations`.** Keep transaction SQL and sentinel errors unchanged. Add an internal constructor accepting `now func() time.Time`; have `Server` wrappers pass `s.intelligenceOIDCNow` and the configured restore epoch.
- [ ] **Step 4: Run the focused integration test and the existing source v2 integration tests.** Run `go test ./internal/app -run 'IntelligenceSourceV2(RetentionAndRestoreRequireFreshTombstoneReplay|OperationsRejectUnregisteredBackupAndKeepRestoreBlocked|RestoreGateBlocksRoutesAndMissingStateFailsClosed|FreshEmptyDatabaseBindsDeploymentRestoreEpoch)' -count=1` from `backend`. Expected: PASS with the same fail-closed behavior.
- [ ] **Step 5: Commit the service extraction.** Use commit message `[Feature] extract Intelligence backup operations service`.

### Task 2: Add the DB-Only Operations CLI

**Files:**
- Create: `backend/cmd/intelligence-source-ops/main.go`
- Test: `backend/cmd/intelligence-source-ops/main_test.go`

**Interfaces:**
- Define a local coordinator interface matching the four exported methods from Task 1.
- Define `run(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer, coordinator coordinator) int` for parser/command tests.
- Command forms:
  - `backup register --backup-id ID --created-at RFC3339-UTC --restorable-until RFC3339-UTC`
  - `inventory verify --verified-at RFC3339-UTC`
  - `restore begin --restore-id ID --backup-created-at RFC3339-UTC`
  - `restore complete --restore-id ID --ledger-checked-at RFC3339-UTC`; read the JSON map `{"connection-id": sequence}` from stdin.
- `restore begin` emits `{"tombstones":[...]}` with metadata-only tombstones; other successful operations emit `{"ok":true}`. Errors return non-zero and do not print raw coordinator or database errors.

- [ ] **Step 1: Add CLI contract tests with a fake coordinator.** Add `TestRunBackupRegisterParsesUTCAndDispatches`, `TestRunInventoryVerifyParsesUTCAndDispatches`, `TestRunInventoryVerifyRejectsInvalidTimestamp`, `TestRunRestoreBeginWritesMetadataJSON`, `TestRunRestoreCompleteReadsWatermarksFromStdin`, `TestRunRejectsMalformedArgumentsAndJSON`, and `TestRunCoordinatorErrorsDoNotLeakSensitiveData`. Assert exact coordinator calls, JSON shape, strict UTC parsing/rejection, and non-zero error codes.
- [ ] **Step 2: Run the new command tests to verify they fail.** Run from `backend`: `go test ./cmd/intelligence-source-ops -count=1`. Expected: FAIL because `run` and the command implementation are not yet defined.
- [ ] **Step 3: Implement command parsing and `run` in `main.go`.** Parse only the four declared command forms; require RFC3339 UTC timestamps ending in `Z`; decode exactly one JSON watermark object from stdin; marshal deterministic JSON to stdout; send only generic errors to stderr.
- [ ] **Step 4: Compose the CLI against configuration and PostgreSQL only.** In `main`, load `config.Config`, open `cfg.EffectiveDatabaseURL()` with the existing `pgx` driver, ping under a bounded context, construct `app.NewIntelligenceSourceV2Operations(db, cfg.IntelligenceSourceV2RestoreEpoch)`, and invoke `run`. Do not call `bootstrap.BuildDependencies` or construct `app.Server`.
- [ ] **Step 5: Run command and service tests.** Run `go test ./cmd/intelligence-source-ops ./internal/app -run 'TestRun|TestIntelligenceSourceV2RetentionAndRestoreRequireFreshTombstoneReplay' -count=1` from `backend`. Expected: PASS; failures do not include the fake sensitive marker.
- [ ] **Step 6: Commit the CLI.** Use commit message `[Feature] add Intelligence source operations CLI`.

### Task 3: Package and Document the Operator Workflow

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `.env.example`
- Modify: `deploy/compose/production-bluegreen.yml`
- Modify: `docs/self-hosting/docker-compose.md`
- Modify: `docs/integrations/intelligence-source-v2.md`

**Interfaces:**
- Consume the command forms defined in Task 2.
- Add `INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH: ${INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH:-}` to the shared backend Compose environment and an empty commented example setting to `.env.example`. Do not add a usable epoch.

- [ ] **Step 1: Package the command in the runtime image.** Build `./cmd/intelligence-source-ops` in the Go builder stage and copy `intelligence-source-ops` to `/usr/local/bin` in the Alpine runtime stage.
- [ ] **Step 2: Document the safe backup flow.** In `docs/self-hosting/docker-compose.md`, show one-shot `docker compose run --rm --no-deps --entrypoint intelligence-source-ops backend-blue` examples. Register the horizon before `pg_dump`; after successful creation and a complete inventory check, mark inventory verified. Explain that a failed dump may leave a conservative horizon and that expired backup records are pruned by the existing retention worker.
- [ ] **Step 3: Document the safe restore flow.** Show stopping application traffic, rotating the epoch outside the backup, restoring database and objects, running `restore begin` before the backend starts, replaying all emitted tombstones externally, then piping fresh consumer watermarks to `restore complete`. State that failure leaves the source unavailable, both process gates remain off, and external consumer/controller wiring is still required.
- [ ] **Step 4: Update the Intelligence integration runbook.** Replace the statement that there is no operator command with the new CLI path, while retaining the explicit absence of an automated backup-controller call site and the no-canary boundary.
- [ ] **Step 5: Validate packaging and Compose configuration.** Run the backend Docker build and both commands from `CONTRIBUTING.md`:
  `docker compose --project-directory . -f deploy/compose/production-bluegreen.yml --env-file .env.example config --quiet` and
  `docker compose --project-directory . -f deploy/compose/production-bluegreen.yml -f deploy/compose/external-overlay.yml --env-file .env.example config --quiet`.
  Expected: image builds with the CLI binary and both Compose files resolve successfully without starting services.
- [ ] **Step 6: Commit documentation and packaging.** Use commit message `[Feature] package Intelligence ops CLI and document workflow`.

## Final Verification

- From `backend`, run `go test ./cmd/intelligence-source-ops ./internal/app`, `go test ./...`, `make lint`, and `atlas migrate hash --dir file://migrations`. Verify `backend/migrations/atlas.sum` stays unchanged.
- From the repository root, run both Compose configuration commands from Task 3, `docker build -t stovo-intelligence-source-ops-check ./backend`, and `git diff --check`.
- PostgreSQL integration tests must use only disposable local services. If Go, Atlas, Docker, or disposable PostgreSQL/Redis are unavailable, report each skipped check precisely; do not report an unrun check as passing.

