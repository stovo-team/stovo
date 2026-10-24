# Visual and User-Journey E2E Coverage

## Goal

Add deterministic browser checks for the most important chat, attachment, call, and canvas experiences, and detect unintended visual changes on representative desktop and mobile screens.

## User problem

The repository has many unit and component tests for messages, calls, files, and canvas, but its browser suite only exercises a small subset of user journeys. Playwright captures screenshots on failures for debugging, but it does not compare rendered screens to approved visual baselines. This makes it easy for a flow to work in isolation while a real screen or cross-feature interaction regresses.

## Scope

- Use the existing local frontend mock mode at `http://127.0.0.1:5174` and synthetic demo data. Do not target a shared, staging, or production environment.
- Extend browser coverage for sending a message with an attachment and for creating and reopening a canvas from a chat.
- Preserve and reuse the existing multi-tab mock call journey; add visual coverage for its active call state.
- Add Playwright screenshot baselines for the chat, file preview, active call, and canvas experiences on desktop and mobile where the layout is meaningfully different.
- Add only the canvas mock API behavior needed by these journeys. Do not change production APIs or product behavior.
- Document normal visual-test execution and the explicit process for updating approved screenshots.

## Out of scope

- Live backend or production browser tests for message, file, canvas, or call persistence.
- Real WebRTC, camera, microphone, screen-sharing, or Socket.IO service behavior.
- Cross-device authentication, passkey, or QR flows.
- A broad accessibility audit or a new visual-testing service.
- Collaborative multi-user canvas editing. The browser journey verifies local canvas creation, a saved canvas change, and reopening from persisted mock data.

## Test architecture

Playwright runs against the existing `dev:mock` Vite application, which renders the real React routes and components while the browser-side mock API provides deterministic responses. Existing local mock file storage is reused. The mock API gains the minimum canvas REST contract required by the actual canvas page: create, get/list, document read/write, and rename if the tested UI needs it. Canvas Socket.IO traffic is blocked in the browser test; initial loading and document saves must work through the REST mock.

Behavioral assertions remain in browser tests and existing frontend unit tests. Visual assertions use Playwright screenshot comparison on the rendered application, not hand-authored HTML. Baselines are committed with the tests. Ordinary test runs compare against those baselines; a dedicated command updates them intentionally.

## User journeys

### Message and attachment

1. Open the planning chat in local mock mode.
2. Compose a text message and attach a deterministic text file through the existing attachment control.
3. Send the message and assert that its text and attachment appear in the conversation.
4. Open Storage and assert that the uploaded file is listed, including after a page reload.
5. Open the file preview and download it; assert the downloaded name and bytes.
6. Delete the file and assert that it is removed from the list and unavailable through the mock API.

### Canvas

1. Open the planning chat and invoke the existing `/canvas` composer command.
2. Assert navigation to the real canvas page and its title.
3. Add a whiteboard block using the existing insert control and wait for the REST update to be saved.
4. Reload the canvas and assert that the saved block is restored.
5. Navigate to Storage and assert that the canvas is listed and can be reopened.

### Group call

Reuse the existing multi-tab call test for ringing, accept, decline, active participant layout, simulated mute/camera controls, and hangup. Retain its assertions that media devices, WebRTC, audio contexts, and Socket.IO are not started in mock mode. Add or reuse a stable active-call state for screenshot capture rather than duplicating the call lifecycle.

## Visual checks

Capture approved baselines for:

- Chat conversation on desktop and mobile.
- Active group call on desktop and mobile.
- File preview in the Storage experience.
- Canvas page with the saved whiteboard block.

Use fixed viewport dimensions and Chromium, seed fixtures, freeze time where timestamps can affect rendering, wait for fonts and layout to settle, hide the text caret, and disable transitions/animations during capture. Start with a small pixel-difference tolerance to accommodate harmless rasterization variation; any tolerance must still fail for visible layout, clipping, or content changes. Do not automatically rewrite snapshots during CI.

## Failure behavior and maintenance

A behavioral failure reports the failed user-visible assertion. A visual failure retains Playwright's actual and expected screenshots and diff for review. Intentional design changes update snapshots only through the documented explicit command, and the resulting image diffs are reviewed with the code change. If a visual test is unstable, fix its data, timing, viewport, or rendering setup rather than increasing the tolerance without evidence.

## Verification

- Focused `frontend/src/dev/mockApi.test.ts` tests cover canvas REST mock contracts and preserve existing mock file behavior.
- Run the focused local mock Playwright scenarios against `frontend npm run dev:mock`.
- Run the visual suite both in comparison mode and, only when establishing or intentionally changing baselines, with snapshot update mode.
- Run the frontend test suite and production build required by `CONTRIBUTING.md` for the changed mock API and browser setup.
- Do not run E2E tests against a live or shared environment.
