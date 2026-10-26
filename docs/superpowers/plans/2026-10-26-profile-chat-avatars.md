# Profile, Chat, and Folder Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one reusable avatar renderer and saved symbol/color choices for people, chats, and folders, with consistent rendering across normal app and voice call views.

**Architecture:** Keep the existing photo file references and add an avatar mode, allowlisted symbol ID, and palette color ID for users and chats. Render all avatar states through one shared frontend component; persist folder choices in the existing folder local storage model. Reuse existing upload/crop flows, API update patterns, palette tokens, and Lucide icons.

**Tech Stack:** React, TypeScript, Vitest, Go, Ent, PostgreSQL migrations, Lucide React, existing English/Russian string catalogs.

**Spec:** `docs/superpowers/specs/2026-10-26-profile-chat-avatars-design.md`

## Global Constraints

- Keep initials as the default for people. Let a person choose a built-in symbol and color.
- New optional mode/symbol/color fields and response fields must keep old clients and existing installations working.
- Symbols come from an app-owned ID allowlist and render as safe built-in SVG components.
- Use curated colors from `frontend/src/design-system/palette.ts`, with palette entries represented in `tokens.css`; keep icon foreground contrast readable.
- Keep the photo file reference when the user switches to a symbol, so switching back restores the saved photo without another upload.
- Chat edits remain restricted to existing chat managers. A person can edit their own profile avatar. Folder edits follow the current local folder controls.
- English and Russian UI copy must use the existing string catalogs.
- Any avatar picker popup must reuse `PopupDialog`, `PopupBackdrop`, `PopupCloseButton`, `PopupButton`, `PopupField`, and `PopupSelect` where applicable; do not add popup-local overlay, surface, close, button, field, dropdown, radius, or blur styles.
- Deliver each task branch through a pull request of at most 445 added plus deleted lines. Keep each delivery focused and stack dependent PRs when a task exceeds that limit.

## Review Focus

- Missing or invalid stored icon/color IDs: test fallback to a valid default, never render client-supplied SVG or CSS values.
- Existing uploaded photos and older API payloads: test legacy photo mode defaults and switching to/from symbols while preserving the file reference.
- Partial profile/chat updates: test that changing mode or color does not reset unrelated settings or silently clear the photo.
- Voice participants and members: test response projections include the same avatar fields from chat lists, profile reads, member lists, and call participants.
- Reduced-size/mobile and dark-theme states: test readable icons, controls, focus states, and no layout overflow.

---

### Task 1: Persist avatar choices for people and chats

**Files:**
- Modify: `backend/ent/schema/user.go`, `backend/ent/schema/chat.go`
- Create: `backend/migrations/20261026120000_add_avatar_choices.sql`
- Modify: `backend/internal/transport/http/profile_update_handler.go`, `backend/internal/transport/http/chat_mutation_handler.go`
- Modify: `backend/internal/features/identity/registration.go`, `backend/internal/repository/auth.go`, `backend/internal/adapters/identityprofiles/store.go`, `backend/internal/adapters/identitylogin/store.go`
- Modify: `backend/internal/app/routes.go`, `backend/internal/app/auth.go`, `backend/internal/app/server.go`, `backend/internal/app/helpers.go`, `backend/internal/app/types.go`
- Modify: `backend/internal/repository/chats.go`, `backend/internal/adapters/chatsettings/delay_store.go`, `backend/internal/features/chats/settings.go`, `backend/internal/features/chats/queries.go`, `backend/internal/features/chats/archive.go`, `backend/internal/adapters/chatqueries/store.go`, `backend/internal/adapters/chatarchives/store.go`, `backend/internal/adapters/familyqueries/store.go`, `backend/internal/features/family/queries.go`, `backend/internal/transport/http/presenter/chat.go`, and the chat response assembler in `backend/internal/app/chat_operations.go`
- Regenerate: generated `backend/ent` files with `cd backend && go generate ./ent`
- Test: relevant backend transport, repository, identity, chat update, chat/member projection, and app response tests

**Interfaces:**
- Profile fields: `avatarMode` (`photo` or `symbol`), `avatarSymbolId`, and `avatarColorId`.
- Chat fields: `avatarMode`, `avatarSymbolId`, and `avatarColorId`; photo bytes continue to use `chatPhoto`.
- Symbol and color IDs use fixed allowlists shared with the frontend. Empty optional fields retain/default existing values; invalid non-empty IDs return 422.
- Store user defaults as `profile_avatar_mode`, `profile_avatar_symbol_id`, and `profile_avatar_color_id`; store chat defaults as `chat_avatar_mode`, `chat_avatar_symbol_id`, and `chat_avatar_color_id`.

- [ ] **Step 1: Add failing transport tests** for valid avatar patches, invalid mode/symbol/color IDs, and empty PATCH rejection in `profile_update_handler_test.go` and chat mutation handler tests.
- [ ] **Step 2: Run `cd backend && go test ./internal/transport/http`** and confirm failures identify missing avatar fields or validation.
- [ ] **Step 3: Add failing persistence and projection tests** for round-tripping profile/chat choices and keeping the existing photo reference through a mode change.
- [ ] **Step 4: Add schema and migration support** with nullable compatibility defaults; regenerate Ent code and implement allowlist validation at the HTTP/application boundary.
- [ ] **Step 5: Thread the fields through feature ports, repository updates, user/chat presenters, and all relevant response assemblers.** Preserve current permissions and transaction behavior.
- [ ] **Step 6: Run `cd backend && go test ./internal/transport/http ./internal/repository ./internal/features/identity ./internal/features/chats ./internal/app ./internal/adapters/chatqueries ./internal/adapters/identityprofiles`**; confirm all pass, including migration compatibility fixtures.
- [ ] **Step 7: Commit the backend contract task** with only the task's source, migration, generated code, and tests.

### Task 2: Build the shared avatar renderer and replace duplicate renderers

**Files:**
- Create: `frontend/src/components/EntityAvatar.tsx`, `frontend/src/components/entityAvatar.ts`, and focused tests
- Modify: `frontend/src/features/chats/sidebar/RealAvatar.tsx` and `frontend/src/pages/settings/SettingsAvatar.tsx` as adapters to the shared renderer
- Modify: `frontend/src/features/chats/shared/chatPresentation.ts`, `frontend/src/api/auth.ts`, `frontend/src/api/chats.ts`, `frontend/src/design-system/palette.ts`, `frontend/src/design-system/tokens.css`, and `frontend/src/design-system/tokens.test.ts`
- Modify all production profile/avatar renderers: `frontend/src/pages/AdminMembersPage.tsx`, `frontend/src/pages/MembersPage.tsx`, `frontend/src/components/StorageCollections.tsx`, `frontend/src/components/CallParticipantTile.tsx`, `frontend/src/components/CallParticipantGrid.tsx`, plus `RealAvatar` call sites in chat lists, details, plans, poll voters, quick access, quick switcher, and guest meeting views
- Test: `EntityAvatar.test.tsx`, avatar mapping tests, and affected call/member view tests

**Interfaces:**
- `EntityAvatar` props: `accessToken`, `className`, `entityId`, `entityKind` (`person`, `family`, `group`, `archive`, `voice`, `channel`, `folder`), `file`, `label`, `mode`, `symbolId`, `colorId`, optional `size`, and optional style. A direct chat passes the other member's person identity and avatar fields.
- `entityAvatar.ts` exports stable IDs, `defaultAvatarSymbol(kind)`, `colorForAvatarId(id)`, and `isKnownAvatarSymbolId` / `isKnownAvatarColorId`.
- Default symbols: person `initials`, group `Users`, family `Home`, archive `Archive`, voice `AudioLines`, channel `Megaphone`, folder `Folder`.
- Deterministic colors hash entity ID into the curated palette. Selected symbol/color/mode render identically at each size.

- [ ] **Step 1: Add failing unit/component tests** for deterministic colors, all entity default symbols, invalid ID fallback, photo/symbol/initials modes, and consistent rendering at small and large sizes.
- [ ] **Step 2: Run `cd frontend && npm test -- --run src/components/entityAvatar.test.ts src/components/EntityAvatar.test.tsx`** and confirm the new shared contract is missing.
- [ ] **Step 3: Implement the allowlisted icon/color registry and `EntityAvatar`** using existing file preview handling, shared design tokens, and the approved fallback behavior.
- [ ] **Step 4: Replace duplicate avatar output in production views** so profile, chat, member, plan, poll, storage-access, guest, and voice-call contexts read the same model fields and render through `EntityAvatar`.
- [ ] **Step 5: Run `cd frontend && npm test -- --run src/components/entityAvatar.test.ts src/components/EntityAvatar.test.tsx src/components/CallParticipantGrid.test.tsx src/pages/AdminMembersPage.test.tsx`**; confirm shared rendering passes on converted call/member/chat surfaces.
- [ ] **Step 6: Run `cd frontend && npm test -- --run src/design-system/tokens.test.ts`** to verify each persisted avatar color has its matching design token.
- [ ] **Step 7: Commit the shared rendering task** without picker controls or folder editing.

### Task 3: Add profile, chat, and folder avatar editing

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`, `frontend/src/components/AvatarEditorModal.tsx` or a sibling picker component, and `frontend/src/api/auth.ts`
- Modify: `frontend/src/features/chats/details/ChatDetailsPanel.tsx`, `frontend/src/features/chats/details/useChatDetailsActions.ts`, `frontend/src/api/chats.ts`
- Modify: `frontend/src/features/chats/sidebar/chatFolders.ts`, `frontend/src/features/chats/sidebar/ChatFolderDialog.tsx`, `frontend/src/features/chats/sidebar/ChatList.tsx`
- Modify: `frontend/src/config/strings/english.ts`, `frontend/src/config/strings/russian.ts`, and relevant shared styles using existing design tokens
- Modify/create focused settings, chat details, folder dialog, API, and style tests
- Capture required visual evidence for avatar editor states

**Interfaces:**
- Use one avatar picker with a photo/symbol mode switch, built-in symbol grid, palette color controls, preview, and save/cancel actions.
- Profile saves use existing `PATCH /api/auth/me` and update current user/member state from the returned user projection.
- Chat saves use existing `PATCH /api/chats/{chatId}` and `updateChat`; retain `chatPhoto` while changing `avatarMode`.
- `ChatFolder` adds optional `symbolId` and `colorId`; old local-storage entries receive the default Folder symbol/color on read.

- [ ] **Step 1: Add failing tests** for profile symbol/color save and reload, chat permission-gated save and reload, photo/symbol switching with the photo reference retained, and folder create/edit persistence after reload.
- [ ] **Step 2: Run `cd frontend && npm test -- --run src/pages/SettingsPage.avatar.test.tsx src/features/chats/details/ChatDetailsPanel.avatar.test.tsx src/features/chats/sidebar/ChatFolderDialog.avatar.test.tsx`** and confirm failures show missing picker fields and save behavior.
- [ ] **Step 3: Implement the shared picker and profile save flow** using existing photo crop/upload controls and the new profile fields.
- [ ] **Step 4: Implement chat edit controls** for authorized chat managers and apply the returned chat projection to current views.
- [ ] **Step 5: Add folder symbol/color controls** to the current create/edit dialog and persist through the existing local-storage functions.
- [ ] **Step 6: Add English and Russian strings and token-based styles.** Run `npm run check:i18n` and `npm test -- --run src/design-system/tokens.test.ts` from `frontend`.
- [ ] **Step 7: Run `cd frontend && npm test -- --run src/pages/SettingsPage.avatar.test.tsx src/features/chats/details/ChatDetailsPanel.avatar.test.tsx src/features/chats/sidebar/ChatFolderDialog.avatar.test.tsx`**; confirm profile/chat/folder editing, API payloads, permissions, keyboard access, and photo mode changes pass.
- [ ] **Step 8: Capture before/after screenshots** for a profile picker and a voice channel avatar at a named viewport, theme, locale, and interaction; include them in the relevant PR description.
- [ ] **Step 9: Commit the editing-controls task** with only controls, strings, styles, and tests.

### Task 4: Whole-feature verification and delivery

**Files:**
- Review all paths changed by Tasks 1–3; update `docs/superpowers/specs/2026-10-26-profile-chat-avatars-design.md` only for accepted implementation clarifications
- Create delivery packet/evidence under the repository's required workflow location

- [ ] **Step 1: Run `cd backend && go test ./... && make lint` and `cd frontend && npm test && npm run lint && npm run build`** after focused checks have passed.
- [ ] **Step 2: Verify API compatibility, permissions, migration, and saved choices** with the available isolated tests/database fixture.
- [ ] **Step 3: Inspect visual evidence** at the recorded viewports, theme, locale, and interaction; ensure screenshots show the final source revision.
- [ ] **Step 4: Review the diff against the spec** and check the aggregate and per-PR changed-line totals against the 445-line cap; split coherent dependent PRs if needed.
- [ ] **Step 5: Prepare the delivery packet and English PR description**, push task branches, open/update each PR, and inspect every CI cell on each current head until settled, ignoring only CodeQL.
- [ ] **Step 6: Report acceptance coverage, exact commands/results, screenshot links, PR URLs/status, and any blocked checks.**
