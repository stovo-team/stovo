---
title: "Voice and chat layout fixes"
type: implementation-plan
---

# Voice and chat layout fixes

## Goal

Fix the reported call and chat layout issues with small, user-visible changes:

- Keep screen-share content inside the space between the call header and controls.
- Place participant cards on the side only when the available call area can fit them; otherwise place them below the shared content. Make cards slightly smaller and align them to the top or left, respectively.
- Restore the chat's pre-call expanded/collapsed layout when a Voice Channel call ends.
- Make the camera button reflect the first successful camera enable in Group Calls.
- Keep a live call expanded when screen sharing starts and the user returns to its chat.
- Anchor the minimized call chip to the active chat header, including when Chat Details opens.
- Narrow and scale down Chat Details, reflow desktop messages beside it, and use a deliberate mobile details layout on small screens.

## Architecture

Keep media layout decisions in the shared participant grid, based on the grid's measured available space rather than viewport width or participant count alone. Keep call state transitions in the call/session and page components that already own those states. Position the minimized call UI through its floating-panel hook, using the visible active-chat header as its anchor and a viewport fallback when no header is available. Keep Chat Details sizing in its existing grid and responsive styles.

The call layout changes must cover both Voice Channel and Group Call surfaces that use the shared screen-share grid. Check the audio-only Group Call participant grid separately and apply the same modest sizing direction there only if it is the oversized participant-card layout shown in the report.

## Tech Stack

React, TypeScript, CSS, Vitest, React Testing Library.

## Spec

### Screen sharing and participant-card layout

- Shared content uses the space available between the active header and the bottom call controls.
- A side participant rail is used only when the measured stage width and height can fit the shared content and rail at their minimum usable sizes.
- When the side rail does not fit, cards move below the shared content. The bottom rail starts at the left edge of the stage.
- Side-rail cards align to the top. Participant cards and avatars are modestly smaller than the current design.
- Layout responds to the call stage's actual dimensions, including a narrow viewport with ample height and a wide viewport with limited height.
- Screen content and participants do not render beneath or become obscured by the control dock.

### Call state and camera control

- Ending a Voice Channel call restores the expanded/collapsed call layout captured when that call began, regardless of layout changes made during the call.
- The first Group Call camera enable updates both media state and the visible camera-control state in the same transition.
- Acquiring/publishing the camera track remains the responsibility of the call controller; updating the button state alone must not turn the camera on.

### Screen-share return and minimized call chip

- Screen-share capture does not itself minimize the call.
- Existing explicit minimize and navigation-away behavior remains intact.
- A minimized chip is placed below and inset from the currently visible chat header. Its right edge aligns with the header's right inset, with a slightly larger vertical gap than the current placement.
- The chip follows header changes when Chat Details opens or the chat layout changes, stays above chat content, and retains drag behavior relative to its anchor.
- If the anchored header is absent, use a safe viewport-based fallback.

### Chat Details

- On desktop, reduce the details column to approximately 280–320 CSS pixels, keeping the messages column at min-width: 0 so it can resize alongside details.
- Reduce the hero avatar/name and Message, Mute, Favorite action tiles and icons by about one third from their current desktop sizing.
- On small screens, use a deliberate full-screen details view with scaled-down contents rather than an oversized panel overlay that leaves messages visually covered underneath.
- Opening and closing details must not place message content beneath a visible details panel.

## Global Constraints

- Work only in the dedicated `feature/voice-call-ui-fixes` branch and worktree. Preserve the dirty `frontend/call-ui-preview.tsx` in the primary checkout; do not copy or edit it.
- Keep each change focused. Do not redesign unrelated call or chat UI.
- Write regression tests before each behavior fix, following the repository's bug-fix reproduction-first workflow. Run only the focused tests and relevant checks when implementation is authorized.
- Do not push, publish, or create a PR without explicit authorization.
- If the final implementation exceeds the repository's 300–400 changed-line PR guidance, split it into independently reviewable logical PRs and coordinate their dependency/order.

## Review Focus

- Stage measurements are scoped to the stage container and update correctly on resize; they do not depend only on screen size or participant count.
- The screen-share grid cannot consume space reserved for the call dock, and layout changes do not cause overflow or a resize loop.
- Camera acquisition and camera button state stay synchronized on first enable, including the mobile control path.
- Call end restores the state from call start without overwriting unrelated state when there was no active call.
- Screen-share capture no longer causes an implicit minimize, while route/chat navigation and the explicit minimize button still work.
- Header anchoring handles portal rendering, header replacement/resize, Chat Details transitions, dragging, and a missing-header fallback.
- Chat Details continues to have a readable desktop message pane and a clear mobile presentation at narrow widths.

## Implementation Plan

## Task 1: Establish regression coverage for shared screen-share layout

Files:
- `frontend/src/components/CallParticipantGrid.test.tsx`
- `frontend/src/components/CallParticipantGrid.tsx`
- `frontend/src/styles.css`

Steps:
1. Add tests for a stage with enough width and height (side rail), narrow width with enough height (bottom rail), and insufficient height despite ample width (bottom rail).
2. In the component test harness, provide deterministic container measurements and a ResizeObserver test double if needed. Assert observable placement classes/data and updated layout after a size change.
3. Run the focused test and confirm the new cases fail because current placement is driven by mobile mode/participant count rather than available space.
4. Implement a measured-layout decision in `CallParticipantGrid`; expose a small, testable layout state to CSS and keep all dimensions scoped to the actual stage.
5. Adjust the screen-share grid CSS: smaller participant cards/avatars, top alignment for the side rail, left alignment for the bottom rail, and min-size constraints that prevent content from sitting under controls.
6. Re-run the focused component tests and review the relevant call screenshots at desktop, narrow-wide, and short-height sizes.

**Expected:** the participant rail switches from side to bottom based on the measured stage width and height, and switches again after a resize.

## Task 2: Apply the same sizing and fit rules to Voice and Group Call stages

Files:
- `frontend/src/features/chats/calling/VoiceChannelStage.tsx`
- `frontend/src/features/chats/calling/CallPopupAudioStage.tsx`
- `frontend/src/styles.css`
- `frontend/src/features/chats/calling/VoiceChannelStage.test.tsx`
- `frontend/src/features/chats/calling/group-call-redesign.test.ts`
- `frontend/src/styles.voice-channel-layout.test.ts`

Steps:
1. Add regression assertions that Voice Channel screen-share stage ends above its bottom control bar and that the shared content fills the stage's available height.
2. Add Group Call coverage for the shared screen-share grid at short-height and narrow-width container sizes; cover audio-only participant cards only if those are the oversized cards in the reported UI.
3. Confirm the layout tests fail against the current flex sizing and screen-share grid.
4. Set the stage's flex children to shrink within a bounded area (`min-height: 0`, appropriate flex basis/grow/shrink); reserve dock height explicitly through the existing flex structure instead of allowing content to extend beneath it.
5. Keep Voice and Group Call on the same measured participant-grid behavior. Apply the modest participant-card size reduction to the audio-only group grid if needed.
6. Run the focused Voice Channel, Group Call, and layout tests; inspect at least one screen-share scenario in each call surface.

**Expected:** Voice and Group Call stages reserve the dock's space; screen content and participant cards remain visible above controls, with smaller top/right or left/bottom cards.

## Task 3: Fix first-click camera state in Group Calls

Files:
- `frontend/src/features/chats/calling/DesktopCallControls.tsx`
- `frontend/src/features/chats/calling/CallFeature.tsx`
- `frontend/src/features/chats/calling/DesktopCallControls.test.tsx`
- `frontend/src/features/chats/calling/CallFeature.minimized.test.tsx` (or a focused call-controls test if it owns the mobile path)

Steps:
1. Add a regression test for an audio Group Call: first camera click requests camera activation and renders the enabled camera state; second click disables it.
2. Add/extend a mobile-path case if its camera handler is separate.
3. Run the focused test and confirm the first click currently leaves the camera control showing the off state.
4. In the first-enable branch, update the UI/session `cameraEnabled` state as part of the same action that requests `toggleVideo(true)`; keep controller track acquisition and failure handling authoritative.
5. Verify disable/enable still alternates and that failed camera permission does not leave a false enabled indicator.
6. Run the focused camera-control tests.

**Expected:** the first camera click requests video and renders enabled only when camera enable succeeds; subsequent clicks toggle it off and on.

## Task 4: Restore the original Voice Channel layout after ending a call

Files:
- `frontend/src/pages/ChatsPage.tsx`
- `frontend/src/pages/ChatsPage.call-controls.test.ts` (or a focused `ChatsPage.voice-call-layout.test.tsx`)

Steps:
1. Add a regression case that starts a call from the normal layout, expands during the call, ends the call, and expects the original normal layout.
2. Add the inverse case: starts expanded, changes layout during the call, ends the call, and expects expanded layout.
3. Confirm current code fails because call end resets minimized state but does not restore `isVoiceCallExpanded`.
4. Capture the page layout state when the Voice Channel call transitions from inactive to active, and restore that snapshot when the same call ends. Clear the snapshot after restoration and guard against unrelated/non-Voice calls.
5. Verify Chat Details and the message/sidebar layout return to the correct positions in both cases.
6. Run the focused page tests.

**Expected:** after call end, the Voice Channel returns to exactly its expanded/collapsed state from call start, including the associated chat/sidebar/details composition.

## Task 5: Keep the call expanded when screen-share capture starts

Files:
- `frontend/src/features/chats/calling/CallFeature.tsx`
- `frontend/src/features/chats/calling/CallFeature.sharing.test.tsx`

Steps:
1. Change the current screen-share capture test into the reported regression: capture succeeds and the call remains expanded on its originating chat.
2. Confirm the existing effect currently calls `setIsCallMinimized(true)` after capture.
3. Remove capture success as an automatic minimize trigger while preserving explicit minimize and navigation-away behavior.
4. Run the focused sharing and minimize tests; verify returning to the originating chat leaves the call in its expanded presentation.

**Expected:** successful screen capture does not change the call's minimized state; explicit minimize and navigation behavior still work.

## Task 6: Anchor the minimized call chip to the active chat header

Files:
- `frontend/src/features/chats/calling/MinimizedCallBar.tsx`
- `frontend/src/features/chats/calling/useFloatingCallPanel.ts`
- `frontend/src/features/chats/calling/useFloatingCallPanel.test.tsx`
- `frontend/src/features/chats/calling/floatingCallPanel.css`
- `frontend/src/pages/ChatsPage.tsx`
- `frontend/src/features/chats/ConversationPanel.tsx` (confirm actual header owner before editing)
- `frontend/src/features/chats/details/ChatDetailsPanel.tsx` (confirm visible details-header owner before editing)
- `frontend/src/styles.css`

Steps:
1. Add deterministic tests for initial header-relative position, right-edge alignment, vertical gap, header resize/replacement, drag preservation, and fallback when the active header is not rendered.
2. Confirm the current fixed top/viewport position and panel-only ResizeObserver fail those cases.
3. Mark the visible active-chat header with a stable anchor identifier and pass the active call chat identity to the minimized panel.
4. Measure the matching visible anchor and position the portal panel from its bounds; observe anchor and panel size changes and re-evaluate after layout/scroll/resize. Keep a safe viewport fallback when no matching anchor is visible.
5. Store user drag as an offset from the current anchor rather than a stale viewport coordinate; remove conflicting hard-coded top rules.
6. Run the focused floating-panel tests and verify the chip tracks the header when Chat Details opens and on a narrow viewport.

**Expected:** minimized call placement tracks the visible matching chat header through layout changes and dragging, with a bounded viewport fallback.

## Task 7: Reduce Chat Details and make its layout responsive

Files:
- `frontend/src/features/chats/details/ChatDetailsPanel.tsx`
- `frontend/src/styles.css`
- `frontend/src/features/chats/details/ChatDetailsPanel.responsive.test.ts`
- `frontend/src/pages/ChatsPage.chat-details.test.ts`

Steps:
1. Add a desktop regression test for details-column width and message-grid reflow, plus a narrow-screen test that asserts the details view is intentionally full-screen and its contents fit.
2. Confirm the tests expose the current 340–420px desktop track, oversized hero/actions, or overlapping message/details content.
3. Reduce desktop details track to about 280–320px; keep chat/message track `minmax(0, 1fr)` and ensure the details panel is confined to its own grid area.
4. Scale avatar, heading, action tiles, and action icons by roughly one third. Preserve readable labels and hit targets.
5. Refine the small-screen full-screen details state so the message pane is not visible beneath/alongside a partial details overlay; scale the avatar and actions consistently.
6. Run the focused responsive and page layout tests at desktop and mobile breakpoints.

**Expected:** desktop details use a narrower column with messages reflowed beside it; narrow screens show a compact full-screen details view without covered messages.

## Verification Plan

After implementation is approved, run the focused tests listed in each task, then the relevant frontend call/layout test subset identified by repository conventions. Do not run the full repository suite unless requested. Manually inspect the reported cases at:
- Voice Channel, screen share, side rail, tall/narrow stage, and short stage.
- Group Call camera first-enable and screen-share layout.
- End call from expanded and regular Voice Channel layouts.
- Return to the originating chat after sharing starts.
- Minimized chip with normal and open Chat Details headers.
- Chat Details on a regular desktop width and a narrow mobile width.

## Self-review

- Covers each reported issue: participant rail location/size, call stage/control overlap, call-end restoration, initial camera state, screen-share minimization, minimized-chip offsets/anchoring, details width/sizing/mobile behavior, and message reflow.
- Names current likely owners and tests; implementation must confirm the exact header component and mobile camera handler before editing.
- Keeps implementation gated on review of this plan; no product code has been changed as part of preparing it.
