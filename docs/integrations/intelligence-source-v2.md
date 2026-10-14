# Messenger Intelligence Source v2 operations

This document describes the Messenger-side v2 boundary implemented for a future, explicitly approved canary. It is not a production enablement request or a claim that the Intelligence consumer is ready.

## Default state and enrollment

Source access stays disabled unless both process gates are enabled:

- `INTELLIGENCE_SOURCE_ENABLED` defaults to `false`.
- `INTELLIGENCE_OIDC_ENABLED` defaults to `false` and is a separate gate.

Keep both false in development, staging, and production until the Intelligence owner has approved the v2 contract and the rollout owner has separately authorized an installation. Enabling these flags alone does not grant a user or client access. The client ID, exact HTTPS callback allow-list, active installation, one-chat connection, and each individual grant are checked separately. Grants (`read`, `process`, `external_transfer`, and `export`) start denied; do not treat chat membership as consent.

When a future rollout is approved, provision only operator-controlled configuration. The OIDC settings are `INTELLIGENCE_OIDC_ISSUER`, `INTELLIGENCE_OIDC_CLIENT_ID`, `INTELLIGENCE_OIDC_CLIENT_SECRET`, `INTELLIGENCE_OIDC_REDIRECT_URIS`, `INTELLIGENCE_OIDC_SIGNING_KEY_ID`, `INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM`, and optionally `INTELLIGENCE_OIDC_PREVIOUS_SIGNING_KEYS_JSON`. The issuer must be its canonical HTTPS origin and callbacks must be exact registered HTTPS URIs. Keep confidential secrets and private signing keys in the deployment secret manager; do not add them to repository files, tickets, chat, test output, or logs. Use synthetic values and identities for local verification.

OIDC ID tokens, one-use consent codes, and source bearer credentials are separate credentials. Store only the source credential verifier in Messenger; deliver the source credential once to the registered confidential client. Never pass Messenger credentials to Codex or use an ID token as a source credential.

## Signing-key rotation

Use an overlap rotation so already-issued ID tokens remain verifiable:

1. Generate a new RSA signing key outside the repository while leaving the current signer active. Add the new public key and a new unique key ID to `INTELLIGENCE_OIDC_PREVIOUS_SIGNING_KEYS_JSON`, deploy, and confirm the JWKS endpoint advertises both IDs. This setting accepts public PEMs only; it must not contain private-key fields.
2. Switch `INTELLIGENCE_OIDC_SIGNING_KEY_ID` and `INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM` to the new key, and replace the previous-key entry with the former signer's public PEM and ID. Confirm the JWKS still advertises both IDs and newly issued ID tokens use the new `kid`.
3. Keep the former public key published until every token signed by it has expired and the relying party has confirmed the overlap. Then remove it from the previous-key list.

If key material, a client secret, or a source credential may have leaked, disable both feature gates while investigating. Rotate the affected key/secret or revoke the affected source connection; do not log or paste the credential during incident handling.

## Schema migration and retention

Apply the backend migrations through the normal deployment migration job. Before rollout, validate the migration set with Atlas and verify `backend/migrations/atlas.sum` is clean. The v2 retention migration adds payload expiry, backup horizons, metadata tombstones, a backup-inventory checkpoint, and restore-gate state. Source connections are detached from deleted users/installations after retirement so immutable event/revision identities survive account cleanup. Do not manually delete v2 event/revision identities to imitate content deletion.

Messenger limits each content payload to at most 30 days. Message deletion, chat-scope exit, read-grant revocation, or connection revocation purges the affected payloads transactionally with the invalidation event. Expired payloads are removed by the retention worker at startup and on its hourly sweep. An exact read whose payload has been purged returns the same not-found result as an unavailable or out-of-scope revision. Metadata-only events retain stable IDs and revision identity after the short-lived tombstone ledger entry is pruned.

The retention coordinator accepts each restorable database backup's creation time and last-restorable time, plus a complete-inventory checkpoint. The DB-only `intelligence-source-ops` CLI provides the manual operations `backup register` and `inventory verify`; the self-hosting guide shows how to run them before and after the dump. This repository still has no automated backup-controller call site, so the backup owner must wire the controller to those operations before claiming automated backup integration. If operators do not keep the inventory current, expired content payloads are still purged while tombstone and backup metadata pruning fails closed and can grow without bound. The restorable window is capped at 30 days; the tombstone ledger remains at least 7 additional days beyond the applicable backup horizon and never less than 37 days from tombstone creation. If backup metadata is missing, stale, or inconsistent, do not prune the ledger or begin a restore. Do not extend backup restorability beyond 30 days without changing the contract and its tests first.

## Restore procedure

Treat any database restore as a source-access outage until the tombstone replay check completes. `INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH` is deployment state stored outside database backups. Set a new unpredictable epoch in the deployment configuration before each restore; the restored database retains its old epoch, so v2 source routes return unavailable even if the restored row says `blocked=false`. Successful restore completion records the new epoch only after fresh tombstone replay verification. Do not reuse an epoch across database restores.

The DB-only `intelligence-source-ops` executable invokes the same coordinator methods without constructing the application server or starting Redis/workers. Its command forms are `backup register --backup-id ID --created-at RFC3339-UTC --restorable-until RFC3339-UTC`, `inventory verify --verified-at RFC3339-UTC`, `restore begin --restore-id ID --backup-created-at RFC3339-UTC`, and `restore complete --restore-id ID --ledger-checked-at RFC3339-UTC` with the applied-through watermark object on stdin. `restore begin` writes metadata-only tombstones as JSON; the other successful commands write `{"ok":true}`. The one-shot Compose invocations are documented in the [self-hosting backup and restore guide](../self-hosting/docker-compose.md#intelligence-source-v2-backup-and-restore).

This is a manual operator path. There is still no automated backup-controller call site, and this repository does not implement the external Intelligence consumer's tombstone replay or watermark reporting. Those integrations must be deployed and exercised before any canary; keep both process gates disabled. The required restore sequence is:

1. Keep both process gates disabled, stop source traffic, and set a new unpredictable `INTELLIGENCE_SOURCE_V2_RESTORE_EPOCH` outside the database backup.
2. Restore PostgreSQL and matching objects. Before starting the backend, run `restore begin` with a unique restore ID and the exact UTC creation time of the registered backup. A backup older than the v2 ledger start, unregistered, newer than now, or more than 30 days old is not admissible.
3. Replay every returned metadata tombstone into the corresponding Intelligence consumer scope. Do not expose restored content while replay is incomplete.
4. Report the consumer's applied per-connection source-sequence high-water marks to `restore complete` on stdin, with a ledger check time no older than five minutes. The coordinator compares them against the current ledger while serializing with connection writers. If any watermark is behind, the ledger is stale, or storage is unavailable, the restore gate stays closed; fetch and replay again.
5. Start the serving backend only after coordinator success. Keep both process gates off unless the rollout owner separately authorizes source access. If coordinator state is missing or uncertain, leave the gates off and do not clear the database gate by hand.

The application restore gate denies v2 source routes when its row is missing, marked blocked, or contains an epoch different from deployment state. Cleanup/storage errors are surfaced as unavailable and must not be treated as successful cleanup or restore verification. Preserve the restore gate, tombstone ledger, backup-inventory checkpoint, and backup-horizon metadata when restoring Messenger database state.

## Release and consumer boundary

There is no live canary in this implementation task. Development and verification use synthetic identities/content and disposable local PostgreSQL/Redis only. Do not connect a live tenant, enable an installation, or claim production readiness based on Messenger tests.

Messenger emits durable invalidations, checks current grants on reads, and caps authorization-decision freshness at 300 seconds. This alone does not prove end-to-end suppression. Before any canary, the Intelligence contract owner must agree to and independently verify invalidation consumption, cache/index/export expiry, full-scope reset after cursor expiry, exact-revision citation behavior, and restore replay ordering. Until then, the consumer-side suppression obligation remains unverified and no five-minute end-to-end suppression guarantee may be claimed.
