---
title: "Chat Import and Export Implementation Plan"
type: implementation-plan
---

# Chat Import and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add V1 file-based import and export for one chat at a time across Stovo, Telegram, WhatsApp, Slack, Mattermost, and Rocket.Chat. Import always creates a new private Stovo archive chat.

**Architecture:** Keep a provider-neutral, versioned ChatArchive contract and named pure provider adapters. Run file parsing, export serialization, and E2E decryption in the browser so chat keys and decrypted E2E content never go to the server. The backend revalidates the canonical import envelope, authorizes the member, creates the archive chat, and persists messages, source-author attribution, attachments, and idempotency state atomically. The HTTP layer exposes only Stovo operations; no provider API connections are added.

**Tech Stack:** Go, PostgreSQL migrations, chi HTTP routes, React/TypeScript, Vitest, browser Web Crypto, existing file validation/storage boundary, and the existing disposable PostgreSQL/Redis integration-test setup.

**Spec:** [2026-10-11-chat-import-export-design.md](../specs/2026-10-11-chat-import-export-design.md)

## Global Constraints

- Implement one conversation per import or export. Reject Telegram multi-chat exports, Slack workspace archives, Mattermost server/bulk exports, Rocket.Chat server backups, and any other multi-conversation input with a specific V1 unsupported-scope result.
- Parse local files only. Never fetch URLs embedded in messages or attachments. Bound file bytes, expanded ZIP bytes, entry count, message count, and individual attachment size; reject traversal and ambiguous entries.
- The browser owns source parsing, preview, export serialization, and E2E decryption. The server must never receive E2E keys or decrypted E2E message content. Provider adapters are pure format transforms and cannot make network calls.
- The importing Stovo member is the audit actor. Source participants remain external identities; do not create accounts or auto-match them to Stovo users.
- Imported messages must not create unread counts, delivery/read states, notifications, or executable Stovo objects. Failed commits leave no visible partial chat. Replaying one idempotency key must not duplicate a chat or its messages.
- Export compatibility is explicit: Stovo round trip, readable provider archive, or native import verified for the exact profile. Do not claim native compatibility based on shape alone. Show a plaintext warning before exporting E2E content.
- Preserve unrelated changes. Use the existing dedicated worktree and task branch. Do not push, publish, merge, or open a PR.
- Follow TDD for each task: add the behavior test, run it and record the expected RED result, implement the smallest change, rerun to GREEN, then refactor with tests green. Never weaken existing tests.
- Architecture ruling for implementation: byte-to-archive transforms and export serialization run in the browser so local provider files and E2E export plaintext stay client-side. The backend owns canonical archive validation, chat authorization, and transactional persistence. The design spec is aligned to this boundary.

## Review Focus

- Verify every parser rejects multi-chat inputs before an import can be committed and reports malformed input without a partial write.
- Verify ZIP path traversal, duplicate conversation entries, decompression bombs, oversized files, unsafe HTML/links, and attachment references are handled safely.
- Verify imported source authors are shown as external attribution while sender/audit identity remains the importing Stovo member.
- Verify import commit is atomic and idempotent, and does not touch unread counts, live notifications, statuses, or existing chats.
- Verify browser crypto decrypts E2E messages only after explicit export confirmation and that keys/plaintext are absent from API requests, server persistence, and generated metadata.
- Verify every compatibility label and loss report matches the actual serialized profile; only Stovo is promised as a V1 round trip.
- Review that imports are new private archive chats, the source/current chat remains unchanged, and full-space archives are rejected with an actionable V2 message.

---

## Test Plan

| Contract | Test layer | Proof |
| --- | --- | --- |
| Canonical archive validation, provider detection, and compatibility labels | TypeScript unit tests and Go domain unit tests | Known fixtures normalize consistently; malformed/unsupported scope and invalid limits fail with stable errors |
| Per-provider input and output behavior | TypeScript adapter tests with checked-in fixtures | Telegram JSON, WhatsApp TXT/media, single-channel Slack ZIP, Mattermost channel CSV, Rocket.Chat room JSON, and Stovo archive parse/serialize as documented |
| ZIP, path, and content safety | TypeScript unit tests plus Go validation tests; Go fuzz seeds | Traversal, duplicate entries, size/count limits, invalid timestamps, HTML, and remote attachment links fail closed or become inert references |
| Import attribution and atomic persistence | Go repository/app integration tests | Exactly one new private archive chat and correct external authors/messages persist together; rollback leaves no visible chat |
| Authorization, retry, and HTTP contract | Go transport tests and app integration tests | Only an authorized member can read/export/import; idempotency prevents duplicate commit; route payloads and errors are stable |
| Chat-only entry points and preview | React component tests | Actions appear for a selected chat only; preview includes counts, date range, participants, attachments, losses, and scope errors |
| E2E export and encryption | React/API tests using mocked crypto and API | Explicit warning precedes plaintext export; decrypt/serialize happens in-browser; no keys or decrypted E2E text is sent to the backend |
| Full user journey | Backend app integration plus frontend component/API tests | Select a chat, export a profile, preview a one-chat file, confirm, and see a separate imported archive chat without altering the source chat |

## Delivery Sequence

### Task 1 — Canonical archive contract and validation

**Files:**
- Create: `frontend/src/features/chats/transfer/archive.ts`
- Create: `frontend/src/features/chats/transfer/archive.test.ts`
- Create: `backend/internal/features/chattransfer/archive.go`
- Create: `backend/internal/features/chattransfer/archive_test.go`
- Create: `backend/internal/features/chattransfer/archive_fuzz_test.go`
- Create shared canonical fixtures under: `e2e/fixtures/chat-transfer/v1/`

**Interfaces:**
- Define a versioned `ChatArchive` with source provider/profile, exactly one conversation, external participants, chronological messages, attachment metadata/bytes, and warnings/losses.
- Define frontend `validateArchive(input): ValidationResult` and backend `ValidateArchive(archive Archive) error`. The backend validator is the trust boundary for all fields accepted from the browser.
- Define stable validation errors for unsupported schema, unsupported provider/profile, multiple conversations, invalid timestamps/order, duplicate source IDs, invalid attachment references, and configured resource limits.

- [ ] Write table-driven failing tests for a valid Stovo archive, a valid one-chat envelope, unsupported schema versions, zero or multiple conversations, duplicate IDs, invalid timestamps, unsafe attachment paths, and boundary sizes/counts.
- [ ] Run `cd frontend && npm test -- src/features/chats/transfer/archive.test.ts` and `cd backend && go test ./internal/features/chattransfer`. **Expected RED:** the archive types and validators do not yet exist.
- [ ] Add `FuzzValidateArchive` seeded with the shared valid archive and malformed JSON/field-boundary inputs before implementation.
- [ ] Implement only the shared contract and validation rules. Keep provider parsing and persistence out of this package.
- [ ] Rerun both focused commands. **Expected GREEN:** valid envelopes pass and every invalid case returns a stable, actionable validation error.
- [ ] Run `cd backend && go test ./internal/features/chattransfer -run '^$' -fuzz=FuzzValidateArchive -fuzztime=10s`. **Expected:** no panic, unbounded allocation, or invalid archive accepted.
- [ ] Refactor duplicated validation tables/constants only while the tests remain green.

### Task 2 — Named single-chat import adapters

**Files:**
- Create: `frontend/src/features/chats/transfer/adapters/types.ts`
- Create: `frontend/src/features/chats/transfer/adapters/registry.ts`
- Create: `frontend/src/features/chats/transfer/adapters/stovo.ts` and `stovo.test.ts`
- Create: `frontend/src/features/chats/transfer/adapters/telegram.ts` and `telegram.test.ts`
- Create: `frontend/src/features/chats/transfer/adapters/whatsapp.ts` and `whatsapp.test.ts`
- Create: `frontend/src/features/chats/transfer/adapters/slack.ts` and `slack.test.ts`
- Create: `frontend/src/features/chats/transfer/adapters/mattermost.ts` and `mattermost.test.ts`
- Create: `frontend/src/features/chats/transfer/adapters/rocketchat.ts` and `rocketchat.test.ts`
- Create fixtures under: `frontend/src/features/chats/transfer/adapters/testdata/`

**Interfaces:**
- Define `ChatAdapter` with a stable `providerId`, supported input profiles, `parse(file): Promise<ParseResult>`, and declared warnings/losses.
- Register one adapter each for `stovo`, `telegram`, `whatsapp`, `slack`, `mattermost`, and `rocketchat`.
- V1 accepts Telegram Desktop JSON for one chat, WhatsApp one-chat TXT with optional media, Slack ZIP/JSON with exactly one channel, Mattermost single-channel CSV, Rocket.Chat one-room JSON, and versioned Stovo archive.
- Do not add full Slack workspace, Mattermost bulk/server, Rocket.Chat database/server, or Telegram all-chat profiles.

- [ ] Add fixture-driven failing tests before parser code. For each adapter, assert normalized title, external authors, source IDs/timestamps, message order, supported replies/reactions, attachments, and warnings.
- [ ] Add explicit multi-chat rejection fixtures for Telegram, Slack, Rocket.Chat, and Stovo; add Mattermost malformed-header coverage and WhatsApp malformed-line coverage.
- [ ] Add ZIP safety tests for traversal paths, duplicate channel entries, excessive expanded size, and entry-count limits; add a test proving Slack file URLs remain references and are never fetched.
- [ ] Run `cd frontend && npm test -- src/features/chats/transfer/adapters`. **Expected RED:** adapter modules and fixtures do not yet exist; after scaffolding, format-specific assertions fail.
- [ ] Implement the smallest parser per profile and the registry detection rules. Keep parsing deterministic and local; do not add provider API clients.
- [ ] Rerun the adapter suite. **Expected GREEN:** each valid single-chat fixture normalizes and each unsupported or malformed fixture fails before preview/commit.
- [ ] Refactor shared timestamp, filename, ZIP, and warning helpers after the per-provider cases pass.

### Task 3 — Export adapters and compatibility declarations

**Files:**
- Modify: `frontend/src/features/chats/transfer/adapters/types.ts`
- Modify: `frontend/src/features/chats/transfer/adapters/registry.ts`
- Modify: the six adapter modules and tests from Task 2
- Create: `frontend/src/features/chats/transfer/export.test.ts`

**Interfaces:**
- Define `ExportProfile` with provider/profile IDs, format version, compatibility class, known losses, side effects, and media handling.
- Define `serialize(archive, profile): Promise<ExportPackage>` returning filename, MIME type, and bytes.
- V1 output profiles: Stovo versioned archive; Telegram readable JSON; WhatsApp TXT plus available media; Slack one-channel archive; Mattermost single-channel CSV archive and optional separately labeled bulk-import JSONL only if its exact importer compatibility is verified; Rocket.Chat room JSON archive.

- [ ] Write failing round-trip/shape tests for every export profile. Assert compatibility is declared, native-import claims are absent unless verified, and unsupported content appears in the loss report.
- [ ] Add a Stovo parse → serialize → parse round-trip test for supported fields, including authors, timestamps, replies, reactions, and attachment checksums.
- [ ] Add tests that generated packages never contain Stovo encryption keys, server-only fields, or executable source payloads.
- [ ] Run `cd frontend && npm test -- src/features/chats/transfer/export.test.ts src/features/chats/transfer/adapters`. **Expected RED:** serializers/profiles are missing or their output fails compatibility/loss assertions.
- [ ] Implement pure serializers and explicit compatibility metadata. Do not label WhatsApp TXT, Mattermost CSV, or unverified provider-shaped archives as native-importable.
- [ ] Rerun focused adapter/export tests. **Expected GREEN:** all output shapes and round-trip claims match the declared profile.
- [ ] Review each generated package against its fixture and refactor shared archive/ZIP helpers.

### Task 4 — Import attribution and transactional persistence

**Files:**
- Create: `backend/migrations/20261011100000_add_chat_import_provenance.sql`
- Modify: `backend/migrations/atlas.sum`
- Create: `backend/internal/features/chattransfer/import.go`
- Create: `backend/internal/features/chattransfer/import_test.go`
- Modify: `backend/internal/repository/messages.go`
- Create: `backend/internal/repository/chat_imports.go` and `chat_imports_test.go`
- Modify: `backend/ent/schema/message.go` only if required to keep generated schema aligned
- Modify: chat/message response mapping to expose external author attribution safely

**Interfaces:**
- Define `ImportService.Preview` and `ImportService.Commit` around a validated one-chat archive, importing member, and idempotency key.
- Persist the Stovo importing member as the message sender/audit actor and store the provider author ID/display name in a separate message-import-attribution record.
- Persist a stable import batch ID and source message IDs for deduplication. Keep external authors out of the Stovo users table.
- Commit chat, membership, messages, attribution, supported reactions/threads, and file references in one transaction; default imported chats to private archive type with only the importing member.
- Do not emit live message, unread, notification, delivery, or read-status events for historical rows.

- [ ] Add failing feature/store tests for external attribution, private membership, source timestamp/order, idempotent retry, duplicate source IDs, attachment references, and rollback on an injected write failure.
- [ ] Add failing PostgreSQL integration tests in `backend/internal/app/chat_import_integration_test.go` proving the source chat and unread counts are unchanged, exactly one new chat is visible after commit, and no notification/outbox/status rows are created. Use the existing disposable DB setup.
- [ ] Run `cd backend && go test ./internal/features/chattransfer ./internal/repository` and `cd backend && go test ./internal/app -run 'TestChatImport' -count=1` with `TEST_DATABASE_URL` and `TEST_REDIS_URL`. **Expected RED:** import service, persistence tables, and transaction behavior are absent.
- [ ] Add the attribution/import-batch migration and implement the smallest transactional repository/app operation. Preserve sender foreign keys by using the importing Stovo user as sender and separate provenance for source authors.
- [ ] Run the focused tests and `cd backend && atlas migrate hash --dir file://migrations`. **Expected GREEN:** commit and retry behavior pass, rollback leaves no visible partial chat, and `atlas.sum` matches.
- [ ] Refactor repository transaction boundaries only while all rollback/idempotency tests remain green.

### Task 5 — HTTP contracts and chat authorization

**Files:**
- Modify: `backend/internal/transport/http/chat_routes.go`
- Modify: `backend/internal/transport/http/chat_routes_test.go`
- Create: `backend/internal/transport/http/chat_transfer_handler.go` and `chat_transfer_handler_test.go`
- Modify: `backend/internal/app/routes.go`
- Modify: `backend/internal/app/router_composition.go`
- Create: `backend/internal/app/chat_transfer.go` and `chat_transfer_test.go`
- Modify: `backend/internal/app/router_composition_test.go` if the route composition contract requires it

**Interfaces:**
- Add authenticated Stovo routes to fetch one chat's export source and commit a confirmed import; route names and payloads should be fixed by the handler contract tests before implementation.
- Export-source reads require current chat membership and return only that chat's messages/attachments; for E2E messages return ciphertext metadata only.
- Import commit accepts a validated canonical archive plus idempotency key, creates a new archive chat, and never accepts a target chat ID.

- [ ] Add failing handler tests for valid/malformed envelopes, unsupported formats, missing idempotency key, oversized request, wrong method, and stable error responses.
- [ ] Extend route registration tests to prove export-source and import-commit methods/paths are mounted exactly once.
- [ ] Add app authorization tests for a member, a non-member, and a missing chat; verify there is no cross-chat export or import-to-existing-chat path.
- [ ] Run `cd backend && go test ./internal/transport/http ./internal/app -run 'TestChatTransfer|TestChatImport' -count=1`. **Expected RED:** routes and operation callbacks are not registered.
- [ ] Implement thin HTTP decoding/range checks and app authorization/orchestration; keep domain rules out of the transport handler.
- [ ] Rerun focused transport/app tests. **Expected GREEN:** route, authorization, size, and error contracts pass; app integration proves no partial writes.
- [ ] Review request logging and errors to ensure they contain no message bodies, keys, or full imported file bytes.

### Task 6 — Chat menu, preview, crypto, and download flow

**Files:**
- Modify: `frontend/src/features/chats/sidebar/ChatContextMenu.tsx`
- Modify: `frontend/src/features/chats/sidebar/ChatList.tsx`
- Create: `frontend/src/features/chats/sidebar/ChatContextMenu.chat-transfer.test.tsx`
- Create: `frontend/src/features/chats/transfer/ChatTransferDialog.tsx` and `ChatTransferDialog.test.tsx`
- Create: `frontend/src/api/chatTransfer.ts` and `chatTransfer.test.ts`
- Modify: `frontend/src/i18n/LanguageContext.tsx` and existing translation resources
- Modify: `frontend/src/styles.css` only for required dialog styling

- [ ] Add failing component tests that transfer actions are available only from a selected chat's menu; export uses that exact chat; import confirmation creates a new chat and leaves the selected/source chat unchanged; non-chat quick-access entries have no transfer actions.
- [ ] Add failing preview tests for provider detection, counts, participants, date range, attachments, warning/loss display, multi-chat rejection, malformed files, and cancel-without-write behavior.
- [ ] Add failing export tests proving the E2E plaintext notice is shown before export; cancel performs no decrypt/serialize; confirm decrypts locally then serializes; keys and decrypted E2E text never appear in API calls or the generated manifest.
- [ ] Add API client tests for chat-specific export-source reads, import idempotency, and commit returning a new archive chat.
- [ ] Run `cd frontend && npm test -- src/features/chats/sidebar/ChatContextMenu.chat-transfer.test.tsx src/features/chats/transfer src/api/chatTransfer.test.ts`. **Expected RED:** transfer actions, dialog, and API methods are missing.
- [ ] Implement localized chat-menu actions, local file parse/preview, explicit export confirmation, browser crypto, and backend API calls. Keep the original chat ID read-only throughout import.
- [ ] Rerun focused component/API tests. **Expected GREEN:** preview/cancel/confirm, E2E notice, new-chat behavior, and chat-only placement pass.
- [ ] Refactor dialog state and shared preview formatting after all UI cases remain green.

### Task 7 — Cross-layer acceptance and final checks

**Files:**
- Modify: provider fixtures and targeted tests only if review identifies a gap
- Modify: `docs/superpowers/specs/2026-10-11-chat-import-export-design.md` only if implementation discovery requires a documented contract correction

- [ ] Add or complete an app integration case for Stovo export/import round trip with attachments, external author attribution, historical order, and retry idempotency.
- [ ] Add or complete negative coverage proving a workspace/server export is rejected before any chat, message, attachment, or user is written.
- [ ] Run focused TypeScript adapter/API/component tests and focused Go domain/transport/app tests first. Then run from `backend`: `go test ./...` and `make lint`; run from `frontend`: `npm test`, `npm run lint`, and `npm run build`.
- [ ] Run `cd backend && atlas migrate hash --dir file://migrations` and inspect `backend/migrations/atlas.sum` for an unrelated or stale checksum.
- [ ] Review `git diff --check`, migration FK/cascade behavior, all provider compatibility labels, browser/server crypto boundaries, and the final diff. Report unavailable required checks and their reason; do not claim they passed.

## Completion Criteria

- All six named adapters have fixture-driven V1 single-chat import/export coverage and meaningful unsupported-scope errors.
- Stovo round-trip tests pass for supported fields; all other export claims are limited to the declared archive/native compatibility.
- Import creates a separate private archive chat with external source-author attribution, preserved supported history, and no partial, unread, notification, delivery, or duplicate side effects.
- E2E export decrypts only in the browser after explicit confirmation; no key or decrypted E2E body crosses the API boundary.
- The targeted and repository-required verification commands pass, or any unavailable integration/tool prerequisite is stated clearly.
