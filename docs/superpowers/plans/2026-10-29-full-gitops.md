---
title: "Full GitOps Transition Implementation Plan"
type: engineering-plan
---

# Full GitOps Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Stovo multiserver releases to a CI-gated, Doco-CD pull model with OCI Vault and safe ARM64 tenant rollout.

**Architecture:** CI publishes immutable ARM64 images and atomically promotes a complete release snapshot to a protected GitOps branch. Doco-CD polls that branch; a private Vault adapter resolves pinned secret versions, and the orchestrator reconciles tenant containers against the selected backend digest. Existing tenant membership remains in PostgreSQL.

**Tech Stack:** Go, Node.js, Docker Compose, PostgreSQL/Atlas, GitHub Actions, Doco-CD, OCI Vault.

**Spec:** `docs/agent-workflows/specs/full-gitops-oci.md`; tests: `docs/agent-workflows/test-plans/full-gitops-oci.md`.

## Global Constraints

- Approved artifacts: commit `0f7cd707febf985c34bfae245fd4461613cace4e`; user approval is recorded in `docs/agent-workflows/contracts/full-gitops-oci.json`.
- Implement in a dedicated worktree and split delivery into coherent PRs, each with at most 445 added plus deleted lines. Dependent changes must remain inert until their prerequisites are present.
- Never operate on production or create/change remote IAM, registry, branch protection or deployment state as part of implementation without its applicable authorization. Cutover is separately authorized.
- No actual secrets in Git, command output, fixtures, logs or CI. Use synthetic values; preserve existing encryption keys and persistent data.
- Full production activation requires all GITOPS-01 through GITOPS-09 evidence. A missing ARM64 stage, OCI identity or registry is blocked evidence, not success.
- Doco-CD version `0.125.1` has an ARM64 manifest, but webhook and one-shot features on the selected release are unverified; the local Go version and OCI SDK compatibility must also be checked before dependency selection.
- The existing emergency `backend_deploy_only` path must not bypass the release branch CI gate; Android release behavior is outside scope.

## Review Focus

1. Concurrent CI runs and rollback: a late older run must not overwrite a newer or held release; test CAS and persistent hold in Task 2.
2. OCI rotation mid-rollout: each key resolves from one pinned version and old versions remain available for rollback; test in Tasks 3 and 7.
3. Lost deployment lock: a stale process must not continue mutating Docker or SQL while another writer takes over; prove fencing or equivalent in Task 5.
4. Existing running-only tenant and existing volumes: adoption must stop with a visible discrepancy, never delete resources; test in Tasks 5 and 7.
5. Doco-CD completes Compose before asynchronous tenant rollout: failed, timed-out or stale rollout must fail the one-shot gate and never show a healthy release; test the pinned binary in Tasks 1 and 6.

## Task 1: Feasibility and read-only inventory

**Files:** Create `deploy/gitops/README.md` and `deploy/gitops/inventory.md`; document observations, no credentials. Inspect `deploy/compose/production-multiserver.yml`, `backend/internal/orchestrator/routes.go`, `.github/workflows/pipeline.yml` and upstream documentation for the exact Doco-CD version.

**Consumes:** approved spec and actual host/registry information. **Produces:** component/version matrix, tested Doco-CD version, non-secret OCI bundle shape and stage prerequisites. GITOPS-07, GITOPS-08.

- [ ] Inspect image manifests for `linux/arm64`, OCI SDK version/license/advisories/Go compatibility, Doco-CD webhook provider and one-shot implementation in the selected tagged release. Record tag, image index and arm64 digests.
- [ ] On an isolated ARM64 test host, prove webhook lookup, one-shot rerun on release/secret version change, success/failure/timeout propagation and metadata access from the proposed adapter namespace. Use only synthetic secret values.
- [ ] Inventory current production project/container/volume/network names, union of registered and live-only tenants, root upstream, Git and registry reachability and existing Vault payload keys without exposing values. Treat unavailable access as blocked; do not modify the VM.
- [ ] Verify CI runner ARM64 build capability and actual required check names; record skipped-conditional rules and registry authentication requirements. Establish a safe lock/fencing design and review it against process death and in-flight Docker requests. If any key feasibility check fails, stop the dependent integration and revise the design.
- [ ] Validate links and evidence; commit the inventory without private data. The published `doco-cd:0.125.1` ARM64 manifest was inspected on 2026-10-29; runtime behavior is still unverified.

## Task 2: Immutable release and atomic promotion

**Files:** Create `scripts/gitops/release.mjs`, `scripts/gitops/release.test.mjs`, `.github/workflows/gitops-release.yml`; update `.github/workflows/pipeline.yml` and `.github/workflows/pipeline.test.sh` as separate focused deliveries.

**Consumes:** Task 1 runner/check/registry matrix. **Produces:** `deploy/gitops/release.json` snapshot with `source_sha`, monotonic `sequence`, pinned `images` (backend, orchestrator, frontend, Caddy and infrastructure), `secret_version`, and rollback-hold state. GITOPS-01, GITOPS-02.

- [ ] Write `scripts/gitops/release.test.mjs` tests for `validateRelease(record)` and `planPromotion(current, candidate, checks)`: exact source SHA; missing/pending/failed/canceled required checks reject; explicitly inapplicable conditional checks only skip under allowlist; digest validation; secret-version preservation; stale/out-of-order candidate and active hold reject.
- [ ] Run `node --test scripts/gitops/release.test.mjs` and confirm the expected missing-implementation failures.
- [ ] Implement `validateRelease(record)` and `planPromotion(current, candidate, checks)` as pure exported functions; invalid inputs return a reasoned refusal, not a promotable object. Run the focused tests and require all to pass.
- [ ] Add image builds from the exact tested source SHA, registry publication and digest capture. Package the release configuration, Caddy config and all referenced runtime files with those digests; never build production application images on the target VM.
- [ ] Implement promotion to `gitops/stage` first using a narrowly scoped identity and compare-and-swap against the expected branch head. Test two concurrent runs, a rejected stale push, a rollback hold and explicit resume; never permit force-push.
- [ ] Run `bash .github/workflows/pipeline.test.sh` and `node --test scripts/gitops/release.test.mjs`; verify Android and existing production SSH jobs still have their current behavior before cutover. Commit passing pieces independently.

## Task 3: OCI Vault adapter and bootstrap

**Files:** Create `backend/cmd/oci-secret-adapter/main.go`, `backend/internal/ocisecret/adapter.go`, `backend/internal/ocisecret/adapter_test.go`, `deploy/gitops/secret-stores.yml` and a host bootstrap unit in `deploy/gitops/`; update `backend/go.mod` and `backend/go.sum` only after Task 1 dependency assessment.

**Consumes:** a configured, allowlisted OCI secret OCID, immutable positive version number, key allowlist and local authentication credential. **Produces:** private `GET /v1/secrets/{version}/{key}` response `{"value":"..."}` for Doco-CD webhook JMESPath `value`. GITOPS-05, GITOPS-06.

- [ ] Write adapter tests using a fake `SecretReader` with `ReadVersion(ctx context.Context, version int64) (map[string]string, error)`: requested version is passed through, valid allowlisted key succeeds, zero/non-numeric version, unknown key, wrong auth and upstream failure fail closed; no output or error contains a synthetic value.
- [ ] Run `cd backend && go test ./internal/ocisecret` and confirm the expected missing-implementation failure.
- [ ] Implement the HTTP adapter and OCI-backed `SecretReader` using Oracle instance principal, with configured OCID only, timeouts, bounded retry, metadata access control and no secret logging. Check all keys in a deployment are pinned to the same release version; run focused tests.
- [ ] Add Doco-CD webhook-store wiring, private network policy and a host bootstrap service that retrieves only the necessary read credentials to protected transient files before Doco-CD starts. Bootstrap the pinned adapter alongside Doco-CD independently of the application release it serves: its startup must not require secrets fetched through its own webhook. Start Doco-CD only after adapter readiness; retain a documented credential and adapter recovery path. Verify token expiry, refresh, revocation and permissions with synthetic credentials. Never assume host CLI success proves container IMDS access.
- [ ] Implement a secret-version-only promotion path that uses the same CAS/hold policy as Task 2 and never puts values in Git. Automatic event integration may be added after manual rotation works. Exercise rotation racing with application promotion and retention of rollback secret versions.
- [ ] Run `cd backend && go test ./internal/ocisecret` plus the isolated OCI integration suite; record failures and missing OCI/stage infrastructure as blocked. Commit.

## Task 4: Image-aware tenant reconciliation and status

**Files:** Modify `backend/internal/orchestrator/orchestrator.go`, `routes.go`, related helpers/tests and `deploy/compose/production-multiserver.yml`; add focused tests under `backend/internal/orchestrator/`.

**Consumes:** `TENANT_BACKEND_IMAGE` as `registry/name@sha256:<digest>`, `RELEASE_ID` and the existing server registry. **Produces:** a private rollout status endpoint carrying desired release/digest, aggregate phase and per-tenant results. GITOPS-03, GITOPS-06.

- [ ] Add tests proving migration jobs and tenant containers use the same configured digest, existing containers with a different resolved image are reconciled, unchanged healthy containers are retained, missing images/failures are visible, and routing/storage/proxy networks remain correct.
- [ ] Run `cd backend && go test ./internal/orchestrator -run 'Test.*(Image|Rollout|Reconcile)'` and confirm failures for the absent digest/status behavior.
- [ ] Implement validated digest selection and image identity comparison; ensure the image is present on the daemon before migration or tenant creation. Preserve ownership checks and never remove unrelated containers.
- [ ] Add internal `GET /internal/gitops/rollout` with release ID, desired digest, completion and per-tenant errors. Keep it on a private network; ensure startup reconcile failure cannot be logged as successful readiness.
- [ ] Run `cd backend && go test ./internal/orchestrator` and focused routing/proxy tests; verify new tenant creation uses the selected release and unchanged tests pass. Commit.

## Task 5: Migration safety, locking and adoption

**Files:** Add focused helpers/tests in `backend/internal/orchestrator/`, master migration ledger under `deploy/migrations/master/`, and adoption tooling under `deploy/gitops/`.

**Consumes:** Task 1 accepted fencing protocol and Task 4 runtime/status. **Produces:** a single-writer protocol shared by rollout and tenant mutations, baseline-aware master migrations, and an adoption report. GITOPS-03, GITOPS-04, GITOPS-08, GITOPS-09.

- [ ] Write integration tests for concurrent create/delete/rollout, bounded lock waits, lost DB session and stale worker resumption, master ledger baseline, migration failure, existing tenant records plus running-only containers, and preservation of volumes/networks.
- [ ] Run `cd backend && go test ./internal/orchestrator -run 'Test.*(Lock|Migration|Adoption)'` against disposable Postgres/Docker and confirm expected failures; record unavailable services as blocked.
- [ ] Implement the Task 1 proven single-writer/fencing protocol; a PostgreSQL advisory lock alone is insufficient to fence stale Docker operations. Define process death, in-flight requests, retry and timeout behavior in code and runbook.
- [ ] Implement master migration ledger and a baseline check against the existing schema; never blindly mark or replay existing migrations. Preserve Atlas tenant history, bucket checks, root routing and trusted proxy network. Any orphan/running-only tenant blocks automatic adoption and remains untouched.
- [ ] Repeat the disposable integration tests including failure injection and old/new schema compatibility. Demonstrate that failures are observable and do not delete existing data. Commit.

## Task 6: Doco-CD stage deployment

**Files:** Create `deploy/gitops/compose.yaml`, `deploy/gitops/doco-cd.yml`, `deploy/gitops/rollout-gate/` and `deploy/gitops/tests/stage-gitops-e2e.sh`; update the production Compose definition only through an adoption-compatible overlay or reviewed transition.

**Consumes:** release snapshot, adapter, tenant controller/status and Task 1 verified Doco-CD version. **Produces:** stage-only Doco-CD service polling `gitops/stage`; one-shot gate blocks healthy status until the exact `RELEASE_ID` and desired digest have converged. GITOPS-02, GITOPS-03, GITOPS-06, GITOPS-07.

- [ ] Write synthetic Compose and stage tests for no inbound webhook, image digests, credential and secret failure, process restart, exact-release readiness, a new release and a secret-version-only release; require the gate to run again each time.
- [ ] Run `bash deploy/gitops/tests/stage-gitops-e2e.sh` on a disposable ARM64 OCI stage and confirm failures before enabling the integration; record blocked if the host or required credentials are unavailable.
- [ ] Wire Doco-CD polling, the webhook secret store, independently bootstrapped private adapter, pinned images, migration jobs and a one-shot readiness gate. Do not place the adapter only in the downstream application stack whose secret resolution depends on that adapter. Set `remove_orphans: false`, `prune_images: false` and do not enable destructive stack removal. Version the Caddy configuration in its image while preserving its data/config volumes.
- [ ] Repeat stage tests with two tenants, drift, missing bucket, timeout, Vault/Git/registry outages and Doco-CD/VM restart. Confirm release status and logs contain no secrets, and required tests pass on actual linux/arm64. Commit.

## Task 7: Rehearsal, runbooks and cutover readiness

**Files:** Update `deploy/README.md`, add `deploy/gitops/runbook.md`, extend `deploy/gitops/tests/stage-gitops-e2e.sh`; retain `.github/workflows/pipeline.yml` production SSH jobs until the separately authorized cutover.

**Consumes:** complete stage stack from Tasks 1–6 and synthetic copy of existing deployment. **Produces:** evidence and an explicit production cutover/recovery procedure. GITOPS-05 through GITOPS-09.

- [ ] Rehearse adoption using backups and a disposable VM: check project/container/volume/network names, Caddy configuration, existing files, root and tenant routes, one deployment writer, migration order and old/new schema compatibility.
- [ ] Restore matching Postgres and object data plus existing encryption keys; rehearse a compatible image rollback, secret-version rollback and an intentionally incompatible migration. Never assert that rolling back Git undoes SQL.
- [ ] Document rotation per credential type: database/MinIO credentials and encryption keys require coordinated changes and cannot be rotated by changing Vault alone. Include retained secret versions, registry/Git access recovery, alert routing and explicit resume after rollback hold.
- [ ] Capture exact source revision, image/OCI versions, architecture, test outcomes, failures and restore evidence; run `bash deploy/gitops/tests/stage-gitops-e2e.sh`. Mark every unavailable check blocked.
- [ ] Prepare the concrete production switch: freeze old writer, verify backups and staged revision, adopt existing stack, verify tenants/public health, then disable old SSH deployment jobs. Present this separately for production authorization; never execute it as part of this plan.

## Self-review

All nine approved acceptance IDs map to a task and to the approved test plan. The plan's named APIs and paths are implementation proposals, not evidence of working behavior. A missing prerequisite pauses dependent work instead of implying a pass; initial delivery keeps production deployment intact.
