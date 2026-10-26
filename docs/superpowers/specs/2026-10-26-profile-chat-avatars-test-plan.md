# Profile, Chat, and Folder Avatars Test Plan

This acceptance matrix is the test-plan section of the approved combined feature spec at `docs/superpowers/specs/2026-10-26-profile-chat-avatars-design.md`. The original combined document was approved before implementation; this file is a delivery-workflow extraction for machine-readable contract validation.

| Acceptance ID | Scenario | Expected result | Proof layer |
| --- | --- | --- | --- |
| AV-01 | Render the same person with initials, selected symbol, or uploaded photo at several sizes | The shared renderer keeps the selected treatment consistent while sizing changes | Component tests |
| AV-02 | Render the same member in chat lists/details, member lists, and voice call participant views | Each view uses the same profile choice and retains call state indicators | Component tests |
| AV-03 | Render family, group, archive, voice, channel, and direct chats without photos | Defaults are Home, Users, Archive, AudioLines, Megaphone, and the other member's profile avatar | Component tests |
| AV-04 | Generate defaults for different IDs and render repeatedly | Colors come from the curated palette and stay stable for each ID | Unit tests |
| AV-05 | A person chooses a symbol/color, reloads, and views a call | API persists the choice; invalid values are rejected or safely defaulted | API/backend tests |
| AV-06 | A chat manager chooses an icon/color for a group, voice chat, or channel | API persists the choice and non-managers cannot change it | API/backend tests |
| AV-07 | A folder creator changes its icon/color, reloads, and edits again | Local folder data retains the selection and shared renderer displays it | Component tests |
| AV-08 | User switches between photo and built-in symbol | Existing photo reference remains available and stored media is not deleted | Integration/component tests |
| AV-09 | Use the picker with keyboard, screen reader labels, mobile viewport, dark theme, and both locales | Controls are reachable, labeled, legible, and usable | Component and visual review |

## Focused verification

- Frontend component tests cover avatar rendering, stable defaults, profile editing, folders, call participants, and chat list archive rendering.
- `npm run check:i18n` checks paired English and Russian strings.
- `npm test -- --run src/design-system/tokens.test.ts` checks shared palette tokens.
- `npx tsc --noEmit` checks frontend types.
- Focused Go tests cover HTTP validation and affected identity/chat packages; full app tests are tracked separately if unavailable.
- The headless Playwright visual suite captures the avatar picker, mobile keyboard interaction, and shared shell across both themes/locales.
