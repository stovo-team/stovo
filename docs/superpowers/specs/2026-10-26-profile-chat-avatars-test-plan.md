---
title: "Profile, Chat, and Folder Avatars Test Plan"
type: test-plan
---

# Profile, Chat, and Folder Avatars Test Plan

This acceptance matrix is the test-plan section of the feature spec at `docs/superpowers/specs/2026-10-26-profile-chat-avatars-design.md`, including the user's 2026-10-26 amendments to avatar customization scope and visual treatment.

| Acceptance ID | Scenario | Expected result | Proof layer |
| --- | --- | --- | --- |
| AV-01 | Render a person with a photo or initials at several sizes | People never display symbol/color choices, including with legacy preferences | Component tests |
| AV-02 | Render the same member in chat lists/details, member lists, and voice call participant views | Each view uses the same photo or initials and retains call state indicators | Component tests |
| AV-03 | Render family, group, archive, voice, channel, and direct chats without photos | Defaults are Home, Users, Archive, AudioLines, Megaphone, and the other member's profile avatar | Component tests |
| AV-04 | Generate defaults for different IDs and render repeatedly | Colors come from the curated palette, are muted, and stay stable for each ID | Unit tests |
| AV-05 | A manager opens chat settings for a group, channel, or voice channel | Picker appears only for those types, saves across views, and rejects unauthorized updates | Component and API/backend tests |
| AV-06 | A folder creator changes its icon/color and edits again | Local selection persists; the neutral background-free icon follows the disclosure arrow | Component tests |
| AV-07 | User switches between initials and a profile photo | Existing photo reference remains available and media is not deleted | Integration/component tests |
| AV-08 | Hover over folder headings and chat header controls | There are no hover appearance changes; keyboard focus still reveals folder actions | Style/component tests |
| AV-09 | Use chat/folder picker with keyboard, screen reader labels, mobile viewport, dark theme, and both locales | Controls are reachable, labels clear, symbols/backgrounds/colors legible, and layout usable | Component and visual review |

## Focused verification

- Frontend component tests cover avatar rendering, stable defaults, profile editing, folders, call participants, and chat list archive rendering.
- `npm run check:i18n` checks paired English and Russian strings.
- `npm test -- --run src/design-system/tokens.test.ts` checks shared palette tokens.
- `npx tsc --noEmit` checks frontend types.
- Focused Go tests cover HTTP validation and affected identity/chat packages; full app tests are tracked separately if unavailable.
- The headless Playwright visual suite captures the avatar picker, mobile keyboard interaction, and shared shell across both themes/locales.
