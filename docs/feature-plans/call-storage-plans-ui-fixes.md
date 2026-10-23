---
title: "Call, Storage and Plans UI fixes"
type: feature-plan
---

# Call, Storage and Plans UI fixes

## User problem

Call settings and device controls are unreliable or visually noisy, and the call actions and meeting invitation buttons take more space than needed. Storage and Plans keep their source/event lists permanently beside the main view, while the Plans calendar uses the browser language for dates and occupies too much vertical space.

## Scope and observable behavior

- Keep call settings open while the user operates controls inside the dialog, including device choices; show clear borders on microphone, speaker and camera menus.
- Remove the unintended halo around active call controls while retaining a visible keyboard-focus indicator.
- Reduce meeting recording controls and shorten call copy to “Captions”, “Join” and “In Plans” (with matching Russian text).
- Add accessible collapse controls to the Storage source list and Plans event list. Collapsing either list gives the main view its space back; on Plans, move the view filters below the date header when its event list is collapsed.
- Narrow the Plans event list, localize weekday and month names using Stovo’s selected language, and reduce the date header height.

## Constraints and decisions

- Keep the existing call settings dialog, device-selection behavior, data loading and selection state; this is a presentation and interaction correction.
- Keep Storage’s existing mobile source picker and Plans’ existing mobile layout.
- Preserve the selected Storage source, selected plan, and calendar range when a desktop list is collapsed or expanded.
- Retain keyboard access and accessible names/states for all new collapse buttons.
- Use the app’s `resolvedLanguage` for calendar date formatting; do not depend on the browser locale when the user selected a language in Stovo.
