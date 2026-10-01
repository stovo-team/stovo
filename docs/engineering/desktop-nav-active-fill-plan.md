# Desktop navigation active fill

## Feature plan

- Problem: desktop navigation uses floating circular highlights that do not fill the navigation rail item; active SVG icons remain outlined.
- Scope: make desktop active and hover states fill each navigation link's full rail cell, preserve spacing between cells, fill active navigation SVG icons on desktop and mobile, and suppress hover styling on touch devices.
- Observable behavior: selected/hovered desktop links show a rounded rectangular accent surface across their full cell; selected destination icons are filled. Mobile dimensions, active backdrop, and layout stay as they are, and tapping a link does not leave a hover square.
- Constraints: logout remains outside the destination highlight; respect reduced-motion and existing routing behavior.
- Design: use the existing per-link pseudo-element for desktop highlight; scope touch suppression to navigation links and rely on `aria-current`/`.active` for persistent selection.

## Test plan

- Source contract test: desktop highlight is full-cell and rectangular, not a 60px circle; logout is excluded.
- Source contract test: selected SVG icons receive a filled treatment at desktop and mobile breakpoints.
- Source contract test: touch hover styling is disabled for nav links while mobile active styling remains intact.
- Existing AppNav visibility tests continue to cover tab rendering and routing destinations.
