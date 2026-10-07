# Voice Channel Screen Share Layout

## User problem

During screen sharing, the participant profile is placed in a narrow right rail and the stage can scroll. The call also shares width with the chat list, while the voice-channel status row is visually cramped.

## Scope

- Keep the shared screen as the main surface and anchor participant tiles in a compact left rail on desktop.
- Move the participant rail below the shared screen when the viewport is too narrow for a useful side rail.
- Keep the call stage itself fixed and non-scrollable; scroll only the participant rail when its participants exceed the available space.
- Keep the app's screen-share control docked at the bottom. The browser-owned screen-sharing indicator remains browser UI.
- Add a voice-channel expand control that hides the chat list and gives the call the available width.
- Slightly enlarge voice-channel participant avatars in chat status rows and reduce the vertical gap below the channel name.

## Observable behavior

- With screen sharing on desktop, the presenter remains prominent and the profile/participant rail is visible on the left.
- On narrow layouts, participant tiles sit below the screen rather than forcing a horizontal overflow.
- The stage does not scroll; the participant rail can scroll when needed.
- Expanding a voice call hides the chat list; collapsing restores it.
- Voice-channel status avatars are slightly larger and sit closer to the channel name.

## Constraints and decisions

- Reuse the existing call grid and chat-layout shell; no call signaling or media behavior changes.
- The browser's native sharing bar cannot be positioned by the application.
- Preserve accessibility with an action label that changes between expand and restore.
