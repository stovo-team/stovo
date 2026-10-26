# Profile, chat, and folder avatars

Status: draft for human review

## Intent

Give people, chats, and chat folders a consistent avatar treatment across Stovo. Today, profile photos are shared in some views, while other views independently draw initials or a type icon; the available photo controls do not let a person choose an SVG symbol and color. Voice call participants need to show the same saved profile avatar as the rest of the app.

## Goals

- Use one shared, size-aware avatar renderer wherever profile or chat avatars appear, including profile/settings views, member lists, chat lists/details, and voice call views.
- Keep initials as the default for people. Let a person choose a built-in symbol and color.
- Give groups, voice chats, announcement channels, and folders useful built-in SVG defaults. Allow chat and folder owners to choose a built-in symbol and color.
- Keep a bright, readable, stable generated color for entities with no explicit color, derived from the entity ID and a shared curated palette. The color must not change between views or app launches.
- Keep uploaded photos available. Let a person or chat switch between its saved photo and built-in treatment without deleting or re-uploading the photo.
- Save person and chat choices through the API so they follow the entity across devices. Save folder choices with the existing per-family local folder settings.

## Non-goals and anti-goals

- Do not accept arbitrary SVG markup or image data as a symbol. Symbols come from an app-owned ID allowlist and render as safe built-in SVG components.
- Do not remove the existing photo upload and crop flows.
- Do not add a separate avatar renderer for call, list, or detail layouts.
- Do not change chat-folder matching rules or folder sync behavior.

## Constraints

- The current API and database store profile and chat photo file IDs, but no symbol/color fields. New optional fields must be backward-compatible and migrated safely for existing installations.
- Chat folders are stored in browser local storage today.
- Avatar color and SVG rendering must follow shared design tokens and palette conventions.
- Preserve current visibility and chat-management permission checks when saving choices.
- English and Russian UI copy must use the existing string catalogs.

## Approaches

1. **Shared renderer and persisted avatar choices (recommended).** Build one size-aware component and picker. Persist profile/chat symbol and color in the existing user/chat records, and store folder symbol/color in each local folder record. This meets cross-view and cross-device consistency while retaining existing photo flows.
2. **Browser-only symbol/color choices.** Store all choices locally. This is smaller, but profile and chat choices would not follow entities to other devices and would not reliably appear in calls or other sessions.
3. **Encode symbols as uploaded photos.** Reuse existing photo fields by generating image files from selected symbols. This makes changing symbol and color awkward, adds storage objects, and does not create a reusable shared avatar contract.

The recommended approach is proposed because saved profile and chat choices must appear consistently in every view and session.

## Proposed behavior and decisions left to the builder

- The avatar renderer accepts entity kind, label, optional photo, avatar mode (`photo` or `symbol`), optional symbol ID, optional color, and size. The saved mode decides whether to display the photo or built-in treatment. Existing records with a photo default to `photo`; records without a photo default to `symbol`.
- A person with no photo or selected symbol displays their initials on the deterministic palette color. Selecting a symbol displays that symbol on the saved or deterministic color.
- Default chat symbols: `Users` for groups, `Home` for the family chat, `Archive` for archive chats, `AudioLines` plus the existing live-state affordance for voice chats, and `Megaphone` for channels. The current chat model has one `channel` kind and no announcement subtype, so all channels use the announcement symbol. Direct chats keep the other person's profile avatar.
- Folders default to `Folder` and a deterministic palette color. Folder creators can change both values in the existing folder create/edit flow.
- The picker uses a curated set of existing Lucide symbols with stable IDs. Proposed additional choices: `UserRound`, `Heart`, `Home`, `Star`, `Music`, `BookOpen`, `Camera`, `Shield`, `Sparkles`, and `Bell`. Use curated colors from `frontend/src/design-system/palette.ts`, with palette entries represented in `tokens.css`; keep icon foreground contrast readable.
- Missing values from existing accounts/chats use deterministic defaults. Unknown or invalid symbol IDs safely fall back to the entity's default symbol/initials.
- Keep the photo file reference when the user switches to a symbol, so switching back restores the saved photo without another upload. Existing uploaded media is never deleted by avatar mode changes.
- Chat edits remain restricted to existing chat managers. A person can edit their own profile avatar. Folder edits follow the current local folder controls.

## Acceptance criteria and test plan

| Acceptance ID | Scenario | Expected result | Proof layer | Required evidence |
| --- | --- | --- | --- | --- |
| AV-01 | Render the same person with initials, selected symbol, or uploaded photo at several sizes | All views use the shared renderer; initials/symbol/photo and color remain consistent, and sizing changes without changing style | Component tests | Focused frontend component tests |
| AV-02 | Render the same member in chat lists/details, member lists, and voice call participant views | Each view uses the same profile photo or selected symbol/color; existing call state indicators remain visible | Component tests | Focused call/avatar tests |
| AV-03 | Render family, group, archive, voice, channel, and direct chats with no photo | Defaults are Home, Users, Archive, AudioLines with live indicator, Megaphone, and the other member's avatar respectively | Component tests | Focused avatar mapping tests |
| AV-04 | Generate defaults for different IDs and render repeatedly | Colors are from the approved palette, bright/readable, and stable for each ID across renders and reloads | Unit tests | Deterministic color tests with fixed IDs |
| AV-05 | A person chooses a symbol/color, reloads, and views a call | API persists the choice and every view reflects it; invalid symbol/color values are rejected or safely defaulted | API/backend tests | Request validation, persistence, response round-trip tests |
| AV-06 | A chat manager chooses an icon/color for a group, voice chat, or channel | API persists the choice and all chat views reflect it; a non-manager cannot change the choice | API/backend tests | Permission and persistence tests |
| AV-07 | A folder creator changes its icon/color, reloads, then edits it again | Local folder data retains the selection and the same shared renderer displays it | Component tests | Folder create/edit and reload tests |
| AV-08 | User switches between photo and built-in symbol | Existing crop/upload still works; mode changes preserve the photo reference and allow switching back without upload; stored media is not deleted | Integration/component tests | Profile and chat editor tests |
| AV-09 | Use the picker with keyboard, screen reader labels, narrow mobile viewport, dark theme, and both locales | Controls are reachable and labeled; tokens keep symbols/backgrounds legible; layouts remain usable | Component and visual review | Screenshot for affected state at a named viewport, theme, locale, and interaction; English and Russian catalog check |

### Verification commands (to be finalized after approval)

- Focused frontend tests for the shared avatar, profile/chat controls, folder controls, and voice call surfaces.
- Focused backend tests for symbol/color validation, persistence, authorization, and API round trips.
- `npm run check:i18n` and `npm test -- --run src/design-system/tokens.test.ts` after UI copy or token changes.
- Required frontend and backend checks from `CONTRIBUTING.md` as justified by changed files.

## Risks and migration notes

- New nullable mode/symbol/color fields and response fields must keep old clients and existing installations working.
- The existing `channel` type has no announcement subtype, so the `Megaphone` default applies to every channel.
- Switching avatar modes retains the photo reference; media deletion is outside this feature.
- Custom symbol IDs and colors must be allowlisted/validated at API boundaries; never accept SVG source from clients.

## Scope and approval

This document is a proposed spec/test plan for one combined review. No feature behavior should change until the human approves this exact document. Publication of an implementation PR is covered by the repository's standing delivery authorization; merge and deployment are not.
