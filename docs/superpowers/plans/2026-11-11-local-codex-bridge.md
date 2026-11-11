# Local Stovo Codex Bridge Implementation Plan

> **For agentic workers:** Implement this plan task-by-task in this session. Keep it local; do not publish.

**Goal:** Route explicitly invoked Messenger messages from configured chats into persistent local Codex app-server threads and send streamed replies back as a dedicated Messenger account.

**Architecture:** A standalone Node bridge subscribes to Messenger's existing Socket.IO `message:new` event, sends/reads through authenticated Messenger REST endpoints as a dedicated member account, and drives Codex app-server over stdio JSON-RPC. Local atomic state stores chat/thread mappings, processed event IDs, pending queue items, and approval correlations. Chat/workspace/approver allowlists and fail-closed protocol handling are mandatory.

**Tech Stack:** Node.js 22+, built-in test runner, `socket.io-client`, Codex app-server stdio JSON-RPC, Messenger REST and Socket.IO.

**Spec:** `backend/codex-bridge/README.md`

## Global Constraints

- Only explicitly configured chat IDs and workspace paths are served.
- Bridge uses its own configured Messenger member account; it does not impersonate a human.
- Ignore own messages and messages marked as bots; only explicit `@Codex` or `/codex` invocation triggers work.
- Require approvals for every command, file change, and publish action; bind each approval to configured approver IDs and one pending operation.
- Reject unknown protocol requests and fail closed if mandatory approval capabilities are unavailable.
- Never log credentials or include them in Messenger responses; persist local state with restrictive file permissions.
- Do not send live messages, use live credentials, deploy, push, publish, or open a PR.

## Review Focus

- Replayed/duplicate events must not create duplicate turns; test durable deduplication.
- Messages from the bot itself or without an explicit invocation must never start a turn; test structured fixtures.
- Unknown or mismatched approver replies must never approve an action; test each approval type and denial path.
- Workspace paths must be absolute and rooted in an explicit chat mapping; test invalid paths and cross-chat isolation.
- Stream interruption, reconnect recovery, and stale approval IDs must not leak responses or resume the wrong thread; test fixture lifecycle transitions.

### Task 1: Contracts, trigger policy, and local journal

**Files:** Create `backend/codex-bridge/src/core.mjs`, `backend/codex-bridge/test/core.test.mjs`, and `backend/codex-bridge/fixtures/app-server/approval-requests.json`.

- [x] Add failing tests for trigger allowlisting, bot-loop prevention, event dedupe/recovery, approver binding, and unknown approvals.
- [x] Run `node --test backend/codex-bridge/test/core.test.mjs` and verify expected failures.
- [x] Implement config validation, event classification, atomic journal, and approval resolver.
- [x] Rerun the focused tests.

### Task 2: Messenger and Codex adapters

**Files:** Create `backend/codex-bridge/src/messenger.mjs` and `backend/codex-bridge/src/codex.mjs`; test with local HTTP/stdio fixtures.

- [x] Cover Messenger REST history, refresh, idempotent send, and Socket.IO event handling with local fixtures.
- [x] Cover JSON-RPC initialize/start/resume/stream/interrupt/approval handling with a fake app-server process.
- [x] Fail closed for missing capabilities, unsupported approval messages, and server errors.

### Task 3: Runnable process and operator documentation

**Files:** Create `backend/codex-bridge/src/main.mjs`, `backend/codex-bridge/package.json`, `backend/codex-bridge/config.example.json`, and `backend/codex-bridge/README.md`.

- [x] Add end-to-end fixture test from `message:new` through streamed response and persisted recovery.
- [x] Add command-line startup validation, signal shutdown, least-privilege defaults, and secret-safe logging.
- [x] Document install/config, bot-account setup, approvals, interruption, recovery, Codex version requirements, and known limitations.
- [x] Run the complete bridge test suite and verify the final diff stays within `stovo-messenger`.
