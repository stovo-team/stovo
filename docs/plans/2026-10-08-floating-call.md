---
title: "Floating minimized call panel"
type: plan
---

# Floating minimized call panel

Problem: the minimized call obscures the header and cannot be moved out of the way.
Scope: drag the existing minimized panel by its title using mouse, pen, or touch. Keep microphone, restore, and hang-up actions usable. Expanded call surfaces do not drag.
Behavior: free placement inside the viewport, below the header clearance. Within 24 px, snap each axis to its edge or midpoint, giving corners, side centers, and edge alignment. Keep the position through tab navigation for the current call; reset when the call ends. Clamp on resize.
Decision: use pointer capture and CSS fixed positioning, without reconnecting media or storing coordinates on the server. Clicking the title still restores the call; dragging must not restore it.

## Test plan

- Component: dragging changes position, preserves free positions, snaps near boundaries, and remains within a small viewport.
- Component: a drag suppresses the following restore click; a normal click restores; microphone and hang-up controls never start a drag.
- Component: position survives remount/navigation and resets for a new call; resize clamps to visible bounds.
- Regression: screen sharing does not minimize on browser focus changes; restoring returns to the call chat, which scrolls into view.
- Visual QA: circular controls, header clearance, centered participant grid, full-height top-aligned screen share, 40 px FABs, compact history and voice rows.
