# Stovo Multiserver GitOps Operations Runbook

This runbook outlines operational procedures for the GitOps release pipeline, secret rotations, rollback holds, disaster recovery, and production cutover.

## 1. Release Promotion & Rollback Hold

### Promoting a Release
Releases are promoted automatically by CI upon green required checks. To manually promote or check status:
```bash
node scripts/gitops/promote.mjs --candidate <path-to-candidate-release.json>
```

### Engaging Rollback Hold
If an incident or regression occurs and automatic promotion of newer releases must be paused:
```bash
node scripts/gitops/promote.mjs hold --reason "Investigating crash on tenant migration"
```
While hold is active, subsequent CI promotion attempts will be rejected with an active hold error.

### Resuming After Rollback Hold
Once the root cause is resolved and verified:
```bash
node scripts/gitops/promote.mjs resume
```

---

## 2. Secret Rotation Policy

Secrets in OCI Vault are versioned monotonically. Doco-CD resolves external secrets via the private `oci-secret-adapter` lookup endpoint:
`GET /v1/secrets/{version}/{key}`

### Coordinated Database & MinIO Rotation
- Database passwords (`POSTGRES_PASSWORD`) and MinIO credentials (`MINIO_ROOT_PASSWORD`):
  1. Update credentials in PostgreSQL / MinIO first (or create parallel dual-auth user).
  2. Create a new version in OCI Vault containing the updated keys.
  3. Promote the new secret version using a secret-version-only GitOps commit.
  *Note:* Simply changing the Vault value without updating the underlying database will cause connection failures.

### Application Secret Rotation
- `MASTER_SECRET`, `TURN_PASSWORD`, etc.:
  1. Add new secret version to OCI Vault.
  2. Promote the new `secret_version` on `gitops/stage` or `gitops/production`.
  3. Doco-CD triggers restart of affected workloads with the new pinned version.

---

## 3. Disaster Recovery & Rollback

### Rollback Procedure
1. Identify the last known good GitOps commit on the release branch:
   ```bash
   git log -n 5 gitops/production
   ```
2. Reset branch head using atomic compare-and-swap (CAS), or publish an explicit rollback release commit with a decremented release target and persistent hold flag.
3. *Important:* Reverting Git commits does not revert PostgreSQL schema migrations. If an incompatible database migration was applied, execute compensating SQL forward; do not rely on Git rollback alone.

### Adoption & Container Verification
Before cutover or after host reboot:
```bash
bash deploy/gitops/adopt.sh
```
Verify that all running `stovo-backend-*` containers have corresponding records in the master PostgreSQL `servers` table and proxy networks (`stovo_default`, `stovo-master-members-proxy-v2`) are intact.

---

## 4. Production Cutover Checklist

1. [ ] Freeze old SSH deployment jobs (`.github/workflows/pipeline.yml`).
2. [ ] Take full PostgreSQL backup (`pg_dumpall`) and MinIO bucket snapshot.
3. [ ] Run `bash deploy/gitops/adopt.sh` to ensure no orphan running-only containers exist.
4. [ ] Start independently bootstrapped `oci-secret-adapter` on `127.0.0.1:8089`.
5. [ ] Launch Doco-CD pointing to `gitops/production`.
6. [ ] Verify `/internal/gitops/rollout` returns `{"completed": true, "phase": "ready"}`.
7. [ ] Verify public website, WebSocket connections, tenant routing, and audio/video calls.
8. [ ] Retire SSH deployment keys and secrets from repository settings upon verified cutover.
