# Messenger Intelligence Source v2 Implementation Plan

**Status:** Approved; implementation in progress

**Spec:** [2026-10-10-intelligence-source-v2-design.md](../specs/2026-10-10-intelligence-source-v2-design.md)
**Repository:** `stovo-messenger` only

## Goal

Implement the approved Messenger-side v2 boundary: registered-client OIDC identity, separate one-chat consent and operation grants, a distinct source credential, complete recoverable history synchronization, exact immutable snapshots/citations, current authorization, and durable deletion/revocation invalidation. Keep source access disabled by default and use only synthetic identities/content and disposable local services during development.

## Architecture

- Preserve `/api/v1/intelligence/source` and its response semantics. Add a separate `/api/v2/intelligence` route family and OIDC discovery/JWKS routes.
- Follow the repository's route composition pattern: transport validates HTTP envelopes, `app` derives identity/policy and coordinates persistence, and SQL migrations/store operations enforce transactional ordering and retention invariants.
- Persist a stable opaque subject for the configured issuer. Validate registered client ID and exact callbacks from operator configuration; do not add dynamic client registration.
- Keep OIDC ID tokens, one-use consent codes, Intelligence source credentials, and Intelligence MCP tokens separate. Only hash source credentials and one-use codes at rest; return a source credential once to the confidential Intelligence client.
- Use v2-specific connection/grant/event/revision/payload tables where needed. Do not mutate v1 contracts to accommodate v2, and do not update immutable revision content in place. A purge removes v2 payload bytes while retaining metadata/event identity.
- Materialize bounded backfill pages and capture a committed per-connection fence before the snapshot. Replaying after the fence may duplicate a snapshot item but may not omit a later committed event.
- Require a current `read` grant plus the operation-specific grant for content reads; derive tenant, connection, principal, and chat from server-side credential state.
- Deliver the implementation as dependent, focused PR slices targeting `master`. Keep each PR near or below 300–400 changed code lines; if a slice exceeds that, split it at a task boundary and preserve its dependency. Do not enable a tenant or describe the work as production-ready.

## Tech Stack

Go HTTP/Chi, PostgreSQL migrations and transactional stores, existing Messenger authentication/session model, React/TypeScript/Vitest, and Atlas migration checks. Test clocks, signing keys, identity/client registrations, and source content are synthetic or injected. PostgreSQL/Redis integration tests use only `TEST_DATABASE_URL` and `TEST_REDIS_URL` backed by disposable local services.

## Spec

The approved contract is the linked spec. Its open external dependency remains explicit: Intelligence owners must agree to and verify consumer-side invalidation/cache/index/export suppression before a five-minute end-to-end suppression guarantee or canary readiness can be claimed.

## Global Constraints

- Never read from or modify `stovo-intelligence`, connect a live tenant, enable a real installation, or use production credentials/data.
- Do not send a Messenger bearer credential or ID token to Codex; Codex receives no Messenger credential.
- All authorization failures, stale policy, storage uncertainty, rate limits, and cancellation fail closed. All v2 responses are `Cache-Control: no-store`; audit records contain no content, tokens, codes, or key material.
- Keep OIDC and source integration gates default-off. Missing/invalid issuer, client, callback, or signing configuration must not silently enable the feature.
- Tests are authored before each behavior, run red for the named missing contract, then implementation is added and the same tests run green. Never weaken existing v1 tests.
- Do not run E2E against a shared/live environment. Full final checks are backend `go test ./...`, backend `make lint`, frontend `npm test`, `npm run lint`, `npm run build`, and `atlas migrate hash --dir file://migrations` followed by checking that `atlas.sum` is clean.
- Baseline limitation recorded on 2026-10-10: `go test ./...` could not start because `go` is not installed/on PATH in this environment. `TEST_DATABASE_URL` and `TEST_REDIS_URL` are unset. Resolve tool availability and provide disposable test services before claiming Go or PostgreSQL checks pass.

## Review Focus

Review OIDC protocol validation and credential separation; ensure only `(iss, sub)` links identity; prove browser consent cannot alter callback/scope/grants; verify exact one-chat binding and current grant composition; prove the fence/replay algorithm cannot lose committed events; confirm payload purges preserve immutable metadata/tombstones; and confirm restore fails closed until tombstone freshness is established. Review every migration's FK/cascade behavior and ensure v1 routes/tests remain unchanged.

## Delivery sequence

The phases are sequential because each uses the identity or persistence boundary from the prior phase. The code review/PR owner remains the repository owner; no PR is opened until its slice is complete and verified. Each task below uses red/green tests and commits one small, complete change.

### Phase 1 — OIDC issuer, subject, and authorization-code login

### Task 1 — issuer configuration and stable subject

**Consumes:** current app config and user persistence. **Produces:** validated default-off OIDC config and a stable `(iss, sub)` mapping.

1. Add failing config tests in `backend/internal/config/config_test.go` for default-off OIDC, canonical issuer validation, exact client ID/callback configuration, missing signing material, and invalid key configuration. Run `cd backend && go test ./internal/config`. **Expected:** tests compile and the new OIDC config assertions fail because the behavior is not implemented yet.
2. Add OIDC configuration and validation in `backend/internal/config/config.go`; persist the stable per-user issuer subject in a new migration `backend/migrations/20261010100000_add_intelligence_oidc_identity.sql`. Keep secrets out of defaults and logs. Add unit coverage for subject stability across profile/email changes and uniqueness by `(issuer, subject)` in `backend/internal/app/intelligence_oidc_test.go`.
3. Run the focused config/app tests and, from `backend`, `atlas migrate hash --dir file://migrations`; inspect the migration for safe uniqueness/FK behavior. **Expected:** focused tests pass after implementation and migration hashing exits successfully with `atlas.sum` matching migrations. Commit the issuer/subject slice.

### Task 2 — OIDC metadata, signing-key overlap, and code flow

**Consumes:** Task 1's canonical issuer, client/callback allow-list, and stable subject. **Produces:** registered-client OIDC endpoints and ID tokens that source APIs reject.

1. Add HTTP contract tests in `backend/internal/transport/http/intelligence_oidc_handler_test.go` and app tests in `backend/internal/app/intelligence_oidc_test.go` for discovery/JWKS shape, RS256 key IDs, overlapping rotation keys, PKCE S256, one-use short-lived codes, exact redirect URI, state/nonce, issuer/audience, inactive-user rejection, and generic failure behavior. Run tests red. **Expected:** the existing router lacks the OIDC endpoints and the contract assertions fail for that missing behavior.
2. Implement the provider/authorization operations in `backend/internal/app/intelligence_oidc.go`, HTTP endpoints in `backend/internal/transport/http/intelligence_oidc_handler.go`, and route wiring in `backend/internal/transport/http/router.go` and `backend/internal/app/router_composition.go`. Add HTTP paths `/.well-known/openid-configuration`, `/oauth2/authorize`, `/oauth2/token`, and `/oauth2/jwks`. Bind requests to the single configured Intelligence client and exact callbacks; inject clock/key dependencies for deterministic tests.
3. Run the focused HTTP/app tests and `cd backend && go test ./internal/transport/http ./internal/app`; confirm no ID token is accepted by source authentication. **Expected:** all focused tests pass and the source-auth negative case rejects the synthetic OIDC ID token. Commit this OIDC protocol slice.

### Phase 2 — Separate one-chat consent, grants, and source credential

### Task 3 — consent exchange and revocable source credentials

**Consumes:** Task 2's authenticated Messenger principal and confidential client. **Produces:** one-chat grants, one-use consent exchange, and a separate hash-backed source credential.

1. Add failing app/HTTP contract tests for authenticated active-user consent, exactly one currently accessible chat, four independent initially-denied grants, exact callback, PKCE, one-use code, confidential-client authentication, hash-only credential persistence, atomic rotation, and immediate revocation. Include credential/code non-disclosure in response and audit tests. Run red. **Expected:** consent exchange tests fail because these endpoints and grant records do not yet exist.
2. Add v2 consent tables in `backend/migrations/20261010110000_add_intelligence_source_v2_consent.sql`; implement server operations in `backend/internal/app/intelligence_source_v2_consent.go` and HTTP envelopes in `backend/internal/transport/http/intelligence_source_v2_consent_handler.go`. Mount `GET /api/v2/intelligence/authorize`, `POST /api/v2/intelligence/token`, and `POST /api/v2/intelligence/revoke`. Keep ID token and source credential validation on separate code paths.
3. Add integration cases to `backend/internal/app/intelligence_source_v2_integration_test.go` using only synthetic users, chats, keys, and tokens. Run focused tests and migration hashing. **Expected:** synthetic consent, rotation, and revoke cases pass, with only hashes stored. Commit this backend consent slice.

### Task 4 — browser consent and permission management

**Consumes:** Task 3's consent, list, and revoke APIs. **Produces:** a browser-mediated one-chat grant UI and visible revocation controls.

1. Add Vitest cases in `frontend/src/pages/IntelligenceConsentPage.test.tsx` and `frontend/src/pages/settings/IntelligenceConnectionsSettings.test.tsx` for login continuation, exact chat selection, four independent checkboxes defaulting off, callback/result error states, and revoke-per-grant/connection controls. Run `cd frontend && npm test -- src/pages/IntelligenceConsentPage.test.tsx src/pages/settings/IntelligenceConnectionsSettings.test.tsx`. **Expected:** the tests fail because the consent and connection screens are not present yet.
2. Add the v2 client in `frontend/src/api/intelligence.ts`, the browser page in `frontend/src/pages/IntelligenceConsentPage.tsx`, route wiring in `frontend/src/App.tsx`, and permission/connection controls in `frontend/src/pages/settings/IntelligenceConnectionsSettings.tsx`, `frontend/src/pages/settings/PrivacySecuritySettings.tsx`, and `frontend/src/pages/SettingsPage.tsx`. Add English and Russian strings in `frontend/src/config/strings/english.ts` and `frontend/src/config/strings/russian.ts`. Never place the source credential in browser storage, redirects, logs, or analytics.
3. Run the focused Vitest cases plus frontend lint/build. **Expected:** the new consent/settings cases pass and frontend lint/build succeed. Commit the browser consent slice.

### Phase 3 — V2 source contract, exact snapshots, backfill, and replay

### Task 5 — v2 envelopes, credential identity, and authorization

**Consumes:** Task 3's source credential/grant state. **Produces:** v2 HTTP envelope and current authorization/citation contract while preserving v1.

1. Add handler tests in `backend/internal/transport/http/intelligence_source_v2_handler_test.go` for versioned envelopes/errors, no-store, credential separation, ignored/forged selector IDs, per-operation and per-resource current grants, at-most-300-second decisions, exact read/citation semantics, limits, cancellation, and fail-closed storage/policy errors. Run red. **Expected:** route/handler contract tests fail on missing v2 behavior; existing v1 tests remain green.
2. Add typed v2 models/handlers in `backend/internal/transport/http/intelligence_source_v2_handler.go` and server-derived identity/policy methods in `backend/internal/app/intelligence_source_v2.go`. Add the v2 handler to `RouteComposition` in `backend/internal/transport/http/router.go` and wire it in `backend/internal/app/router_composition.go`, mounting `/api/v2/intelligence/source` beside v1 without changing `intelligence_source_handler.go` behavior. Implement `POST /authorization:check` with current membership, principal activity, one-chat, `read`, `process`, `external_transfer`, `export`, and AI Notes checks.
3. Run focused handler/app tests and existing v1 intelligence-source tests. **Expected:** v2 tests and the unmodified v1 contract tests pass. Commit the v2 contract/auth slice.

### Task 6 — complete backfill, fence, replay, and exact revision reads

**Consumes:** Task 5's v2 resource identity and authorization contract. **Produces:** materialized snapshots, fence-based gap-free replay, exact revision reads, and typed cursor recovery.

1. Add disposable-PostgreSQL contract tests to `backend/internal/app/intelligence_source_v2_integration_test.go` for pre-existing history, a concurrent create/edit/delete around the fence, catch-up and ordinary replay order, safe at-least-once duplicates, tampered/scoped/expired cursors, full-reset recovery, exact revision and Unicode citation behavior, and absence of E2E/ciphertext. Run red against a disposable database. **Expected:** tests compile and fail on missing backfill/recovery or on a specifically asserted event gap.
2. Add v2 revision metadata/payload, event, and materialized-backfill tables in `backend/migrations/20261010120000_add_intelligence_source_v2_sync.sql`. Implement transactional sequence/fence/page materialization and cursor signing in `backend/internal/app/intelligence_source_v2_sync.go`; register dedicated v2 lifecycle capture in the migration without altering v1 response behavior. Add `POST /backfills`, `GET /backfills/{id}/snapshots`, `GET /events`, `GET /resources/{id}/snapshot`, and `POST /citations:resolve` operations to the v2 handler.
3. Run the PostgreSQL integration tests repeatedly to expose ordering races, focused v2 HTTP tests, migration hash verification, and existing v1 source tests. **Expected:** no event committed after the fence is omitted; replays are ordered and idempotent, cursor recovery resets scope, and v1 tests remain green. Commit the synchronization slice.

### Phase 4 — Lifecycle suppression, payload purge, retention, and restore

### Task 7 — lifecycle invalidation and retention/restore boundary

**Consumes:** Task 6's immutable revision and event IDs. **Produces:** deletion/revoke invalidation, bounded tombstone retention, payload purge, and fail-closed restore gating.

1. Add failing integration tests for member/visibility/move/restore invalidation, independent grant and connection revocation, immediate exact-read denial, deletion payload purge with unchanged revision identity, active payload retention while its source remains available, metadata-only tombstone survival, content backup retention no longer than 30 days, tombstone retention through the full restorable-backup horizon plus safety margin, and fail-closed restore behavior when an independent tombstone proof is unavailable. Add handler tests for metadata-only access after read revocation and fail-closed cleanup/storage failure. Run red. **Expected:** tests fail for absent lifecycle/purge/restore behavior, not because of an unrelated fixture or environment error.
2. Implement v2 capture for message and access lifecycle transitions; add source-lifecycle purge and tombstone/backup retention state in migration `backend/migrations/20261010130000_add_intelligence_source_v2_retention.sql`; implement cleanup/restore validation in `backend/internal/app/intelligence_source_v2_retention.go`. Active payloads do not expire by age. Do not reopen routes after database restore using only tombstones restored from that same database; keep restore gated until an independent ledger or verified consumer scope reset is integrated. Do not delete/cascade-delete tombstones needed by a restorable backup. Keep unavailable historical payload reads indistinguishable from not-found.
3. Add or update the operator/runbook contract in `docs/integrations/intelligence-source-v2.md` with disabled-by-default setup, key rotation, migration/retention behavior, restore fail-closed operation, no-live-canary boundary, and the unverified Intelligence consumer suppression obligations. Do not include usable production secrets or enable a tenant.
4. Run the full backend and frontend checks, Atlas hash/checksum check, review migration trigger/order invariants, and inspect audit/log paths for content/credential leakage. **Expected:** all required unit/contract/frontend checks pass; PostgreSQL tests pass with disposable services; `atlas.sum` is clean; no source text or credentials appear in audit/log paths. Commit the retention slice.

## Final verification and delivery

For each PR slice, run its targeted tests before requesting review, inspect `git diff --check`, keep unrelated checkout changes untouched, and link only relevant PR dependencies. Before any canary, obtain written Intelligence-owner agreement to the owner-contract items in the spec and independently verify consumer-side invalidation, cache expiry, and suppression. Messenger implementation alone does not satisfy that condition.
