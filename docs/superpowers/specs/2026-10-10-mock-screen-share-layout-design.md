---
title: "Mock call screen sharing and layout"
type: specification
---

# Mock call screen sharing and layout

## User problem

The local mock call flow cannot currently exercise screen sharing, so the screen-share stage and participant layout cannot be demonstrated in the browser. The desired behavior is for a large screen-share stage to place participant tiles in a rail on the right, while a constrained stage places them below the shared screen. The New Chat dialog's close button should also match the circular gray close buttons used by other dialogs.

## Scope

- Add a mock-only way to start and stop screen sharing during a connected demo call.
- Synchronize the active presenter across same-origin mock tabs so each participant sees the same presenter and layout.
- Render a synthetic 16:9 screen fixture in the existing call interface without requesting real screen capture.
- Use the available stage dimensions to put participant tiles on the right when the stage and rail fit, and below when the stage is constrained.
- Give the New Chat close button the same circular gray surface and border used by the Add People dialog.
- Add regression coverage for mock sharing, its cross-tab lifecycle, layout selection, and the close-button styling.

The change is gated to local mock mode. Normal development and production call behavior remain unchanged.

## Observable behavior

### Mock screen sharing

- In a connected mock call, the screen-share control is enabled and starts or stops a synthetic share. It does not call `getDisplayMedia`, acquire a device, or connect a media engine.
- A mock call has at most one active screen-share owner. The owner is represented in the existing shared call snapshot as a nullable user ID. While a share is active, another participant cannot replace the owner; only the owner can stop that share. Snapshots written before this field existed are read as having no active share.
- Every same-origin tab participating in that call observes the same owner and renders the synthetic 16:9 fixture for that participant. The fixture is local UI content; the app does not transmit screen pixels or media.
- The presenter can stop sharing. Sharing also clears when its owner leaves the call or when the call ends. Other participants remain in the call.

### Screen and participant layout

- When the screen stage and participant rail fit side by side, the shared screen is the main stage and participant tiles appear in a rail on its right.
- When the available stage dimensions cannot fit both regions side by side, participant tiles appear below the shared screen.
- Resizing the call stage between these cases updates the layout without losing the active mock share.
- Existing call participant, screen-stage, and responsive layout components remain in use.

### New Chat close button

- The New Chat dialog close control is circular and has the same gray background, border, and interactive states as the Add People dialog close control.
- Its close action and accessible name remain unchanged.

## Design decisions

- Reuse the existing same-origin mock call broker and its shared snapshot as the source of truth for the current presenter. The broker validates that only a connected participant can start or stop their own share.
- Keep only the presenter user ID in shared state; each tab renders the same local synthetic fixture for that presenter. Do not store a stream, captured pixels, or generated image data in the broker.
- Drive the mock UI from the broker state through the existing mock call session boundary. Keep real capture and production media controllers out of the mock branch.
- Reuse the existing stage-size layout policy: side rail when both regions fit; bottom row otherwise. Add integration coverage from the mock call UI so the existing layout policy is exercised through the newly enabled mock flow.
- Reuse the established Add People close-button styling for New Chat so both dialogs stay visually consistent.

## Out of scope

- Real screen capture, browser display-capture permission prompts, transmitting screen media, audio/video device access, WebRTC, LiveKit, recording, or calls between devices or browser profiles.
- Changing the production screen-share implementation or the call layout policy outside the mock call path.
- Changes to chat creation behavior beyond the close button's appearance.

## Regression and verification coverage

Before changing behavior, add regression tests that fail against the current mock call path. The implementation should then make these tests pass:

- Broker tests cover the nullable presenter field, old-snapshot compatibility, starting/stopping a share, rejection of a nonparticipant or a second presenter trying to take over, rejection of another participant trying to stop the active share, and cleanup when the owner leaves or the call ends.
- Mock-call tests prove a share is visible in a second same-origin participating tab and clears after owner departure or call end.
- Mock UI tests prove the screen-share control starts and stops the synthetic fixture without invoking `getDisplayMedia`, camera/microphone acquisition, audio playback, Socket.IO, WebRTC, or LiveKit.
- Layout integration tests verify a wide stage renders participant tiles on the right and a constrained stage renders them below, while resizing preserves the share.
- New Chat dialog tests verify a circular gray close button with the same background and border treatment as Add People, while retaining close behavior and accessible labeling.

Run only the focused checks required by the repository's bug-fix, feature, and testing workflows, plus any relevant command required by `CONTRIBUTING.md`.

## Important risks

- Mock call state is persisted for same-origin tab synchronization; schema parsing must handle snapshots from before screen sharing was added and malformed presenter IDs safely.
- The real call hook contains device-capture cleanup paths. The mock implementation must never fall through into those paths when stopping a synthetic share.
- The layout is driven by observed dimensions. Integration tests must exercise the real call stage rather than only testing the standalone layout helper.
- The primary checkout contains an unrelated local edit in `frontend/call-ui-preview.tsx`; implementation must preserve it and keep task changes in the dedicated worktree.
