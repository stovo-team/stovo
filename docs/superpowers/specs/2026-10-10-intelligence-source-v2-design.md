# Messenger Intelligence Source v2

**Status:** Design for review
**Date:** 2026-10-10
**Repository scope:** `stovo-messenger` only

## Feature plan

**User problem.** A future limited canary needs a Messenger source boundary that identifies one user, scopes one Intelligence tenant to one Messenger chat, and exposes that chat's accessible plaintext history without giving Codex Messenger credentials or trusting caller-supplied identity fields.

**Observable behavior.** A registered Intelligence client can authenticate a user through Messenger OIDC, then run a separate browser consent flow for one chat. Messenger issues four independent, revocable grants (`read`, `process`, `external_transfer`, `export`), all denied by default. A consent code exchanged server-to-server yields a distinct source credential. With current authorization, the connection can backfill a complete snapshot, catch up concurrent changes without gaps, replay stable ordered events, read exact immutable revisions, and resolve exact-revision citations. Deletes and scope changes invalidate data. E2E-encrypted messages and ciphertext never enter indexable source responses or snapshots.

**Constraints.** Work only in Messenger. Use synthetic identities/content and fake ports or disposable local infrastructure. Do not call a live tenant, enable an installation, or claim production readiness. No Intelligence-side code changes are in scope. A Messenger contract change that exceeds the existing v1 schemas is explicitly versioned as v2 and remains a proposal for Intelligence owners until they agree to it.

## Current code and gaps

The branch already contains a default-off `/api/v1/intelligence/source` API, per-connection hashed bearer credentials, installation/connection/chat-scope records, partial message/member event capture, immutable revision/event rows, signed connection-scoped cursors, current membership and AI Notes checks, exact-revision snapshot/citation handlers, limits, and metadata-only audit records. Existing tests cover those implemented paths, including E2E exclusion and fail-closed behavior.

The code does not implement OIDC, persistent opaque OIDC subjects, browser account linking, independent consent grants, source credential enrollment/rotation, or a full initial snapshot. A cursor expires after seven days, but its `full_backfill_required` response has no recovery endpoint. Thirty-day retention/pruning and a verified five-minute suppression bound are absent. Existing database triggers do not cover the full lifecycle. External transfer and export currently deny. These gaps are not treated as implemented behavior.

## Design

### 1. Version boundary and client enrollment

- Add a distinct Messenger source v2 route/schema family. Do not change v1 response semantics or label v2 as v1-compatible. Keep all v1 and v2 source access unavailable unless the server feature gate, registered client, installation, and connection are explicitly enabled.
- Register the Intelligence OIDC client from operator-controlled configuration/provisioning with an exact client ID, allowed callback URI set, and confidential-client authentication for server-to-server exchanges. No dynamic client registration or caller-selected callback URLs.
- Resolve a connection credential server-side to installation, Intelligence tenant ID, Messenger family, exactly one chat, and one active Messenger principal. Request tenant, connection, installation, family, chat, and principal IDs are selectors at most and never authority.

### 2. OIDC identity, separate from source consent

- Publish OIDC discovery and JWKS at the configured canonical issuer. Implement Authorization Code with PKCE S256, required `state` and `nonce`, exact issuer and audience validation, one-use short-lived authorization codes, and signing-key IDs with overlapping public-key publication during controlled rotation.
- Give each Messenger user a persisted random opaque subject that remains stable across email/profile changes. Identity linking is strictly `(iss, sub)`; email is not an identity key. Only a logged-in active user can complete authorization.
- OIDC returns an ID token whose audience is the registered Intelligence client. The ID token is not accepted by source endpoints and does not grant data access.
- Messenger does not issue Intelligence MCP tokens. After validating Messenger identity, Intelligence issues its own Codex MCP token with Intelligence as audience. OIDC ID tokens, Messenger source credentials, and Intelligence MCP tokens are three non-interchangeable credentials; Codex never receives a Messenger credential.
- Provide a separate browser account-linking OAuth authorization-code flow. The logged-in user selects exactly one currently accessible chat and explicitly consents to each grant. Each grant starts denied and can be revoked independently. Membership alone grants none of `process`, `external_transfer`, or `export`; an operation requires its own current grant and the current resource scope. Operations that read content also require `read`.
- Return the account-linking code only to the exact registered Intelligence callback. Intelligence authenticates as the registered client and exchanges the one-use code server-to-server. Messenger returns a separate random source bearer credential once and stores only its verifier/hash. Intelligence stores that credential on its side. Revoke and rotate operations invalidate old credentials immediately; neither the OIDC token nor Messenger credentials reach Codex.

### 3. Source v2 schemas and replay

Define versioned request/response/error schemas for event pages, signed cursors, backfill/recovery progress, snapshots, authorization decisions, and citation resolution. The contract includes:

- `SourceEvent`: stable `event_id`, resource and immutable revision IDs, connection-bound order token/sequence, resource kind, container, observation time, lifecycle kind, and tombstone marker. Delivery is at least once; consumers deduplicate by event ID. The per-connection sequence is allocated transactionally so later writers cannot commit a lower source position after a higher one.
- `SourceEventPage`: `{events, next_cursor, has_more}`. Cursors are opaque, signed, versioned, scoped to one connection and chat, and expire after seven days. Tampering or scope substitution fails closed. Expiry returns a typed 410 recovery error that starts a full backfill.
- `ResourceSnapshot`: resource kind and exact shared content/metadata revision IDs, content, and metadata from one immutable revision. Missing, deleted, expired, or out-of-scope revisions never fall back to current content.
- `AuthorizationDecision`: tenant, connection, server-mapped principal, resource, operation, allowed result, scope, policy revision, `decided_at`, and `valid_until`. Every allow decision is current at evaluation and expires within 300 seconds. Responses are `no-store`; stale or unavailable decisions deny.
- `CitationResolution`: exact revision ID, source reference, and excerpt. Text offsets are half-open Unicode code-point offsets into the canonical text block. An unavailable historical revision is never substituted with the current revision.
- `SourceError` and recovery response: stable versioned error code, HTTP mapping, and recovery action. Unknown/out-of-scope resources are indistinguishable; policy/storage uncertainty fails closed.

#### Proposed endpoint and envelope set

OIDC discovery is `GET /.well-known/openid-configuration`; it advertises `GET /oauth2/authorize`, `POST /oauth2/token`, and `GET /oauth2/jwks`, `response_types_supported:["code"]`, `code_challenge_methods_supported:["S256"]`, `id_token_signing_alg_values_supported:["RS256"]`, and `subject_types_supported:["public"]`. An ID token contains `iss`, stable opaque `sub`, `aud` equal to the registered Intelligence `client_id`, `iat`, `exp`, and the request `nonce`.

The distinct data-consent flow is `GET /api/v2/intelligence/authorize?response_type=code&client_id=...&redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256` (then one-chat/four-grant user consent), `POST /api/v2/intelligence/token` (confidential-client authentication, one-use `code`, exact `redirect_uri`, and `code_verifier`), and `POST /api/v2/intelligence/revoke` (confidential client plus the source token to revoke). Token exchange returns `{schema_version:"v2", token_type:"Bearer", access_token, expires_in:2592000, granted:["read", ...]}`. The 30-day bearer token is source-only; it is neither the OIDC ID token nor a Messenger login credential. Reauthorization rotates it and revokes the previous token atomically.

The source base path is `/api/v2/intelligence/source`:

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /backfills` | Empty object for first seed or expired-cursor recovery | `{schema_version, backfill_id, snapshot_cursor, scope_reset:true}` |
| `GET /backfills/{backfill_id}/snapshots?cursor=...` | Opaque snapshot cursor | `{schema_version, snapshots:[ResourceSnapshot], next_snapshot_cursor, has_more, fence_cursor?}`; final page includes `fence_cursor` |
| `GET /events?cursor=...&limit=1..200` | Opaque fence or ordinary event cursor | `{schema_version, events:[SourceEvent], next_cursor, has_more}` |
| `GET /resources/{resource_id}/snapshot?revision_id=...` | Exact resource and revision selectors | One exact `ResourceSnapshot` |
| `POST /authorization:check` | `{schema_version:"v2", resource_ids:[...], operation}` | `{schema_version, decisions:[AuthorizationDecision...]}` in request order |
| `POST /citations:resolve` | `{schema_version:"v2", resource_id, revision_id, locator:{kind:"text",start,end}}` | `{schema_version, source_reference, revision_id, excerpt}` |

The corresponding stable field sets are:

```text
SourceEvent = {
  schema_version:"v2", event_id, tenant_id, connection_id, principal_id,
  resource_id, resource_kind:"message.text", revision_id, order_token,
  source_sequence, container_id, observed_at,
  kind:"create"|"update"|"delete"|"restore"|"move"|"acl_change",
  tombstone
}
ResourceSnapshot = {
  schema_version:"v2", tenant_id, connection_id, principal_id,
  resource_id, resource_kind:"message.text", revision_id,
  content_revision_id, metadata_revision_id, observed_at,
  content:{kind:"text", canonical_text}, metadata:{...}
}
SourceError = {
  schema_version:"v2",
  error:{code, message, recovery:null|{action, endpoint}}
}
```

The event page cursor and snapshot page cursor are opaque strings, not decoded sequences. Both are signed and bind the tenant, connection, one-chat scope, cursor purpose, and expiry. The recovery endpoint starts a new full backfill with a new scope-reset ID. The Intelligence consumer clears that connection's old indexed scope before applying snapshot pages, then starts event replay at the returned fence; it never resumes an expired cursor in place.

The authorization request accepts only resource selectors and one of the four operations; tenant, connection, principal, and chat are always resolved from the credential. A decision is `{schema_version, tenant_id, connection_id, principal_id, resource_id, operation, allowed, scope:{kind:"chat",resource_id}, policy_revision, decided_at, valid_until}`. Its validity interval is positive and at most 300 seconds. A citation excerpt is returned only after a fresh `read` decision and exact revision/offset checks. All endpoints return `Cache-Control: no-store`. Standard failures are 400 `invalid_request`, 401 `invalid_credential`, 403 `disabled_or_denied`, 404 `not_found` for both unknown and out-of-scope resources, 410 `cursor_expired` with `recovery:{action:"full_backfill_required",endpoint:"/api/v2/intelligence/source/backfills"}`, 429 `rate_limited`, and 503 `source_unavailable`; none of these error bodies contain source text or credentials.

The backfill protocol exposes this consumer order: **snapshot pages → fence → catch-up replay after the fence → ordinary event cursor**. The server captures a per-connection committed high-water fence before opening a consistent snapshot; the snapshot can include changes after the fence, which replay may duplicate, but all changes committed after the fence have an event position after it. Stable event/revision IDs and sequence ordering make these duplicates safe. Materialize the snapshot for pagination so no database transaction remains open while the client pages. An expired cursor repeats the same full-snapshot/fence/replay process and begins with a connection-scope reset; deleted content is not reconstructed from stale revisions.

Capture create, edit, delete, restore, move/scope exit, membership and visibility changes. Access changes emit metadata-only invalidation events and can never grant permission. Backfill includes only currently accessible text messages whose content Messenger can read (`legacy_plaintext` or `server_at_rest` decrypted inside Messenger after current authorization). E2E-encrypted content and ciphertext are absent from events, snapshots, and citations; a transition out of an eligible state emits only a metadata tombstone.

### 4. Authorization, revocation, retention, and restore

- Evaluate `read`, `process`, `external_transfer`, and `export` against current principal activity, chat membership, connection scope, and that operation's current grant for every request. `process` also obeys Messenger's current AI Notes policy. `external_transfer` authorizes transfer of relevant evidence snippets to Qwen; `export` authorizes returning evidence/citations through Codex. They remain separate. All are denied when any required policy is missing, stale, or unavailable.
- Revoking `read` immediately denies content access and deletes that connection's active source payloads; a scoped bearer may continue receiving metadata-only invalidations until the whole connection is revoked. Revoking another grant immediately denies that operation and emits an invalidation so Intelligence can suppress affected derived or exported results. Revoking the connection invalidates its bearer credential immediately. Message deletion immediately removes active content. Immutable revision IDs are never rewritten to different content; after a purge their payload is unavailable and exact-revision reads return not-found. Preserve only metadata-only tombstones and event identity for at least 30 days.
- Tombstones suppress snapshot/backfill resurrection. Content backups are retained no longer than 30 days. Retain tombstones for at least 30 days and at least until every restorable backup that may contain the deleted content has expired, with a safety margin at the retention boundary. Before a restored service exposes source results, replay a tombstone ledger newer than the restored content backup; if freshness cannot be established, keep source routes disabled. Retention cleanup must not violate immutable event semantics or cascade-delete required tombstones.
- Messenger decisions, snapshot/citation reads, and event content checks fail closed immediately on revoke/delete. Messenger advertises a maximum decision staleness of 300 seconds and publishes durable invalidations. The five-minute end-to-end suppression guarantee also depends on Intelligence consuming invalidations and expiring cached/indexed/exported results; it cannot be claimed until that owner agrees to and verifies the matching consumer behavior.
- Audit decisions and lifecycle operations without message text, citation text, bearer credentials, authorization codes, or key material. Preserve current request/page limits and rate limiting; limit failures, timeout, storage errors, and policy errors never produce partial allow decisions.

### 5. Release boundary and Intelligence owner agreement

Do not enable a tenant or installation, connect a live Intelligence/Messenger tenant, or describe the feature as production-ready. Before a canary, the Intelligence contract owner must agree on: OIDC issuer/client/callback and `(iss, sub)` mapping; an explicit Intelligence allow-list containing only the admitted canary subject; the distinct consent-code/source-credential exchange; v2 schemas and error envelopes; one-chat scope; four grant composition; snapshot/fence/replay/cursor-expiry ordering; the 300-second authorization freshness and actual suppression obligation; exact-revision citation semantics; E2E exclusion; and tombstone/backup restore ordering and retention.

## Test plan

Only synthetic identities, content, fake external ports, and disposable local services are used. No test configuration may point at a live tenant or installation.

| Contract area | Observable cases and assertions | Test layer |
| --- | --- | --- |
| OIDC identity | Discovery/JWKS, S256 PKCE, state/nonce, exact issuer/audience (including rejection by a synthetic relying-party verifier), inactive user rejection, stable opaque `(iss, sub)`, key rotation overlap | HTTP contract + unit |
| Separate account link | Exactly one chat, registered callback only, one-use server exchange, source credential distinct from ID token, four grants independently issued/revoked and default denied | HTTP contract + integration |
| Scope and credential lifecycle | Forged request IDs ignored, cross-tenant/chat substitution denied, rotation/revocation invalidates old credential, logs contain no codes/credentials | HTTP contract + integration/log review |
| Full backfill and replay | Pre-existing history included; concurrent create/edit/delete across snapshot/fence is not lost; ordered replay, retry, duplicates, cursor tampering/expiry and recovery do not resurrect deleted content | PostgreSQL integration + HTTP contract |
| Immutable revisions and citations | Exact content/metadata revision, half-open Unicode code-point offsets, missing historical revision never substituted, E2E content/ciphertext absent | PostgreSQL integration + HTTP contract |
| Current policy and suppression | Per-resource/per-operation current decisions include identity/scope/revision/time; operation grants remain separate; revoke/delete deny immediately; decision freshness never exceeds 300 seconds | PostgreSQL integration + contract |
| Lifecycle and retention | Create/edit/delete/restore/move/visibility/member invalidations; metadata-only 30-day tombstones; cleanup and restore replay apply tombstones before availability | PostgreSQL integration + restore harness |
| Fail-closed and limits | Policy/storage failure, expired decision, unavailable source, malformed/oversized requests, page/batch/rate limits, cancellation and audit failure never return allow/content | Unit + HTTP contract + integration |

Implementation tests are added phase by phase before production behavior and must first fail for the intended missing behavior. Relevant backend contract tests, disposable PostgreSQL integration tests, full `go test ./...`, `make lint`, and Atlas checksum validation are required for the final code review. No live E2E environment or production installation is part of verification.
