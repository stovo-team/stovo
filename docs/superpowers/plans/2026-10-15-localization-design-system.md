# Localization and Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete English/Russian UI localization, normalize frontend design values through shared tokens, fix the reported mobile and Android/passkey defects, and document the reuse rules.

**Architecture:** Keep English and Russian copy in the existing typed dictionaries and guard both dictionary shape and source UI literals. The imported CSS token file owns typography, semantic colors, radii, and the deduplicated CSS palette. Static color data required by canvas/QR/persistence paths lives in `design-system/palette.ts` and is checked for parity against CSS tokens. Fix mobile layout, QR presentation, Android WebView origin handling, and passkey error reporting in isolated changes with focused tests.

**Tech Stack:** React 19, TypeScript, React Router 7, Vitest, Node built-in test runner, TypeScript compiler API, CSS custom properties, Capacitor 8.

**Spec:** `docs/superpowers/specs/2026-10-15-localization-and-design-tokens.md`

## Global Constraints

- “Translate all app-owned user-visible interface copy into Russian and English. Keep protocol labels, user-generated content, file names, URLs, and third-party rendered content as-is.”
- “Keep the backend's APP_URL, secure-origin, credential-origin, and RP ID checks unchanged unless a test proves a specific validation defect.”
- Keep the primary checkout and its unrelated `frontend/call-ui-preview.tsx` change untouched.
- All commits stay on `feature/localization-style-system`; do not push, open a PR, or merge.
- Translation commits must precede typography commits. Keep each separately reviewable fix in its own commit.

## Review Focus

- Raw user-facing literals in status, error, toast, accessible-label, and demo-preview paths must be caught by the localization audit; tested in Tasks 1 and 4.
- Missing or extra nested English/Russian dictionary keys and function-valued interpolation entries must fail parity checks; tested in Task 2.
- Narrow notification controls must remain below helper copy and within the viewport; tested in Task 7.
- Android WebView routes must use a secure same-origin scheme, and the backend must allow the same native origin; tested in Task 9.
- Unsupported, canceled, server-rejected, and unknown WebAuthn outcomes must not be mislabeled as HTTPS failures; tested in Task 10.

---

## File Structure

- `frontend/src/config/strings/english.ts`, `russian.ts`: feature-scoped translated catalogs and source shape.
- `frontend/src/config/strings/strings.test.ts`: full recursive catalog shape parity.
- `scripts/check-ui-localization.cjs`, `scripts/check-ui-localization.test.cjs`: source scanner and its unit tests; scanner reports file and line for raw UI copy candidates.
- `frontend/src/design-system/tokens.css`: single source for font families/scales, weights, line heights, semantic colors, and radius scale.
- `frontend/src/design-system/palette.ts`: static color data needed by canvas, QR, and user color controls; contract-tested against the CSS palette.
- `frontend/src/main.tsx`: loads the token stylesheet with the global frontend styles.
- `frontend/src/styles.css`, `frontend/src/pages/AdminServerSettingsPage.css`, `frontend/src/pages/MultiAdminPage.css`, `frontend/src/features/chats/calling/floatingCallPanel.css`: migrate authored declarations to semantic tokens.
- `frontend/src/design-system/tokens.test.ts`: enforce typography, radius, semantic color role, and inline style contracts.
- `frontend/src/styles.css`: responsive notification menu and QR surface styling.
- `frontend/capacitor.config.ts` and backend native-origin configuration: align Android WebView and backend allowed origins on HTTPS.
- Existing component tests plus focused new localization/QR/passkey tests cover the reported UI behavior.
- `docs/engineering/frontend-ui-conventions.md` (new) and `AGENTS.md`: contributor rules for strings, components, tokens, and checks.

## Tasks

### Task 1: Add translation audit tooling

**Files:**
- Create: `scripts/check-ui-localization.cjs`
- Create: `scripts/check-ui-localization.test.cjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces `collectUiStringViolations(sourceRoot: string): UiStringViolation[]`, where each result has `file`, `line`, `kind`, and `value`.
- CLI mode `--check` exits nonzero when unapproved JSX text, UI attributes, or known UI-message calls contain raw copy. The candidate classes and any exceptions are explicit in the script.

- [x] **Step 1: Write failing scanner tests** for JSX text, `aria-label`/`title`/`placeholder`, known toast/error setter calls, interpolated templates, and technical identifiers that must be ignored.
- [x] **Step 2: Run `node --test scripts/check-ui-localization.test.cjs`** and confirm it fails because the scanner module/export is missing.
- [x] **Step 3: Implement the AST scanner** using the installed TypeScript compiler API; report stable relative paths and one-based lines.
- [x] **Step 4: Run `node --test scripts/check-ui-localization.test.cjs`** and confirm all fixture cases pass.
- [x] **Step 5: Add `npm run check:i18n`** in `frontend/package.json`, pointing to the scanner in `--check` mode. Keep corpus checking for Task 4, after literal migrations.
- [x] **Step 6: Commit** as `[Test] add UI localization audit`.

### Task 2: Enforce catalog parity and localize auth, profile, and space navigation

**Files:**
- Modify: `frontend/src/config/strings/english.ts`
- Modify: `frontend/src/config/strings/russian.ts`
- Modify: `frontend/src/config/strings/strings.test.ts`
- Modify: `frontend/src/pages/LoginPage.tsx`, `frontend/src/pages/SetupPage.tsx`, `frontend/src/pages/InvitePage.tsx`, `frontend/src/pages/settings/ProfileSettingsTab.tsx`
- Modify: `frontend/src/features/chats/sidebar/ChatSidebar.tsx`
- Modify: `frontend/src/pages/LoginPage.auth-methods.test.tsx`, `frontend/src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`, and the relevant ChatSidebar test

**Interfaces:**
- English dictionary remains the inferred `AppStrings` source; Russian dictionary must have the same recursive key and value-kind shape.
- UI copy is consumed through the existing `strings` prop or `useStrings()`; date rendering uses the resolved language.

- [x] **Step 1: Add a recursive catalog-shape test** that compares objects recursively, treats functions as interpolation entries, and reports the first missing/extra path. Add a fixture test proving a nested missing key fails.
- [x] **Step 2: Run `cd frontend && npm test -- src/config/strings/strings.test.ts`** and confirm the new fixture fails against the not-yet-defined comparator.
- [x] **Step 3: Implement the recursive comparator and test both production catalogs.**
- [x] **Step 4: Add failing Russian-render tests** for login/setup/invite, passkey and Android QR profile labels, and absence of the active “Current space” subtitle.
- [x] **Step 5: Run the focused component tests** and confirm they fail on current hard-coded copy/active subtitle.
- [x] **Step 6: Add auth/profile translation keys, replace direct UI copy, remove `spaceSwitcher.currentSpace` from both catalogs and the active row, and format the QR expiry with the selected locale.**
- [x] **Step 7: Run the catalog, auth-method, profile-auth-method, and ChatSidebar focused tests** and confirm they pass.
- [x] **Step 8: Commit** as `[Fix] localize auth and profile screens`.

### Task 3: Localize chat, storage, composer, and attachment flows

**Files:**
- Modify catalogs: `frontend/src/config/strings/english.ts`, `russian.ts`
- Modify: `frontend/src/features/chats/details/ChatDetailsPanel.tsx`, `sidebar/ChatContextMenu.tsx`, `sidebar/ChatFolderDialog.tsx`, `sidebar/ChatList.tsx`, `sidebar/ChatListItem.tsx`, `sidebar/NewChatDialog.tsx`, `sidebar/DefaultChatSectionDialog.tsx`, `QuickAccessPanel.tsx`, `ChatOverlays.tsx`
- Modify: `frontend/src/features/chats/composer/*.tsx`, `conversation/*.tsx`, `transfer/ChatTransferDialog.tsx`
- Modify: `frontend/src/components/StorageCollections.tsx`, `StorageChecklists.tsx`, `StorageCanvases.tsx`, `AttachmentPickerSheet.tsx`, `components/attachment-picker/*.tsx`, `FormattingToolbar.tsx`, `ChatStatsDrawer.tsx`, and their tests

**Interfaces:**
- Add feature-grouped entries under the existing `chats`, `storage`, and `attachments` dictionary sections (or add those sections symmetrically if absent).
- Existing callbacks, route values, message data, file names, and protocol values stay unchanged; only displayed labels/messages move to dictionaries.

- [x] **Step 1: Add a focused localization test** for shared-content tabs, member-add action, chat mute/favorite actions, and attachment-picker categories in Russian.
- [x] **Step 2: Run that test and confirm it fails** on embedded English labels.
- [x] **Step 3: Add matching English/Russian entries and replace all app-owned strings in the listed chat, storage, composer, conversation, and attachment components.**
- [x] **Step 4: Run focused component tests and the catalog parity test**; confirm all changed UI displays catalog values and behavior/callbacks are unchanged.
- [x] **Step 5: Commit** as `[Fix] localize chat and storage flows`.

### Task 4: Localize calls, meetings, admin, previews, and remaining UI

**Files:**
- Modify catalogs: `frontend/src/config/strings/english.ts`, `russian.ts`
- Modify remaining files named in the spec's “Production TSX literal inventory”, including `frontend/src/features/chats/calling/*.tsx`, `frontend/src/pages/GuestMeeting*.tsx`, `frontend/src/pages/Admin*.tsx`, `frontend/src/pages/FilesPage.tsx`, `MembersPage.tsx`, `MultiAdminPage.tsx`, `PlansPage.tsx`, `CanvasPage.tsx`, `ChecklistPage.tsx`, the remaining settings/auth pages, and `frontend/src/components/*.tsx`.
- Modify: `frontend/src/config/strings/strings.test.ts`

**Interfaces:**
- Existing per-component copy uses the resolved `AppStrings`; short, dynamic values use interpolation functions or standard locale formatting.
- Product demos/previews are translated because they render app-authored copy; only product names, user/data content, file names, and technical tokens remain literals.

- [x] **Step 1: Add failing locale tests** for call controls/transcript, guest meeting, storage/admin notices, and a demo preview.
- [x] **Step 2: Run the focused tests and confirm they fail** on literal English text.
- [x] **Step 3: Migrate every remaining classified user-facing candidate from the spec inventory**, including accessibility labels, empty states, status/error/toast copy, and dynamic plurals.
- [x] **Step 4: Run `cd frontend && npm run check:i18n`** and confirm there are no unapproved UI text literals; classify every ignored candidate in the scanner comments.
- [x] **Step 5: Run the full frontend test suite** and verify the recursive catalog shape test passes.
- [x] **Step 6: Commit** as `[Fix] complete English and Russian UI localization`.

### Task 5: Centralize and normalize typography

**Files:**
- Create: `frontend/src/design-system/tokens.css`
- Modify: `frontend/src/main.tsx`
- Modify: all four production CSS files listed in File Structure
- Create: `frontend/src/styles.design-tokens.test.ts`

**Interfaces:**
- Export CSS custom properties for `--font-family-ui`, `--font-family-mono`, semantic sizes (`--font-size-caption`, `--font-size-small`, `--font-size-body`, `--font-size-body-large`, `--font-size-heading-small`, `--font-size-heading`, `--font-size-display`), named weights/line heights, and approved responsive sizes.
- All UI CSS references these values. Only named/tested exceptions for intrinsically data-driven visuals may retain a direct expression.

- [x] **Step 1: Add a failing CSS contract test** that inventories production `font-size` values, validates the approved token vocabulary, and explicitly checks the reported `.chat-info-tab` and `.chat-info-member-invite` rules use the intended control/body tokens.
- [x] **Step 2: Run `cd frontend && npm test -- src/styles.design-tokens.test.ts`** and confirm literal font sizes fail the contract.
- [x] **Step 3: Define the typography scale in `design-system/tokens.css`** and import it from `main.tsx` before UI rendering.
- [x] **Step 4: Replace raw `font-size` declarations across all production CSS and inline presentation styles** with semantic tokens or named responsive tokens; record intrinsic exceptions beside the test allowlist.
- [x] **Step 5: Run the design-token test and relevant visual contract tests**; confirm no unapproved font-size literal remains.
- [x] **Step 6: Commit** as `[Fix] normalize frontend typography tokens`.

### Task 6: Centralize semantic colors and corner radii

**Files:**
- Modify: `frontend/src/design-system/tokens.css`
- Modify: all four production CSS files and style-bearing components where semantic UI colors/radii are inline
- Modify: `frontend/src/design-system/tokens.test.ts`

**Interfaces:**
- Define named semantic color roles for text, backgrounds/surfaces, borders, accent/focus, danger/success/warning, and named radius steps including control, card, panel, pill, and circle.
- Components consume semantic roles; specialized product illustrations use named component tokens or the explicit non-UI exception list.

- [x] **Step 1: Extend the CSS contract test** for radius tokens and semantic theme role wiring; classify repeated shared color roles before migration.
- [x] **Step 2: Run the focused test and confirm the required role/token assertions.**
- [x] **Step 3: Add the semantic color and radius values once** in `design-system/tokens.css` and map existing theme variables to these roles.
- [x] **Step 4: Migrate authored radii and all static production CSS/inline colors** to semantic/palette tokens; move colors that must remain literal data into `design-system/palette.ts`.
- [x] **Step 5: Run the token test and full frontend suite**; confirm typography/radius contracts, no raw style colors, and CSS/TypeScript palette parity.
- [x] **Step 6: Commit** as `[Fix] centralize frontend color and radius tokens`.

### Task 7: Move notification mute selector below copy on mobile

**Files:**
- Modify: `frontend/src/styles.css`
- Modify or create: `frontend/src/pages/ChatsPage.chat-details.test.ts`

**Interfaces:**
- Desktop layout stays horizontal. At widths `<= 960px`, the helper text remains visible, the selector occupies its own row after the text, and the options menu is constrained to the viewport.

- [x] **Step 1: Add a failing responsive CSS contract test** that checks the mobile row order, visible helper text, and menu width constraint.
- [x] **Step 2: Run the focused `ChatsPage.chat-details` test** and confirm current CSS fails.
- [x] **Step 3: Adjust the narrow-screen grid/order and menu placement** using the design tokens without changing notification actions.
- [x] **Step 4: Run the focused test and existing style tests**; confirm desktop rules remain intact.
- [x] **Step 5: Commit** as `[Fix] align mobile notification selector`.

### Task 8: Round Android sign-in QR surface

**Files:**
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`

**Interfaces:**
- Render the QR image in the existing `.android-qr-code` surface using the shared panel radius token. Keep the encoded image, intrinsic size, and QR quiet zone unchanged.

- [x] **Step 1: Add a failing component assertion** that a generated QR is inside `.android-qr-code` and a CSS contract assertion that the wrapper uses the panel-radius token.
- [x] **Step 2: Run the profile auth-method test** and confirm it fails because no wrapper exists.
- [x] **Step 3: Add the wrapper and tokenized spacing/radius.**
- [x] **Step 4: Run the focused test and confirm the generated QR source/data is unchanged.**
- [x] **Step 5: Commit** as `[Fix] round Android sign-in QR surface`.

### Task 9: Align Android WebView and backend origins

**Files:**
- Modify: `frontend/capacitor.config.ts`
- Modify backend native-origin defaults and deployment CORS configuration.
- Add static frontend and backend native-origin regression tests.

**Interfaces:**
- Capacitor Android uses the HTTPS local origin so browser history writes remain same-origin.
- The backend native-origin allowlist includes the Android HTTPS origin and retains the legacy Capacitor origin.

- [x] **Step 1: Add a regression test** proving the Android Capacitor scheme is HTTPS and backend defaults allow the matching origin.
- [x] **Step 2: Align the Capacitor scheme and backend/CORS origin allowlists.**
- [x] **Step 3: Run the focused frontend test; run backend test and Android build if toolchains are available.**
- [x] **Step 4: Commit** as `[Fix] use secure Android WebView origin` and `[Fix] align secure Android WebView origins`.

### Task 10: Make passkey registration failures actionable

**Files:**
- Modify: `frontend/src/config/strings/english.ts`, `russian.ts`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.tsx`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`

**Interfaces:**
- Preserve backend `ApiError` detail; treat `NotAllowedError`/`AbortError` as user cancellation; map secure-context and known browser `SecurityError`/`NotSupportedError` cases to localized messages; unknown errors get a neutral retry message that does not claim HTTPS is the cause.
- Do not weaken any WebAuthn backend origin or RP validation.

- [x] **Step 1: Add failing tests** for successful registration, user cancellation, API `APP_URL`/RP rejection, unsupported browser, `SecurityError`, and an unknown exception.
- [x] **Step 2: Run the focused profile auth-method tests** and confirm the new expected messages fail against the current catch-all behavior.
- [x] **Step 3: Add localized error keys and map each error class** while leaving the registration protocol calls and backend validation unchanged.
- [x] **Step 4: Run profile auth-method and catalog tests.**
- [x] **Step 5: Commit** as `[Fix] clarify passkey registration failures`.

### Task 11: Document the reuse system and run final verification

**Files:**
- Create: `docs/engineering/frontend-ui-conventions.md`
- Modify: `AGENTS.md`
- Modify: `frontend/package.json` if verification scripts need final wiring

**Interfaces:**
- `AGENTS.md` points implementers to the canonical localization catalog, `frontend/src/design-system/tokens.css`, existing component reuse, and the commands that enforce them.
- `frontend-ui-conventions.md` defines token names, exception policy, and how to add translated strings/components without duplicating style values.

- [x] **Step 1: Write the frontend design-system guide** with examples referencing existing components and tokens, not new parallel components.
- [x] **Step 2: Update `AGENTS.md`** to require reuse of existing catalog entries/components/tokens and document `npm run check:i18n` plus the design-token test.
- [x] **Step 3: Run final checks from `CONTRIBUTING.md`:** `cd frontend && npm test`, `npm run check:i18n`, `npm run lint`, and `npm run build`; run Android Gradle build if available.
- [x] **Step 4: Run `git diff --check`, inspect every commit and worktree status, and confirm the primary checkout is unchanged.**
- [x] **Step 5: Commit** as `[Docs] document frontend localization and design tokens`.

## Final Commit Order

1. `[Docs] list candidate localization files`
2. `[Docs] plan localization and design token implementation`
3. `[Test] add UI localization audit`
2. `[Fix] localize auth and profile screens`
3. `[Fix] localize chat and storage flows`
4. `[Fix] complete English and Russian UI localization`
5. `[Fix] normalize frontend typography tokens`
6. `[Fix] centralize frontend color and radius tokens`
7. `[Fix] align mobile notification selector`
8. `[Fix] round Android sign-in QR surface`
9. `[Fix] use secure Android WebView origin`
10. `[Fix] clarify passkey registration failures`
11. `[Fix] align secure Android WebView origins`
12. `[Fix] load shared design tokens globally`
13. `[Docs] document frontend localization and design tokens`

## Self-Review

- Spec coverage: catalog parity and full literal migration are Tasks 1–4; typography, colors, and radii are Tasks 5–6; mobile selector and QR are Tasks 7–8; Android routing and passkeys are Tasks 9–10; contributor documentation and checks are Task 11.
- Implementation outcome: all app-owned untranslated UI candidates are removed by `npm run check:i18n`; typography and radius scales are centralized and contract-tested. Static CSS/inline presentation colors use the palette in `tokens.css`; static TypeScript values for canvas, QR, and color controls use `palette.ts` and are checked against the CSS palette. Existing theme and plugin palettes remain in their configuration modules.
- Android-origin backend regression test is present but could not be run because Go is not installed. Android build/device verification is unavailable because the Android SDK and `frontend/android/gradlew` are missing. `okf-agent` is also not installed; canonical Markdown docs were searched directly.
- Final verification: the full frontend suite passes (242 files, 1,657 tests); the focused token/mobile regression suite passes (20 tests); `npm run check:i18n`, `npm run lint`, `npm run build`, and `git diff --check` pass. Production build also caught and helped correct three malformed font-weight declarations from the color migration.
- Each failure mode in Review Focus is exercised by the named task tests.
- Capacitor uses its HTTPS local origin and backend allowlists include it; string keys remain in the existing English/Russian shape; token names are checked against production styles.
- Translation commits all precede typography/token commits, and each reported defect with a focused reproduction receives its own fix commit.
- The localization inventory contains demo-preview and attribute candidates; the scanner must classify and document exceptions instead of treating every technical/data string as copy.

### Follow-up task: Complete production color tokenization

- [x] Add a failing token contract for raw colors in all production CSS, static TSX styling, and implementation strings.
- [x] Move all authored production CSS colors to deduplicated `--color-palette-*` variables and preserve common semantic aliases.
- [x] Move static canvas, QR, editor, appearance, storage-cover, and demo colors to `design-system/palette.ts` and ensure each value exists in the CSS palette.
- [x] Enforce that future production colors use tokens/configuration, with explicit exceptions for user-selected color data, existing theme/plugin config, and the encoded SVG asset.
- [x] Run focused/full frontend verification and commit as `[Fix] centralize production color values` (`9588cc2`).
- [x] Update the reuse guide, agent instructions, spec, plan, and size baseline; commit documentation separately.
