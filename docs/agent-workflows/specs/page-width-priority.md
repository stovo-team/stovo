---
title: "Page width priority"
type: specification
---

# Page width priority

Status: approved for implementation. The human approved the scope and test plan in this chat on 2026-10-26, replying “Approve and proceed” to the displayed review.

## Intent

Use wide desktop space for the Plans calendar and active conversations. Keep the conversation readable at a 1400px maximum while allowing the chat list to use space left over after the conversation reaches that width.

## Acceptance criteria

- **P1 — Plans calendar width:** At viewport widths of 1600px and above, the Plans content and week calendar use all width available after the Plans sidebar and divider. They have no 1200px maximum width.
- **C1 — Conversation cap:** In the standard desktop two-pane chat layout, the active conversation grows with available width until it reaches 1400px. Below that size it remains fluid.
- **C2 — Chat list gets remaining width:** Once the conversation reaches 1400px, the chat list grows to consume additional width. The two panes fill the chat layout without a blank strip at the right.
- **R1 — Existing narrower behavior:** Below 1600px, mobile layout behavior and the calendar’s existing 620px three-day and 1200px week minimum widths remain unchanged.

## Constraints and non-goals

- Keep the existing 1600px wide-screen breakpoint.
- Preserve the current chat list minimum width and the voice-call expanded single-pane layout.
- Do not change calendar scrolling, typography, copy, or mobile behavior.

## Approaches

1. Update the existing wide-screen rule: remove the Plans content cap, set a 1400px active-chat cap, and use a flexible first grid track for the chat list after reserving space for the capped chat and current gutter. This follows the current responsive structure and preserves narrower widths.
2. Remove width limits across all viewports. This changes tablet and mobile sizing and does not match the approved scope.
3. Keep the fixed 320px chat list and center a 1400px conversation. This leaves extra desktop width unused by the chat list.

Use approach 1 because it meets the approved width priority while retaining the established breakpoint and sidebar minimum.
