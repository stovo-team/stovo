---
title: "Chat details popup design"
type: specification
---

# Chat details popup design

## Intent

When a user opens chat details, show the existing small-screen popup design at every screen size. The popup is fixed 12px from the top, right, and bottom, with a width capped at 400px and the existing backdrop. This removes the persistent right-hand details column shown in the supplied screenshot and keeps the already-established popup presentation consistent.

## Goals

- Use the existing compact chat details popup and backdrop on desktop, tablet, and mobile.
- Keep the conversation at its normal layout width behind the popup.
- Preserve existing detail tabs, settings, media, actions, and close behavior.
- Avoid changing how users open details or how chat data is managed.

## Non-goals

- Redesigning the contents of chat details.
- Changing the details entry point, shortcut, or persistence.
- Changing call layout or other chat overlays.

## Approaches

1. **Centered modal dialog:** redesign the desktop details surface as a centered modal. This removes the right-side column but introduces a new design.
2. **Reuse the existing small-screen popup at every size (chosen):** remove the desktop third column and apply the current fixed, right-aligned popup, backdrop, and compact sizing rules at every width. This preserves existing details content and behavior without adding a new visual design.

The user clarified that the existing small-screen popup should be used everywhere. Details appear only while open over the chat; the chat keeps its regular two-column grid.

## Constraints and behavior

- Keep the existing `isDetailsOpen` state and dismissal stack.
- Preserve the popup's existing dialog semantics, close action, Escape handling, and compact sizing.
- Apply the popup positioning, backdrop, and compact styling globally, without changing how details open or how chat data is managed.
- Add focused frontend coverage proving desktop details no longer create a third chat-layout column and are presented as an overlay.

## Test plan

- Update the chat details responsive test to assert the existing popup positioning is global and the desktop third-column rule is absent.
- Run the focused chat details tests and relevant frontend checks required by the repository workflow.
