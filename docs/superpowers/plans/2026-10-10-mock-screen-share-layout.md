# Mock Screen Share and Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let developers demonstrate mock screen sharing across same-origin call tabs and show participant tiles on the right of a wide screen stage or below a constrained one.

**Architecture:** Add a nullable presenter ID to the local mock call snapshot and drive the existing call controls and participant stage from that shared state. Each tab renders a local synthetic 16:9 fixture; the mock path never requests or transmits screen media. Keep the real screen-capture path unchanged.

**Tech Stack:** React, TypeScript, Vite mock mode, BroadcastChannel/localStorage, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-mock-screen-share-layout-design.md`

## File Map

| File | Responsibility |
| --- | --- |
| `frontend/src/dev/mockCallBroker.ts` | Validate and persist the shared mock presenter owner and lifecycle transitions. |
| `frontend/src/features/chats/calling/useMockCallSession.ts` | Subscribe to broker state and apply mock-only share actions to the session. |
| `frontend/src/features/chats/calling/useCallSession.ts` | Route screen-share actions to mock or real media behavior and expose the current owner. |
| `frontend/src/features/chats/calling/CallFeature.tsx`, `DesktopCallControls.tsx`, `MobileActiveScreen.tsx`, `VoiceChannelStage.tsx` | Pass owner identity and name to each call surface and render a presentation stage when sharing. |
| `frontend/src/features/chats/calling/MockScreenSharePreview.tsx`, `frontend/src/components/CallParticipantGrid.tsx`, `frontend/src/styles.css` | Render a static fixture and place it in the existing responsive stage. |
| `frontend/src/dev/mockCallBroker.test.ts`, `frontend/src/components/CallParticipantGrid.test.tsx`, `frontend/src/features/chats/calling/VoiceChannelStage.test.tsx`, `e2e/tests/local-mock-mode.spec.ts` | Cover broker state, responsive stage, voice-channel surface, and cross-tab flow. |

## Global Constraints

- The change is gated to local mock mode. Normal development and production call behavior remain unchanged.
- The fixture is local UI content; the app does not transmit screen pixels or media.
- A mock call has at most one active screen-share owner.
- Sharing also clears when its owner leaves the call or when the call ends.
- When the screen stage and participant rail fit side by side, the shared screen is the main stage and participant tiles appear in a rail on its right.
- When the available stage dimensions cannot fit both regions side by side, participant tiles appear below the shared screen.
- Do not edit the unrelated `frontend/call-ui-preview.tsx` change in the primary checkout.

## Review Focus

- Older localStorage snapshots without `screenShareUserId` must parse as not sharing; pin this in the broker compatibility test.
- A caller still ringing invitees cannot start a share; cover active-call validation in the broker test.
- A stored presenter who is no longer connected must not remain visible; cover invalid-owner normalization and leave cleanup in the broker test.
- Local and remote presenters both render the synthetic fixture without capture APIs; cover the UI states in the component and Playwright tests.
- Resizing between wide and constrained stages must preserve the owner and switch rail placement; cover this in the grid resize test.

---

### Task 1: Shared mock call screen-share ownership

**Files:**
- Modify: `frontend/src/dev/mockCallBroker.ts`
- Test: `frontend/src/dev/mockCallBroker.test.ts`

**Interfaces:**
- Produces: `MockCallSnapshot.screenShareUserId: string | null`.
- Produces: `startMockCallScreenShare(call: MockCallSnapshot, userId: string, now?: Date): MockCallSnapshot | null`.
- Produces: `stopMockCallScreenShare(call: MockCallSnapshot, userId: string, now?: Date): MockCallSnapshot | null`.
- `startMockCallScreenShare` succeeds only for a connected participant in an active call and only when the current owner is null or already that user. A second participant cannot take over.
- `stopMockCallScreenShare` succeeds only for the connected current owner. Successful transitions increment `version` and update `updatedAt`; rejected transitions return `null`.

- [ ] **Step 1: Write failing broker regression tests** in `frontend/src/dev/mockCallBroker.test.ts` for (a) missing `screenShareUserId` in a legacy persisted snapshot normalizing to `null`, (b) active connected participant start, ringing/nonparticipant rejection, and second-owner rejection, (c) owner-only stop, and (d) clearing on owner leave and call end.
- [ ] **Step 2: Run the tests and confirm they fail for the missing share state and transitions.**

Run: `cd frontend && npx vitest run src/dev/mockCallBroker.test.ts`

Expected: FAIL because snapshots and broker transitions do not yet expose screen sharing.

- [ ] **Step 3: Implement the snapshot field and transitions** in `frontend/src/dev/mockCallBroker.ts`. New calls start with `screenShareUserId: null`; the parser treats a missing field as null and clears malformed or non-connected owners; `leaveMockCall` and `endMockCall` clear ownership when appropriate.
- [ ] **Step 4: Run the broker tests unchanged and confirm they pass.**

Run: `cd frontend && npx vitest run src/dev/mockCallBroker.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the broker contract.**

```bash
git add frontend/src/dev/mockCallBroker.ts frontend/src/dev/mockCallBroker.test.ts
git commit -m "[Feature] add mock call screen share ownership"
```

### Task 2: Mock call controls, synthetic stage, and cross-tab coverage

**Files:**
- Create: `frontend/src/features/chats/calling/MockScreenSharePreview.tsx`
- Modify: `frontend/src/features/chats/calling/useMockCallSession.ts`
- Modify: `frontend/src/features/chats/calling/useCallSession.ts`
- Modify: `frontend/src/features/chats/calling/CallFeature.tsx`
- Modify: `frontend/src/features/chats/calling/DesktopCallControls.tsx`
- Modify: `frontend/src/features/chats/calling/MobileActiveScreen.tsx`
- Modify: `frontend/src/features/chats/calling/VoiceChannelStage.tsx`
- Test: `frontend/src/features/chats/calling/VoiceChannelStage.test.tsx`
- Modify: `frontend/src/components/CallParticipantGrid.tsx`
- Test: `frontend/src/components/CallParticipantGrid.test.tsx`
- Modify: `frontend/src/styles.css`
- Test: `e2e/tests/local-mock-mode.spec.ts`

**Interfaces:**
- Consumes: `MockCallSnapshot.screenShareUserId`, `startMockCallScreenShare`, and `stopMockCallScreenShare` from Task 1.
- Produces: `useMockCallSession` exposes `mockScreenShareUserId: string | null` and `toggleScreenShare(): boolean`.
- Produces: `CallParticipantGrid` accepts `mockScreenShareOwner?: { userId: string; displayName: string } | null` and uses it as a screen presenter when no real stream is supplied. Call surfaces resolve `displayName` from the current user and member fixtures.
- Produces: `MockScreenSharePreview({ ownerName }: { ownerName: string })` renders a static, accessible 16:9 mock-screen fixture with no media element or capture API.

- [ ] **Step 1: Add failing grid and browser regression coverage before implementation.** In `CallParticipantGrid.test.tsx`, render a mock owner without a `MediaStream`, assert the accessible fixture and its 16:9 ratio, assert the participant rail is on the right at 1200×720, then use the existing `ResizeObserver` harness to resize to 450×720 and assert the bottom-row class and fixture persist. In `VoiceChannelStage.test.tsx`, verify an active mock owner renders the same synthetic fixture in a voice channel stage. In `local-mock-mode.spec.ts`, extend the existing multi-tab video-call scenario to click “Share screen”, assert the local and remote fixture and its 16:9 stage, click “Stop sharing screen” and assert both fixtures disappear, start sharing once more, instrument audio-element `play()` in addition to the existing `getUserMedia`, `getDisplayMedia`, `RTCPeerConnection`, and `AudioContext` guards, assert every counter remains at zero, and verify owner departure clears the fixture for remaining participants.
- [ ] **Step 2: Run the focused grid, voice-stage, and browser tests and confirm they fail because the mock share fixture is not recognized as an active presentation.**

Run the frontend test from `frontend`:

```bash
npx vitest run src/components/CallParticipantGrid.test.tsx src/features/chats/calling/VoiceChannelStage.test.tsx
```

Before Playwright, serve the task worktree mock app from `frontend` in a separate terminal:

```bash
npx vite --mode mock --host 127.0.0.1 --port 5175 --strictPort
```

Run Playwright with the mock app served from the task worktree at `127.0.0.1:5175`:

```bash
E2E_BASE_URL=http://127.0.0.1:5175 npx playwright test tests/local-mock-mode.spec.ts -g "simulates a video call between two demo users"
```

Expected: the new fixture assertion fails because the mock path does not yet render a screen; existing media counters remain zero.

- [ ] **Step 3: Connect shared owner state to the mock call session.** In `useMockCallSession.ts`, subscribe to and publish broker ownership, set local `CallSettings.screenSharing` only when the current user owns the share, and return `toggleScreenShare(): boolean`. In `useCallSession.ts`, route mock toggles through that method and real-mode toggles through the existing `useCallMedia` handler; enable `canShareScreen` only in local mock mode.
- [ ] **Step 4: Render the synthetic fixture through the existing call stage.** Implement `MockScreenSharePreview` as static UI; pass the owner ID and display name through `CallFeature`, `DesktopCallControls`, `MobileActiveScreen`, and `VoiceChannelStage` to `CallParticipantGrid`. Let the grid treat this owner as a presenter and reuse `getScreenShareLayout` for side versus bottom placement. Include the mock owner in the desktop, mobile, and voice-channel conditions that decide whether to render the presentation grid, including the local-presenter case for audio calls. Do not create or attach a `MediaStream` for the fixture.
- [ ] **Step 5: Run the focused grid and browser tests unchanged.**

Run the frontend test from `frontend`:

```bash
npx vitest run src/components/CallParticipantGrid.test.tsx src/features/chats/calling/VoiceChannelStage.test.tsx
```

Run the browser test from `e2e` against the task worktree's mock server:

```bash
E2E_BASE_URL=http://127.0.0.1:5175 npx playwright test tests/local-mock-mode.spec.ts -g "simulates a video call between two demo users"
```

Expected: PASS; the fixture syncs across tabs, starts and stops from the control, responds to stage resize, disappears on owner departure, and all browser media/RTC/audio counters remain zero.

- [ ] **Step 6: Run the broader frontend checks required for the changed call UI.**

Run from `frontend`: `npm test`, `npm run lint`, and `npm run build`.

Expected: all checks pass.

- [ ] **Step 7: Commit the mock share and layout behavior.**

```bash
git add frontend/src/features/chats/calling/useMockCallSession.ts frontend/src/features/chats/calling/useCallSession.ts frontend/src/features/chats/calling/CallFeature.tsx frontend/src/features/chats/calling/DesktopCallControls.tsx frontend/src/features/chats/calling/MobileActiveScreen.tsx frontend/src/features/chats/calling/VoiceChannelStage.tsx frontend/src/features/chats/calling/VoiceChannelStage.test.tsx frontend/src/features/chats/calling/MockScreenSharePreview.tsx frontend/src/components/CallParticipantGrid.tsx frontend/src/components/CallParticipantGrid.test.tsx frontend/src/styles.css e2e/tests/local-mock-mode.spec.ts
git commit -m "[Feature] add mock call screen sharing"
```
