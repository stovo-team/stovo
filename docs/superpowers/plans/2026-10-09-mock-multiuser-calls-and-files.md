---
title: "Plan: local mock multi-user calls and files"
type: implementation-plan
---

# Plan: local mock multi-user calls and files

Spec: docs/superpowers/specs/2026-10-09-mock-multiuser-calls-and-files-design.md

## Feature plan

**Problem:** The local mock page cannot reproduce call signaling, independent users in separate tabs, or file persistence, despite these being visible production behaviors.

**Scope:** Add tab-scoped demo identities, same-origin mock call signaling through the real call UI, and local file upload/list/preview/download/delete through existing API contracts.

**Observable behavior:** Two tabs can select different demo identities, call each other, see the incoming call, accept or decline, see the active call layout, and hang up. Files uploaded in one tab are visible from another tab and after reload. No physical media or backend connection is used.

**Constraints:** Keep the normal dev/prod paths unchanged. Mock routes are same-origin only. A tab identity is stored in sessionStorage; shared files and active-call state are stored on the dedicated mock origin. Unsupported routes fail locally.

**Design:** Use ?mockUser=<id> for per-tab fixture identity; a mock-only call coordinator based on BroadcastChannel and a persisted room snapshot; and an IndexedDB file store behind the existing upload API. Branch at the mock bootstrap/call-session boundary; keep the production CallController and media engines intact.

## Test plan

| Scenario / invariant | Edge or security case | Test layer |
|---|---|---|
| Refresh and sent message reflect the selected demo user in each tab | Unknown ID falls back safely; changing one tab does not change the other tab's identity | Unit + Playwright |
| Caller receives ringing and invitee sees an incoming call | Non-invitees do not see the call; different chat IDs do not join | Mock-call unit + two-page Playwright |
| Accept, decline, invite, leave, and hangup update the shared call state | Duplicate/stale events and reloaded/closed tab cleanup | Mock-call unit + Playwright |
| Existing audio/video call surfaces render several synthetic participants | No getUserMedia, audio playback, Socket.IO, WebRTC, or LiveKit request | Playwright |
| Existing upload flow stores a file locally and returns production-shaped metadata | Empty file, duplicate upload ID, and unsupported file routes | File-store unit + mock API integration |
| A second tab can list, preview/download, and delete the uploaded file | Reload retains bytes; deleted IDs return 404; unrelated browser origins cannot access them | Mock API integration + Playwright |
| Normal development and production do not load mock modules or routes | Build output contains no fixture records or mock access token | Build + bundle inspection |

## Implementation tasks

### 1. Per-tab demo identities

- Add tests for query parsing/sessionStorage and the mock refresh response.
- Implement the fixture identity resolver and use it for session seeding and message sender data.
- Verify the existing default demo identity remains unchanged.

### 2. Cross-tab mock calls

- Add broker contract tests first for ring/accept/decline/participant/end transitions.
- Implement same-origin room state and BroadcastChannel/storage recovery.
- Add mock-only useCallSession branches that update the existing call state without creating media controllers.
- Create synthetic avatar media entries so the existing desktop/mobile call layouts show the full participant list.
- Keep unavailable media-dependent controls visibly disabled or simulated, and prove no physical media APIs are called.

### 3. Local file storage

- Add tests first for metadata/Blob persistence, upload lifecycle, listing, download, deletion, and error contracts.
- Implement an IndexedDB store and mock API routes for upload reservation, transfer, completion, listing, metadata, download, preference, and delete.
- Preserve attachments in mock messages and pass them through existing previews.

### 4. End-to-end and finish

- Extend Playwright to use two tabs with different mockUser values for an audio/video call lifecycle and shared file upload/download.
- Run the focused unit tests, full frontend unit suite, production build, Playwright mock scenario, and diff checks.
- Inspect the production bundle and final branch diff.

## Execution notes

- Perform all changes in /home/ivan/.codex/worktrees/mock-frontend-demo/stovo-messenger on feature/mock-frontend-demo-mode.
- Keep the local mock server available at http://127.0.0.1:5174.
- Do not push or create a PR without authorization.
