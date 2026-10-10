# Shared call stage, floating controls, and settings

Date: 2026-10-10
Status: conversational design approved; written specification awaiting review.

## User problem and outcome

Call presentation currently loses space to header and footer controls, participant
cards overflow or change shape, and Guest Meeting uses a different stage and mobile
settings from the other calls. The user supplied reference screenshots showing a
large shared screen, compact landscape participant cards, and unobtrusive controls.

Provide the same base stage, participant cards, control buttons, and settings for
DM, Group Call, Voice Chat, and Guest Meeting. Keep the current visual language,
including its rounded surfaces. The user approved implementing inline in this chat.

## Scope

- Maximize the shared screen within the available stage, preserving the source ratio.
- Compact participant cards at 16:9, on the right when room permits and below otherwise.
- A chevron hides/restores the participant rail and gives its space to the shared screen.
- Shrink/expand and invite controls overlay the stage instead of allocating rows.
- A rounded floating control panel with a 90% opaque surface.
- One settings dialog with General, Audio, and Camera tabs, using the application's
  current language convention (English labels today; Russian names in the request
  describe these same tabs).
- General: an optional setting to hide controls until hovered, focused, or tapped.
- Audio: preserve the existing supported settings, device selection, and audio tests.
- Camera: device selection, local mirror, and crop/fill versus fit display.
- Consistent base components across all four call types, including mobile settings.

The already reproduced geometry defects are handled by the preceding regression
fix: right rail overflow, compact 16:9 bottom cards, group audio popup overflow,
and a mobile two-person group column switching to a grid with three participants.
The follow-up request also removes excessive gallery margins, increases the desktop
group popup height, and aligns the mobile presentation row left with slightly taller
cards.
That mobile group behavior must also work with two live cameras.

## Current structure

- `CallParticipantStage` is a shared wrapper, but does not own the stage layout.
- `CallParticipantGrid` owns DM/group video and presentation, mobile group calls,
  and voice presentations. It supports real and synthetic mock screen streams.
- `DesktopCallControls` also has a separate audio stage for small calls.
- `VoiceChannelStage` uses separate avatar/video cards outside presentation.
- `GuestMeetingPage` has its own participant cards and presentation spotlight.
- `CallControlButton` and `CallDeviceControls` already provide shared control bases.
- `CallAudioSettingsPopup` and `CallVideoSettingsPopup` are separate dialogs.
- `GuestMeetingAudioSettings` delegates desktop audio to the shared dialog but
  implements a separate mobile audio panel.

## Architecture and alternatives

Use common presentational components with thin adapters for the existing call
engines. This gives all call types the same layout and behavior while preserving
media lifecycle ownership in their current sessions.

Patching each layout independently would be smaller initially, but would keep the
inconsistencies that prompted this request. Replacing call sessions with a new
engine would expand the change beyond the UI problem. Neither is selected.

### Shared stage

Extend the existing shared stage/grid boundary so that layout, participant rail,
collapse control, and sizing are implemented once. Normalize participants from
chat sessions and Guest Meeting's media engine into a common presentation model:
identity, display name, profile photo, camera stream, screen stream, mute/speaking
state, and whether the participant is local. Keep audio playback ownership explicit
so adapting Guest Meeting does not create duplicate audio elements.

Use one presenter sizing policy for real and mock sharing. It uses measured stage
width and height, the actual participant rail size, and one gap. It must fit the
entire source within the largest remaining rectangle without clipping or stretching.
A synthetic mock source remains 16:9. Real sources retain their intrinsic ratio,
with 16:9 as a fallback before metadata is available. Camera crop preferences must
never crop shared screen content.

Wide stages show a narrow right rail. Constrained stages show a short bottom row.
Choose using available dimensions; participant count alone must not move the rail
when the stage still has room. Right rails can scroll vertically when required,
never horizontally. Bottom rails stay in one row and scroll horizontally when
participants exceed its capacity. Mobile rows align left, with cards 144×81px
and 128×72px at widths up to 420px. Cards remain landscape, including muted avatars.

Without a presentation, portrait/mobile group calls use one column for two people
and a grid for three or more. Gallery cards occupy the entire available grid cells;
they do not impose the presentation rail's 16:9 frame constraint. Camera content
inside them follows the Fit/Crop preference. Use the full mobile width with small
edge spacing and the space between the top overlay and controls. Increase the
desktop group popup height to min(640px, viewport height minus 40px); allow its
gallery to fill the remaining height. Desktop gallery remains a grid. Existing DM main
video/PiP switching remains available in its established mobile mode.

The chevron is an accessible button with Hide participants/Show participants labels
and `aria-expanded`. It stays reachable while the rail is hidden. Collapse state
belongs to the current call and resets when that call ends. Collapsing immediately
recalculates the presenter size; resizing and changing screen sources do likewise.

### Floating chrome and controls

The stage fills the call surface. Shrink/expand and invite controls occupy overlay
corners. The existing actions and permissions stay connected to their sessions.

Use a shared control-panel shell around the existing control button and device
components. Its background uses the current raised-surface token at 90% opacity,
a subtle border, and the established radius token. It is centered near the bottom
with safe-area spacing. On small screens controls remain a single row, with existing
secondary actions in More. This panel overlays the stage and does not shrink the
presentation region. Participant cards have sufficient bottom clearance to keep
names and click targets accessible above the panel.

General auto-hide defaults to off. When enabled, overlay controls hide when the
pointer leaves the call surface. Entering the surface or moving its pointer reveals
them; hovering the panel keeps it visible. Keyboard focus within any control, an
open settings dialog/device menu/invite panel, and interaction with the collapse
button keep controls visible. On touch, tapping the stage toggles controls. Hidden
controls must not intercept pointer events. Respect reduced motion. Retain an
accessible route to reveal controls for keyboard users.

### Shared settings

Introduce a shared settings-dialog shell and reusable content panels. Tabs appear
on the left on desktop; at narrow widths use compact tabs that do not consume most
of the content width. Expose tablist/tab/tabpanel semantics, arrow-key navigation,
selected state, focus management, and the existing close/backdrop behavior.

Opening Settings selects General. Existing Audio settings entry points select
Audio, and Video settings entry points select Camera. Each opens the same dialog.
Guest Meeting's mobile settings use these same panels rather than a separate subset.

General contains a labelled auto-hide toggle. Camera contains the current camera
selector and local mirror toggle plus Camera display choices Fit and Crop to fill.
Display changes affect camera previews/tiles in all four call types; mirror affects
only the local front-camera preview. Missing/unsupported devices remain disabled
with the existing explanatory UI. Audio retains volume, mic/output device selection,
supported audio processing controls, and test actions, without resetting their
values when tabs change.

Store auto-hide and camera-display preferences in a small shared UI preferences
module, independently from media/controller settings. Persist to localStorage for
this browser, validate loaded values, and tolerate unavailable storage. Defaults:
auto-hide off and camera display Fit. These preferences are local viewing choices;
they do not broadcast into mock calls or change another participant's capture.

## Integration contracts

All four call paths render the same stage/layout base and the same control-panel
and settings bases. Adapter code may vary for device capabilities, action callbacks,
guest authorization, and media engines. Settings supported by a call type are
shown consistently; unsupported actions are visibly disabled or omitted according
to the existing capability contract.

Preserve call connection/end/invite behavior, mock tab synchronization, media ref
lifetimes, track cleanup, microphone/output controls, camera switching, recording,
captions, and existing mobile routing. Layout and preference changes must not
restart streams, request capture permission, or stop audio. Hiding participants
must not mute them or unmount required audio playback.

Preview screens can reuse control/settings bases but keep their existing pre-join
behavior. This work does not change server APIs or add new mock participants.

## Test plan and acceptance

Write failing tests before each observable feature, then implement it.

1. Shared sizing unit tests: wide, short, portrait, arbitrary screen ratio, collapsed
   rail, and resized stage. Presenter never exceeds available dimensions.
2. Component tests: collapse label/state and enlarged presenter; participant audio
   remains attached while hidden; same base components used by all four adapters.
3. Settings tests: all three tabs, keyboard navigation, Audio/Camera deep entry,
   retained media settings, preference defaults/persistence/invalid storage,
   unsupported devices, mirror limited to local camera, crop never affecting share.
4. Controls tests: auto-hide off/on, hover, keyboard focus, open menus, touch reveal,
   and no invisible overlay intercepting clicks.
5. Browser geometry tests: gallery fills the available area; right rail has no horizontal clipping; bottom row is
   compact 16:9; collapse increases actual presenter bounds; floating chrome does
   not allocate stage rows; expanded sharing fits wide/short/mobile windows.
6. Browser/component integration coverage for DM, group, voice, and guest adapters,
   including the mobile guest settings path and both mock and real-stream fixtures.
7. Preserve the existing two-tab mock sharing lifecycle scenarios and gallery
   regressions, including two live group cameras and a third participant joining.

Run focused tests, relevant full frontend tests, lint, production build, and the
focused browser suite against the local mock environment. Report existing unrelated
lint failures explicitly; never update a baseline to hide them. Review visual
screenshots of wide/right, short/bottom, rail hidden, mobile pair/grid, and settings
before delivery. Commit completed tasks locally; publishing requires authorization.
