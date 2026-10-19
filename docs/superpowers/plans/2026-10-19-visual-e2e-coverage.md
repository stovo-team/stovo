# Visual and User-Journey E2E Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic browser journeys for message attachments and canvas, and screenshot comparisons for the key chat, call, file, and canvas screens.

**Architecture:** Reuse the frontend's existing `dev:mock` app and browser-side API mock so Playwright exercises real routes/components without a backend or external accounts. Extend the mock API only for the canvas REST operations needed by the journeys. Use Playwright's built-in screenshot matcher and committed baselines; keep the existing geometry assertions and multi-tab call flow.

**Tech Stack:** React, Vitest, Playwright, Chromium, Vite local mock mode.

**Spec:** `docs/superpowers/specs/2026-10-19-visual-e2e-coverage-design.md`

## Global Constraints

- Run all new browser tests against `http://127.0.0.1:5174` in local mock mode; never use shared, staging, or production environments.
- Keep the real application routes and components in the test path; do not replace the page with hand-authored HTML for these journeys.
- Preserve existing mock file behavior, existing call assertions, and the current visual geometry regression tests.
- Do not start real camera, microphone, WebRTC, Socket.IO, or screen-share services.
- Snapshot updates must be explicit and reviewed; ordinary CI must compare and fail without rewriting snapshots.

## Review Focus

- Canvas creation must initialize and persist Yjs document updates through the mock REST routes, even when Socket.IO is blocked.
- File upload must be associated with the sent message; Storage preview/download/delete must refer to that same uploaded file.
- Reload must reconstruct canvas content and file data from the mock stores, not from stale React state.
- Visual baselines must be deterministic across runs and narrowly scoped to meaningful rendered UI.
- New screenshot tests must complement existing layout assertions rather than duplicate them or replace their precise geometric checks.

## Files and responsibilities

- `frontend/src/dev/mockApi.ts`: handle the minimum canvas list/create/read/document-update/rename requests.
- `frontend/src/dev/mockApi.test.ts`: exercise canvas REST contracts and reset behavior alongside existing file mock tests.
- `e2e/tests/local-mock-mode.spec.ts`: extend the file journey and add the real chat-to-canvas creation/reload journey; capture active call state in the existing call journey.
- `e2e/tests/visual-regression.spec.ts`: add screenshot comparisons for stable seeded chat, file preview, and canvas screens at selected viewports.
- `e2e/playwright.config.ts`: set screenshot-only stability options scoped to visual tests or configure a visual project without changing nonvisual suite behavior.
- `e2e/package.json`: add focused visual run and explicit baseline update scripts.
- `e2e/README.md`: document startup, focused commands, snapshot review, and intentional baseline updates.
- `e2e/tests/visual-regression.spec.ts-snapshots/`: committed Chromium baselines generated from the approved deterministic screens.

---

### Task 1: Specify and implement canvas mock REST behavior

**Files:**
- Modify: `frontend/src/dev/mockApi.test.ts`
- Modify: `frontend/src/dev/mockApi.ts`
- Modify: `frontend/src/dev/mockFixtures.ts` only if a stable seeded canvas fixture is needed for visual tests

**Interfaces:**
- Preserve existing `installMockApi()` and `resetMockData()` interfaces.
- Canvas REST responses must match `Canvas` and `CanvasUpdate` in `frontend/src/api/canvas.ts`.
- The mock document store retains ordered base64 Yjs updates per canvas and resets to seeded fixtures when `resetMockData()` runs.

- [x] **Step 1: Add failing contract tests** in the `local mock chat API` describe block:
  - `lists a seeded canvas and returns its document` — GET `/api/v1/plugins/canvas/canvases` returns a typed canvas fixture; GET its `/document` returns stable updates.
  - `creates a canvas and appends document updates` — POST `/canvases` creates the requested chat/title; GET by ID returns it; POST `/document` appends an update with increasing sequence; GET `/document` returns both in order.
  - `renames a canvas and reset restores the seeded state` — PATCH changes the title; `resetMockData()` removes locally created canvases and restores the initial fixture.
- [x] **Step 2: Run the focused Vitest file and confirm the new assertions fail** because the canvas routes return mock 501 responses.
  - Run: `cd frontend && npm test -- src/dev/mockApi.test.ts`
  - Expected: only the new canvas contract tests fail on unimplemented routes; existing mock API tests remain green.
- [x] **Step 3: Implement the smallest in-memory canvas store and REST handlers** in `mockApi.ts`, backed by deterministic fixture data if required. Support list, create (including optional `initialUpdate`), get, document read/append, rename, and 404 for unknown canvas IDs. Store document update strings without parsing Yjs; the actual Canvas page applies them.
- [x] **Step 4: Reset canvas state from `resetMockData()` and rerun the focused file.**
  - Run: `cd frontend && npm test -- src/dev/mockApi.test.ts`
  - Expected: all mock API tests pass.

### Task 2: Cover the real attachment and canvas journeys

**Files:**
- Modify: `e2e/tests/local-mock-mode.spec.ts`
- Reuse: current attachment APIs in `frontend/src/dev/mockApi.ts` and `mockFileStore.ts`

- [x] **Step 1: Extend the existing upload test** to select a deterministic text file in the composer, send it with a message, and assert both the message and attachment appear in chat.
- [x] **Step 2: Verify the same file in Storage** after navigating to `/app/files` and reloading. Open the file preview, assert its content, capture a Playwright download and assert the filename and bytes, delete the uploaded file, then assert it disappears and its download endpoint returns 404. Keep seeded preview files intact.
- [x] **Step 3: Add a canvas browser journey** using the accessible `/canvas` composer suggestion. Assert navigation to `/app/canvas/<id>`, add a whiteboard block through the existing insert menu, wait for the mock document update request, reload, and assert the block remains. Open Storage and assert that the created canvas can be reopened.
- [x] **Step 4: Block `/socket.io` for the canvas journey** and assert no real network connection is attempted. This proves the route and saved document work using only the mock REST contract.
- [x] **Step 5: Run the focused browser spec against local mock mode.**
  - Start: `cd frontend && npm run dev:mock -- --strictPort`
  - Run: `cd e2e && E2E_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/local-mock-mode.spec.ts`
  - Expected: existing chat/call/file checks and the expanded attachment/canvas journeys pass with no backend services.

### Task 3: Add screenshot comparisons for deterministic screens

**Files:**
- Create: `e2e/tests/visual-regression.spec.ts`
- Modify: `e2e/playwright.config.ts`
- Create: `e2e/tests/visual-regression.spec.ts-snapshots/` baselines
- Modify: `e2e/tests/local-mock-mode.spec.ts` for active call screenshot assertion, unless the visual spec can reuse a single existing call fixture without duplicating lifecycle setup

- [x] **Step 1: Add screenshot assertions for** seeded chat at desktop and mobile, Storage file preview, and seeded Canvas page with a whiteboard block. Reuse real routes and fixture data; assert key content is visible before each screenshot.
- [x] **Step 2: Add one active-call screenshot** from the existing multi-tab call lifecycle after participants have joined. Do not build a second call setup path. Retain all existing media-device and transport guards.
- [x] **Step 3: Stabilize visual capture** by using fixed viewports, waiting for `document.fonts.ready` and visible app state, hiding the caret, and disabling animations for screenshot assertions. Use a narrow `maxDiffPixelRatio` only if a baseline comparison demonstrates harmless Chromium raster differences; do not raise it speculatively.
- [x] **Step 4: Establish baselines explicitly** with Playwright's `--update-snapshots`, inspect every generated diff, and commit only the reviewed screenshots.
- [x] **Step 5: Run the visual spec in comparison mode** without the update flag.
  - Run: `cd e2e && E2E_BASE_URL=http://127.0.0.1:5174 npx playwright test tests/visual-regression.spec.ts`
  - Expected: all snapshots match; a changed rendered screen fails and produces expected/actual/diff output.

### Task 4: Document focused runs and baseline maintenance

**Files:**
- Modify: `e2e/package.json`
- Create: `e2e/README.md`

- [x] **Step 1: Add `test:visual` and `test:visual:update` scripts** that target `visual-regression.spec.ts` and `local-mock-mode.spec.ts`; the update script is the only documented routine that writes visual baselines.
- [x] **Step 2: Document local setup** using `npm ci` in `frontend` and `e2e`, `npm run dev:mock`, focused E2E commands, snapshot review, and the rule that snapshots are updated only for intentional UI changes.
- [x] **Step 3: Verify focused E2E commands** against the running mock server:
  - `E2E_BASE_URL=http://127.0.0.1:5174 npm run test:visual` (both visual spec and active-call screenshot assertion)
  - `E2E_BASE_URL=http://127.0.0.1:5174 npm run test:visual:update` only when establishing or intentionally changing baselines, followed by `npm run test:visual`.

### Task 5: Run required verification and review

- [x] Run: `cd frontend && npm test -- src/dev/mockApi.test.ts` — all relevant mock API tests pass.
- [x] Run: `cd frontend && npm test` — full frontend suite passes.
- [x] Run: `cd frontend && npm run build` — production build passes and mock-only behavior remains development-gated.
- [x] Run: `cd e2e && E2E_BASE_URL=http://127.0.0.1:5174 npm run test:visual` — full visual and local mock browser suite passes against the isolated mock server.
- [x] Run: `git diff --check` — no whitespace errors.
- [x] Review changed files and visual diffs; report any required check that cannot run. Do not run live E2E or publish, push, merge, or open a PR without authorization.

## Execution handoff

The mock API contracts must land before the browser journeys, and the journeys must land before their visual baselines. Use native inline execution for this plan: the tasks are sequential and share the same fixture and mock state, so splitting them between agents would add coordination and integration risk. Commit each completed task-sized change on `feature/visual-e2e-coverage`.
