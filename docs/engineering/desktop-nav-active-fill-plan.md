# Desktop navigation active fill

## Feature plan

- Problem: desktop navigation uses floating circular highlights that do not fill the navigation rail item; active SVG icons remain outlined.
- Scope: make desktop active and hover states fill each navigation link's full rail cell, preserve spacing between cells, fill active navigation SVG icons on desktop and mobile, suppress hover styling on touch devices, and make the chat creation action smaller with a plus icon.
- Observable behavior: selected/hovered desktop links show a rounded rectangular accent surface across their full cell; selected destination icons are filled. Mobile navigation dimensions, active backdrop, and layout stay as they are, tapping a link does not leave a hover square, and the chat creation button is a smaller circle on desktop and mobile.
- Constraints: logout remains outside the destination highlight; respect reduced-motion and existing routing behavior.
- Design: use the existing per-link pseudo-element for desktop highlight; scope touch suppression to navigation links and rely on `aria-current`/`.active` for persistent selection.
- Icon treatment: use filled silhouettes for active destinations while preserving the Settings center, the Plans markers, and the Admin check as background-colored cutouts.
- Desktop spacing: match the active item corner radius to `--float-radius-panel` and reduce the rail's top inset.

## Test plan

- Source contract test: desktop highlight is full-cell and rectangular, not a 60px circle; logout is excluded.
- Source contract test: selected SVG icons receive a filled treatment at desktop and mobile breakpoints.
- Source contract test: touch hover styling is disabled for nav links while mobile active styling remains intact.
- Component test: chat creation action uses a 20px SVG plus and continues to open the new-chat screen.
- CSS token review: the shared floating action size drops from 56px to 48px, including mobile.
- Existing AppNav visibility tests continue to cover tab rendering and routing destinations.
