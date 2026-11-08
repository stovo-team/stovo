---
title: "Stovo multiserver GitOps transition"
type: specification
---

# Stovo multiserver GitOps transition

Status: draft for combined human review. Base: stovo-team/stovo-messenger master at b2a3176a. No deployment or changes to production are authorized by this document.

## Goal and current behavior

Deploy the production multiserver stack on OCI Ampere through a pull-based, Git-controlled release process. GitHub Actions continues to test and publish artifacts; the VM independently pulls an approved release, obtains runtime secrets from OCI Vault, applies the desired state and reports health.

Today `deploy/compose/production-multiserver.yml` defines shared services. The production jobs in `.github/workflows/pipeline.yml` SSH to the VM, build images there, run master and tenant migrations and replace tenant containers. The orchestrator also creates tenants dynamically, runs Atlas migrations and reconciles containers at startup (`backend/internal/orchestrator/orchestrator.go` and `routes.go`). It currently hard-codes `stovo-backend:latest`, does not compare the existing container image against the desired image, and logs startup reconciliation failures without reporting aggregate deployment success.

The VM has already authenticated as an OCI instance principal and read the designated Vault secret. This confirms host access to that secret, not container access, Doco-CD compatibility, or the format and completeness of the secret payload.

## Desired architecture

```text
source master -> CI checks + build ARM64 images -> immutable digests
                         |
                         v
       atomic promotion of tested config + digests -> gitops/production
                         |
                         v  polling (outbound)
                  Doco-CD on OCI VM
                    |           |
             OCI Vault adapter  | Docker Compose shared stack
                    |           v
                    +----> orchestrator -> tenant migration + reconciliation
                                          -> release health and alerts
```

Git is authoritative for production release configuration, image digests, the tenant runtime template and infrastructure configuration. Individual tenant identity, membership and tenant data remain application state in PostgreSQL; creating a tenant through the application does not commit a tenant entry to Git. The orchestrator reconciles those records against the Git-selected runtime template and image. This is a deliberate boundary: an individual tenant list is not Git-managed.

## Release and CI contract

1. Build backend, orchestrator, frontend and Caddy configuration images from one immutable source SHA after the applicable required CI checks pass. Push images to a registry accessible from both CI and the VM. The default proposal is GHCR; confirm repository/package visibility, registry permissions and runner capacity before implementation. Publish linux/arm64 images and record digests, not mutable `latest` tags. Pin the selected infrastructure and helper image digests as well; update these separately with compatibility checks.
2. Promote the complete deployment configuration snapshot, source SHA and image digests together to a dedicated `gitops/production` branch in this repository. The branch contains the Doco-CD configuration and every runtime file that Compose references, including Caddy configuration. Use a separate stage release branch and independent credentials/state. Source-branch pushes or unfinished/failed CI must not change the production release branch.
3. Promotion must identify the tested SHA and enforce an explicit list of required checks, including how conditional or skipped checks are treated. Use protected-branch permissions, a narrowly scoped promotion identity, a release sequence and compare-and-swap against the release branch head to reject stale or out-of-order runs. Required checks must pass; only conditional jobs explicitly determined not applicable may be skipped. A deliberate rollback sets a persistent promotion hold; it is cleared by an explicit resume, not a fresh CI run. Promotion snapshots preserve the current approved secret version.
4. Doco-CD polls the production release branch at a proposed 3-minute interval using outbound Git access. It never polls unvalidated source `master` as the deployment authority. Verify the exact selected Doco-CD version, supported fields and image digest before locking configuration.

## Runtime and tenant reconciliation

- Doco-CD manages the shared Compose project and deploys immutable images; the VM does not build the application for a release.
- The orchestrator receives the selected backend image digest from release configuration and uses the same image for tenant migrations and tenant containers. An initialization step ensures that image is present and authenticated on the Docker host before the orchestrator needs it.
- Keep tenant creation, deletion and tenant data as application operations. Reconcile the registered tenant set, image digest, relevant environment, networks and running status. At adoption inventory the union of registered and running tenant slugs used by today’s pipeline: a running-only tenant is quarantined and blocks cutover until reconciled, never silently deleted. Prove ownership of existing stovo-backend-* containers and proxy networks before adoption. Do not recreate healthy matching containers or remove unowned resources.
- Run master and tenant migrations in a defined order, with a versioned master migration ledger baselined against the existing schema without replaying destructive SQL. Use Atlas history for tenant databases. A PostgreSQL advisory-lock protocol serializes tenant creation/deletion and rollout and uses bounded waits. Lock loss must stop all subsequent Docker/SQL mutations; the implementation must provide and test fencing or an equivalent reliable single-writer mechanism even if a stale process resumes. Advisory locking alone is not accepted as proof of fencing. Freeze the old SSH jobs before the new writer starts: their existing host flock does not share that lock. Adopt expand/contract compatibility so old and new tenant versions can coexist during a rollout. Tenant migration failure leaves that tenant on its last safe runtime when schema compatibility permits, prevents reporting the release as fully healthy and provides a retry path. A migration or missing object bucket must not silently turn into a successful deployment. Preserve existing routing, storage and tenant-proxy checks from the pipeline.
- Aggregate rollout status must expose desired and applied release, per-tenant failures and readiness. Doco-CD must have a tested way to detect an incomplete rollout, for example an explicit one-shot readiness gate; validate its actual behavior on the pinned Doco-CD version before adoption.
- Preserve the existing Compose project, volume, network, container and data mount identities during adoption; replace the Caddy configuration bind mount only as described below. In particular verify stovo_default, stovo_minio-data and stovo-master-members-proxy-v2 on the actual VM. Bake the versioned Caddyfile into the pinned Caddy configuration image instead of relying on an ephemeral checkout bind mount, and verify that changes reach the running proxy after every release and restart. Disable automatic orphan removal, image pruning and destructive stack teardown until specifically assessed. Never delete or recreate database, Redis, MinIO, Caddy state or tenant data as a consequence of the transition.

## Secrets and bootstrap

The documented Doco-CD providers do not include OCI Vault. Use its generic webhook provider with a small OCI adapter that authenticates using the VM instance principal and reads the authorized Vault secret. A private endpoint returns only allowlisted keys, fails closed and never logs secret values. Validate access to instance metadata from the adapter's actual network namespace; host CLI success alone does not prove it. Restrict adapter access and VM metadata/Docker access; the Docker socket provides host-equivalent control.

Proposed contract: an OCI secret version contains a JSON object keyed by existing Compose environment variable names. The GitOps release records a non-secret OCI version number, and every adapter key lookup for that release requests that same version; concurrent rotations must not mix values from different versions. First inspect the existing payload's format and required keys without printing values; adapt the mapping or migrate the payload without generating new application credentials. Preserve encryption keys and all existing database, storage, TURN, LiveKit and authentication credentials. No plaintext secrets in Git, CI logs or deployment output.

If the deployment repository or image registry is private, bootstrap separate least-privilege read credentials before Doco-CD starts. Store their source in OCI Vault and stage transient files with restricted permissions via a host bootstrap service that starts before Doco-CD and does not depend on it; specify and test token refresh, restart and revocation behavior. The existing IAM policy is limited to the single supplied secret OCID: other secrets need explicit narrowly scoped authorization. Verify actual repository/package visibility and the Doco-CD credential-file behavior.

Secret rotation publishes a secret-version-only GitOps commit after the new Vault version is available; Doco-CD sees that commit on its normal poll and applies the newly pinned version. An OCI event-to-promotion integration is a proposed automation; an authorized manual promotion is the initial fallback. Neither requires an application source commit. Keep previously deployed Vault versions available for the supported rollback window, including protection against premature scheduled deletion. Test the event integration, consistency, coordination with app promotion and rollback, and actual Doco-CD behavior. Rotation policies are key-specific: changing PostgreSQL or MinIO credentials in Vault alone does not change existing server credentials, so coordinated update procedures and compatibility windows are required; changing the message encryption key or other data-encryption material requires a separate migration and is never an automatic secret refresh. Plan TURN, LiveKit and authentication-key rotation with their consumers before enabling it. Do not rely on an unchanged Git revision triggering rotation. If Vault is unavailable or values are missing/invalid, keep the last healthy workload running, mark the release failed and retry without substituting defaults or generating production secrets.

## Adoption, recovery and observability

1. Inventory the production VM read-only: Compose project name, volumes, networks, image versions, tenant inventory, routing, secret keys, registry access and architecture. Do not disclose values.
2. Build a separate staging environment with synthetic secrets and data, including multiple tenants and realistic storage. Prove a cold install, image promotion, tenant lifecycle, secret rotation and simulated failures on real ARM64.
3. Rehearse adoption from a copy of the current deployment: preserve project and volume identities, take and verify database and object-store backups, and prove restore. Test failure and rollback against migration compatibility; Git rollback alone does not undo database migrations.
4. Production cutover is a separate authorized operation. Freeze and serialize both deployment paths, verify backups, run the rehearsed adoption, verify public and tenant health, and then disable the old SSH deployment jobs. There must be exactly one active deployment writer. Keep a documented recovery path.
5. Report source SHA, desired/applied image digests, migration state, tenant rollout progress, Doco-CD health, secret-adapter failures and last successful sync. Alerts must not include secret values.

## Proposed change map and dependencies

- `.github/workflows/pipeline.yml` and a dedicated release/promotion workflow: retain test gates, build and publish ARM64 artifacts, generate a complete release snapshot and remove SSH deployment only at cutover. Account for the existing emergency backend-only bypass explicitly; it must not implicitly bypass the new promotion gate.
- `deploy/compose/production-multiserver.yml`, Caddy packaging and new GitOps deployment/bootstrap configuration: preserve the existing resources while converting application builds to digest-pinned images; ensure the published release branch contains every required file.
- `backend/internal/orchestrator/orchestrator.go`, `routes.go` and focused controller/DB integration tests: use one desired backend digest for migrations and tenant containers, compare actual image identities, coordinate tenant operations and surface per-tenant rollout status.
- A small OCI Vault webhook adapter and bootstrap unit in `deploy/`: expose a private allowlisted lookup endpoint and use instance principal authentication. Go with the official OCI SDK is the initial candidate because the existing backend uses Go; a host CLI adapter is an alternative. Select the exact SDK/version only after checking Go compatibility, transitive dependencies, advisories and ARM64 runtime. Oracle documents the SDK under UPL 1.0 or Apache 2.0; no dependency has been added yet.
- Deployment runbook and stage acceptance evidence: inventory, credentials, promotion, rotation, recovery, observability, migration compatibility and ownership transfer.

The Doco-CD one-shot gate must be proven to rerun for every release and secret version, report nonzero exit and timeout as failures, and wait for the orchestrator's aggregate status. Doco-CD reporting a successful Compose apply alone is not proof that asynchronous tenant rollout completed. Verify which component owns retries and the lock after process restart.

## Acceptance criteria

- **GITOPS-01:** Only an atomically promoted release built from the exact CI-passing source SHA is eligible for production polling; failed, pending, stale and out-of-order runs cannot promote.
- **GITOPS-02:** Doco-CD polls the designated release branch and deploys pinned application image digests and complete versioned configuration without inbound webhook access or SSH deployment.
- **GITOPS-03:** Shared services and every registered tenant converge on the desired release; new tenant creation and deletion continue to work through the application, including during a rollout.
- **GITOPS-04:** Tenant and master migrations execute in the defined order with failure surfaced and without unsafe implicit schema rollback.
- **GITOPS-05:** OCI instance principal reads only the authorized secret; all variables of a deployment come from its Git-pinned Vault version and reach intended workloads without being committed or logged. A secret-version-only GitOps commit applies rotation without an application source commit.
- **GITOPS-06:** Missing/invalid secret, Vault/Git/registry outage, failed migration or unhealthy tenant is visible and does not report a successful release; retry and recovery preserve existing data.
- **GITOPS-07:** Doco-CD, OCI adapter, application images and dependencies run on actual linux/arm64; selected image manifests and stage startup are verified.
- **GITOPS-08:** Adoption preserves production project/volume/network identities and tenant data, and a tested recovery procedure covers failed cutover and compatible rollback.
- **GITOPS-09:** CI and the new system have one deployment writer at cutover; old SSH-based production deployment is retired only after validation and explicit authorization.

## Delivery phases

1. Inventory and design verification: validate OCI payload shape, Docker/Compose versions, ARM64 manifests, registry access, running project identities and staging capacity. The public `ghcr.io/kimdre/doco-cd:0.125.1` image index was inspected on 2026-10-29: index digest `sha256:38198abbda1b55da7a7f37a7924b2ccdcc0583bd24466b7c2103ef6cd2ffc828` contains a linux/arm64 manifest `sha256:d19a6725b8b97574116f32c8eab26d332e69f1a569fceff30983dda7d6ed309f`. Actual VM startup and remaining image manifests remain unverified.
2. CI release pipeline: immutable images and atomic, CI-gated promotion; verify concurrent and stale runs.
3. OCI secrets integration: bootstrap, adapter, access controls, rotation and failure tests.
4. Orchestrator and Compose migration: immutable tenant image, image-aware reconciliation, migrations, rollout status and one-shot gate.
5. Doco-CD staging: bootstrap, polling, Git/registry authentication, drift recovery, restart and end-to-end tests.
6. Adoption rehearsal, observability and documented rollback; separately authorize production cutover.

Detailed test cases and evidence requirements are in `docs/agent-workflows/test-plans/full-gitops-oci.md`. Implementation is blocked until the spec and test plan receive the combined review required by the repository workflow. Promotion policy, registry choice and the exact adapter runtime are proposed decisions for review, not descriptions of existing infrastructure.

## Sources

- Doco-CD polling: https://doco.cd/latest/Poll-Settings/
- Doco-CD secret providers: https://doco.cd/latest/External-Secrets/
- Doco-CD webhook secret provider: https://doco.cd/latest/External-Secrets/Webhook/
- Doco-CD one-shot and init services: https://doco.cd/latest/Advanced/Pre-Post-Deployment-Scripts/
- OCI Go SDK and license: https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/gosdk.htm
- OCI instance principals: https://docs.oracle.com/en-us/iaas/Content/Identity/Tasks/callingservicesfrominstances.htm
- OCI instance metadata: https://docs.oracle.com/en-us/iaas/Content/Compute/Tasks/gettingmetadata.htm
