---
title: "Shared Call Stage, Controls, and Settings Implementation Plan"
type: implementation-plan
---

# Shared Call Stage, Controls, and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give DM, Group Call, Voice Chat, and Guest Meeting consistent stage layout, floating controls, and settings.

**Architecture:** Keep each existing call session and media engine as the owner of streams and action callbacks. Add shared presentational stage, control shell, and settings dialog layers; adapt the four call paths to them without moving or duplicating media lifecycle ownership. Store only local viewing preferences outside call session state.

**Tech Stack:** React, TypeScript, CSS, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-shared-call-stage-and-settings-design.md`

## Global Constraints

- Gallery cards and participant cards in share rails retain 16:9.
- Desktop side-by-side presentation uses a left-aligned 5:1 share-to-participant card width ratio; the participant rail ends at the right edge.
- The 28px participant toggle is centered on the presentation edge. The compact 90%-opaque control panel overlays the stage with a 16px radius and 2×4px padding.
- During mobile presentation, left-aligned participant thumbnails sit above the screen; a two-person mobile gallery stacks 16:9 cards that fit above controls.
- The participant rail is right-side when it fits, bottom-side otherwise; the right rail never scrolls horizontally.
- Mobile no-share gallery uses a column for two participants and a grid for three or more; DM camera PiP stays available.
- All new stage and chrome behavior is shared by DM, Group Call, Voice Chat, and Guest Meeting.
- Preserve stream refs, audio playback ownership, track cleanup, call actions, and mock-tab synchronization.
- Auto-hide defaults off; camera display defaults to Fit; preferences stay local and do not broadcast.
- Fit/Crop applies only to camera tiles. Screen share always preserves its source ratio.
- Do not add server endpoints or request media permissions from display/layout preferences.

## Review Focus

- A collapsed participant rail must not unmount remote audio playback — verify hidden remote speech remains routed.
- A stage resize, rail collapse, or screen-source metadata change must not clip or stretch the presenter — test wide, short, portrait, and delayed metadata.
- A control hidden after pointer exit must remain reachable by keyboard and touch — test focus and tap reveal and confirm hidden controls do not intercept clicks.
- Switching settings tabs or opening directly on Audio/Camera must preserve device and audio test state — verify callbacks and selected devices.
- Guest Meeting permission and device-capability differences must not silently enable controls or request capture — test unavailable-device UI and guest callbacks.

---

### Task 1: Fit the existing gallery and call popup to their available bounds

**Files:**
- Modify: `frontend/src/components/CallParticipantGrid.tsx`
- Modify: `frontend/src/features/chats/calling/CallPopupAudioStage.tsx`
- Modify: `frontend/src/features/chats/calling/MobileActiveScreen.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/components/CallParticipantGrid.test.tsx`
- Test: `frontend/src/features/chats/calling/MobileActiveScreen.unification.test.tsx`
- Test: `e2e/tests/call-gallery-sizing.spec.ts`
- Test: `e2e/tests/call-presentation-layout.spec.ts`

**Interfaces:**
- Consumes current `RemoteMedia`, `CallParticipantGrid`, `CallPopupAudioStage`, and `MobileActiveScreen` interfaces.
- Produces the verified gallery and presenter geometry that Task 2 must preserve while adding the collapse action.

- [x] Write browser regressions for max-fit 16:9 mobile gallery cards, desktop group popup dimensions, separate share stages, and real-control clearance.
- [x] Confirm the original participant sizing and duplicate audio share stage fail these checks.
- [x] Size mobile gallery from its measured vertical space above controls; retain 16:9 and align the share participant row left at 144×81px or 128×72px at widths up to 420px.
- [x] Keep the right share rail one column with vertical overflow only; keep bottom cards landscape and short.
- [x] Suppress the old audio-avatar stage during real or mock screen sharing and restore it when sharing stops.
- [x] Keep group mobile cameras in gallery mode; retain the existing two-person PiP mode for DM.
- [x] Set the desktop group popup to `min(960px, viewport width − 40px)` by `min(640px, viewport height − 40px)`; let the audio gallery use the available stage height.
- [x] Verify all browser tests, `cd frontend && npm test`, production build, and `git diff --check`; report the existing unrelated lint baseline failure without changing it.
- [x] Commit the focused geometry regressions as `e2e25a8`.

### Task 2: Share one adaptable stage across the four call paths

**Files:**
- Create: `frontend/src/features/chats/calling/SharedCallStage.tsx`
- Create: `frontend/src/features/chats/calling/SharedCallStage.test.tsx`
- Modify: `frontend/src/components/CallParticipantGrid.tsx`
- Modify: `frontend/src/features/chats/calling/CallParticipantStage.tsx`
- Modify: `frontend/src/features/chats/calling/DesktopCallControls.tsx`
- Modify: `frontend/src/features/chats/calling/MobileActiveScreen.tsx`
- Modify: `frontend/src/features/chats/calling/VoiceChannelStage.tsx`
- Modify: `frontend/src/pages/GuestMeetingPage.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/pages/GuestMeetingPage.test.tsx`
- Test: `e2e/tests/call-presentation-layout.spec.ts`

- `SharedCallStage` props: `children`, `isSharing`, `isMobile`, `cameraFit`, and an optional participant-collapse callback, plus ordinary div attributes.
- Call adapters keep stream-specific participant rendering and media ownership. The shared frame owns the collapse affordance, camera-fit policy, pointer-reveal event, and common stage layout; it never starts, stops, or clones tracks.

- [x] Add tests for right/bottom placement at measured breakpoints, the 5:1 desktop ratio, 16:9 rails, accessible hide/show state, and presenter bounds before implementing the shared stage.
- [x] Run the new tests and confirm missing shared-stage behavior.
- [x] Implement `SharedCallStage` as the shared presentation frame. Collapse hides participant visuals without unmounting adapter content or remote audio nodes.
- [x] Adapt DM/group desktop and mobile, Voice Chat, and Guest Meeting to the common component; preserve their session-owned refs and device permissions.
- [x] Add tests that each adapter renders the shared stage and retains its call-specific invite, leave, device, and audio behavior.
- [x] Add browser assertions that collapsing increases presenter bounds, expanding restores the rail, and resizing/screen metadata changes remain within the available stage.
- [x] Anchor the compact participant toggle to the presentation edge and verify floating controls stay within the presenter bounds.
- [x] Run focused component and browser tests; inspect right rail, bottom rail, collapsed stage, mobile pair/grid, and each of the four call paths.
- [x] Commit the shared stage and adapter task.

### Task 3: Use one floating control panel and optional auto-hide behavior

**Files:**
- Create: `frontend/src/features/chats/calling/SharedCallControlPanel.tsx`
- Create: `frontend/src/features/chats/calling/SharedCallControlPanel.test.tsx`
- Create: `frontend/src/features/chats/calling/callUIPreferences.ts`
- Create: `frontend/src/features/chats/calling/callUIPreferences.test.ts`
- Modify: `frontend/src/features/chats/calling/CallControlButton.tsx`
- Modify: `frontend/src/features/chats/calling/CallDeviceControls.tsx`
- Modify: `frontend/src/features/chats/calling/DesktopCallControls.tsx`
- Modify: `frontend/src/features/chats/calling/MobileActiveScreen.tsx`
- Modify: `frontend/src/features/chats/calling/VoiceChannelStage.tsx`
- Modify: `frontend/src/pages/GuestMeetingPage.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- `CallUIPreferences`: `{ autoHideControls: boolean; cameraFit: "fit" | "cover" }`.
- `readCallUIPreferences(): CallUIPreferences`, `writeCallUIPreferences(patch: Partial<CallUIPreferences>): CallUIPreferences`; invalid/unavailable storage returns defaults and does not throw.
- `SharedCallControlPanel` props: `{ autoHide: boolean; children: ReactNode; onReveal?: () => void }`; it composes existing action and device controls without owning their state.

- [x] Test preferences default values, valid persistence, invalid saved values, and inaccessible localStorage before implementing storage.
- [x] Test hide-on-pointer-exit, reveal on pointer entry/tap, focus retention, open menus, reduced motion, and pointer-events while hidden.
- [x] Implement storage with defaults `autoHideControls: false` and `cameraFit: "fit"`; do not write call/media state to localStorage.
- [x] Add the rounded raised-surface panel at 90% opacity. Overlay controls/invite/shrink over the stage without allocating a stage row.
- [x] Adapt all four call paths and mobile controls to the shell, keeping secondary actions accessible and device menu anchors usable.
- [x] Verify control callbacks and permissions are unchanged in component tests; run the browser geometry suite to prove controls do not reduce presenter bounds.
- [x] Commit the shared controls and preferences task.

### Task 4: Put audio, camera, and general options in one settings dialog

**Files:**
- Create: `frontend/src/features/chats/calling/CallSettingsDialog.tsx`
- Create: `frontend/src/features/chats/calling/CallSettingsDialog.test.tsx`
- Modify: `frontend/src/features/chats/calling/CallAudioSettingsPopup.tsx`
- Modify: `frontend/src/features/chats/calling/CallVideoSettingsPopup.tsx`
- Modify: `frontend/src/features/chats/calling/CallFeature.tsx`
- Modify: `frontend/src/pages/GuestMeetingAudioSettings.tsx`
- Modify: `frontend/src/pages/GuestMeetingPage.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- `CallSettingsDialog` props: `{ initialTab: "general" | "audio" | "camera"; preferences: CallUIPreferences; settings: CallSettings; capabilities: CallCapabilities; devices: CallDevice[]; warning: string | null; onPatch: (patch: Partial<CallSettings>) => void; onPreferencePatch: (patch: Partial<CallUIPreferences>) => void; onClose: () => void; localStream?: MediaStream | null; isMobile: boolean }`.
- Keep existing Audio/Camera panel content and its `onPatch` callbacks; mount one panel per active tab so inactive panels do not reset tests or selected devices.

- [x] Add failing dialog tests for General/Audio/Camera tabs, tab keyboard navigation, deep-link entry from current audio/video buttons, focus/close behavior, and retained media setting values.
- [x] Implement accessible desktop left tabs and narrow-screen compact tabs; select General by default.
- [x] Move auto-hide to General; combine existing audio and camera panel behavior without changing unsupported-device states or requesting permissions.
- [x] Add Fit/Crop camera display preference to the camera panel. Apply only to camera video object fitting; screen shares always use contain/source ratio.
- [x] Replace the Guest Meeting mobile subset with the same settings dialog and supported capability state.
- [x] Verify mobile/desktop dialog behavior in all four call types, including device-less mock mode and Guest Meeting.
- [x] Fit the mobile two-person column above controls and keep the mobile presentation participant row above the screen.
- [x] Commit the shared settings task.

### Task 5: Final integration and visual review

**Files:**
- Test: `frontend/src/features/chats/calling/SharedCallStage.test.tsx`
- Test: `frontend/src/features/chats/calling/SharedCallControlPanel.test.tsx`
- Test: `frontend/src/features/chats/calling/CallSettingsDialog.test.tsx`
- Test: `e2e/tests/call-presentation-layout.spec.ts`
- Test: relevant existing call, guest meeting, and mock call suites.

- [x] Verify mock sharing synchronization, presenter leave cleanup, and call-end cleanup across two tabs.
- [x] Verify DM/group/voice/guest share the stage, control panel, and settings-dialog bases while preserving adapters and existing action callbacks.
- [x] Run `cd frontend && npm test`, `npm run lint`, `npm run build`, and the focused Chromium browser suite. Record the unrelated existing lint baseline failure if it remains.
- [x] Inspect and capture desktop/right-rail, short/bottom-rail, collapsed share, mobile pair/grid, floating controls, and all three settings tabs.
- [x] Review the complete diff and commit any final integration fixes. Do not push or publish.

### Follow-up: refine screen-share and mobile call chrome

- [x] Add regressions for mobile participant hide/invite actions, fixed circular
  control sizing, icon-only record actions, and the roomier translucent panel.
- [x] Anchor the mobile participant toggle beside thumbnails and route mobile
  Invite to the existing invite dialog.
- [x] Increase panel padding/radius/transparency; fix mobile control and SVG
  sizing; normalize Stovo Intelligence typography and circular record/stop icons.
- [x] Allow the desktop participant rail to use a second thumbnail column when
  its available width supports it.
- [x] Keep Rotate beside mobile Invite and put the invite dialog above the
  fullscreen presentation; split the top bar to stay within file-size baseline.
- [x] Run focused and broader tests, build, visual review, and commit locally.
