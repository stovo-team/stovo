# Localization and Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete English/Russian UI localization, normalize frontend design values through shared tokens, fix the reported mobile and Android/passkey defects, and document the reuse rules.

**Architecture:** Keep English and Russian copy in the existing typed dictionaries and guard both dictionary shape and source UI literals. Add one imported CSS token file as the source for typography, semantic colors, and radii, then migrate the four production stylesheets. Fix mobile layout, QR presentation, native routing, and passkey error reporting in isolated changes with focused tests.

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
- Capacitor route changes must not write an origin-mismatched URL, and web history must remain path-based; tested in Task 9.
- Unsupported, canceled, server-rejected, and unknown WebAuthn outcomes must not be mislabeled as HTTPS failures; tested in Task 10.

---

## File Structure

- `frontend/src/config/strings/english.ts`, `russian.ts`: feature-scoped translated catalogs and source shape.
- `frontend/src/config/strings/strings.test.ts`: full recursive catalog shape parity.
- `scripts/check-ui-localization.cjs`, `scripts/check-ui-localization.test.cjs`: source scanner and its unit tests; scanner reports file and line for raw UI copy candidates.
- `frontend/src/design-system/tokens.css`: single source for font families/scales, weights, line heights, semantic colors, and radius scale.
- `frontend/src/main.tsx`: loads the token stylesheet with the global frontend styles.
- `frontend/src/styles.css`, `frontend/src/pages/AdminServerSettingsPage.css`, `frontend/src/pages/MultiAdminPage.css`, `frontend/src/features/chats/calling/floatingCallPanel.css`: migrate authored declarations to semantic tokens.
- `frontend/src/styles.design-tokens.test.ts`, `frontend/src/styles.chat-details.test.ts`: enforce token use and responsive contracts.
- `frontend/src/PlatformRouter.tsx` (new) and `frontend/src/App.tsx`: select hash routing on native and browser-history routing on web.
- `frontend/src/PlatformRouter.test.tsx` (new): route behavior on native and web.
- Existing component tests plus focused new localization/QR/passkey tests cover the reported UI behavior.
- `docs/engineering/frontend-design-system.md` (new) and `AGENTS.md`: contributor rules for strings, components, tokens, and checks.

## Tasks

### Task 1: Add translation audit tooling

**Files:**
- Create: `scripts/check-ui-localization.cjs`
- Create: `scripts/check-ui-localization.test.cjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Produces `collectUiStringViolations(sourceRoot: string): UiStringViolation[]`, where each result has `file`, `line`, `kind`, and `value`.
- CLI mode `--check` exits nonzero when unapproved JSX text, UI attributes, or known UI-message calls contain raw copy. The candidate classes and any exceptions are explicit in the script.

- [ ] **Step 1: Write failing scanner tests** for JSX text, `aria-label`/`title`/`placeholder`, known toast/error setter calls, interpolated templates, and technical identifiers that must be ignored.
- [ ] **Step 2: Run `node --test scripts/check-ui-localization.test.cjs`** and confirm it fails because the scanner module/export is missing.
- [ ] **Step 3: Implement the AST scanner** using the installed TypeScript compiler API; report stable relative paths and one-based lines.
- [ ] **Step 4: Run `node --test scripts/check-ui-localization.test.cjs`** and confirm all fixture cases pass.
- [ ] **Step 5: Add `npm run check:i18n`** in `frontend/package.json`, pointing to the scanner in `--check` mode. Keep corpus checking for Task 4, after literal migrations.
- [ ] **Step 6: Commit** as `[Test] add UI localization audit`.

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

- [ ] **Step 1: Add a recursive catalog-shape test** that compares objects recursively, treats functions as interpolation entries, and reports the first missing/extra path. Add a fixture test proving a nested missing key fails.
- [ ] **Step 2: Run `cd frontend && npm test -- src/config/strings/strings.test.ts`** and confirm the new fixture fails against the not-yet-defined comparator.
- [ ] **Step 3: Implement the recursive comparator and test both production catalogs.**
- [ ] **Step 4: Add failing Russian-render tests** for login/setup/invite, passkey and Android QR profile labels, and absence of the active “Current space” subtitle.
- [ ] **Step 5: Run the focused component tests** and confirm they fail on current hard-coded copy/active subtitle.
- [ ] **Step 6: Add auth/profile translation keys, replace direct UI copy, remove `spaceSwitcher.currentSpace` from both catalogs and the active row, and format the QR expiry with the selected locale.**
- [ ] **Step 7: Run the catalog, auth-method, profile-auth-method, and ChatSidebar focused tests** and confirm they pass.
- [ ] **Step 8: Commit** as `[Fix] localize auth and profile screens`.

### Task 3: Localize chat, storage, composer, and attachment flows

**Files:**
- Modify catalogs: `frontend/src/config/strings/english.ts`, `russian.ts`
- Modify: `frontend/src/features/chats/details/ChatDetailsPanel.tsx`, `sidebar/ChatContextMenu.tsx`, `sidebar/ChatFolderDialog.tsx`, `sidebar/ChatList.tsx`, `sidebar/ChatListItem.tsx`, `sidebar/NewChatDialog.tsx`, `sidebar/DefaultChatSectionDialog.tsx`, `QuickAccessPanel.tsx`, `ChatOverlays.tsx`
- Modify: `frontend/src/features/chats/composer/*.tsx`, `conversation/*.tsx`, `transfer/ChatTransferDialog.tsx`
- Modify: `frontend/src/components/StorageCollections.tsx`, `StorageChecklists.tsx`, `StorageCanvases.tsx`, `AttachmentPickerSheet.tsx`, `components/attachment-picker/*.tsx`, `FormattingToolbar.tsx`, `ChatStatsDrawer.tsx`, and their tests

**Interfaces:**
- Add feature-grouped entries under the existing `chats`, `storage`, and `attachments` dictionary sections (or add those sections symmetrically if absent).
- Existing callbacks, route values, message data, file names, and protocol values stay unchanged; only displayed labels/messages move to dictionaries.

- [ ] **Step 1: Add a focused localization test** for shared-content tabs, member-add action, chat mute/favorite actions, and attachment-picker categories in Russian.
- [ ] **Step 2: Run that test and confirm it fails** on embedded English labels.
- [ ] **Step 3: Add matching English/Russian entries and replace all app-owned strings in the listed chat, storage, composer, conversation, and attachment components.**
- [ ] **Step 4: Run focused component tests and the catalog parity test**; confirm all changed UI displays catalog values and behavior/callbacks are unchanged.
- [ ] **Step 5: Commit** as `[Fix] localize chat and storage flows`.

### Task 4: Localize calls, meetings, admin, previews, and remaining UI

**Files:**
- Modify catalogs: `frontend/src/config/strings/english.ts`, `russian.ts`
- Modify remaining files named in the spec's “Production TSX literal inventory”, including `frontend/src/features/chats/calling/*.tsx`, `frontend/src/pages/GuestMeeting*.tsx`, `frontend/src/pages/Admin*.tsx`, `frontend/src/pages/FilesPage.tsx`, `MembersPage.tsx`, `MultiAdminPage.tsx`, `PlansPage.tsx`, `CanvasPage.tsx`, `ChecklistPage.tsx`, the remaining settings/auth pages, and `frontend/src/components/*.tsx`.
- Modify: `frontend/src/config/strings/strings.test.ts`

**Interfaces:**
- Existing per-component copy uses the resolved `AppStrings`; short, dynamic values use interpolation functions or standard locale formatting.
- Product demos/previews are translated because they render app-authored copy; only product names, user/data content, file names, and technical tokens remain literals.

- [ ] **Step 1: Add failing locale tests** for call controls/transcript, guest meeting, storage/admin notices, and a demo preview.
- [ ] **Step 2: Run the focused tests and confirm they fail** on literal English text.
- [ ] **Step 3: Migrate every remaining classified user-facing candidate from the spec inventory**, including accessibility labels, empty states, status/error/toast copy, and dynamic plurals.
- [ ] **Step 4: Run `cd frontend && npm run check:i18n`** and confirm there are no unapproved UI text literals; classify every ignored candidate in the scanner comments.
- [ ] **Step 5: Run the full frontend test suite** and verify the recursive catalog shape test passes.
- [ ] **Step 6: Commit** as `[Fix] complete English and Russian UI localization`.

### Task 5: Centralize and normalize typography

**Files:**
- Create: `frontend/src/design-system/tokens.css`
- Modify: `frontend/src/main.tsx`
- Modify: all four production CSS files listed in File Structure
- Create: `frontend/src/styles.design-tokens.test.ts`

**Interfaces:**
- Export CSS custom properties for `--font-family-ui`, `--font-family-mono`, semantic sizes (`--font-size-caption`, `--font-size-small`, `--font-size-body`, `--font-size-body-large`, `--font-size-heading-small`, `--font-size-heading`, `--font-size-display`), named weights/line heights, and approved responsive sizes.
- All UI CSS references these values. Only named/tested exceptions for intrinsically data-driven visuals may retain a direct expression.

- [ ] **Step 1: Add a failing CSS contract test** that inventories production `font-size` values, validates the approved token vocabulary, and explicitly checks the reported `.chat-info-tab` and `.chat-info-member-invite` rules use the intended control/body tokens.
- [ ] **Step 2: Run `cd frontend && npm test -- src/styles.design-tokens.test.ts`** and confirm literal font sizes fail the contract.
- [ ] **Step 3: Define the typography scale in `design-system/tokens.css`** and import it from `main.tsx` before UI rendering.
- [ ] **Step 4: Replace raw `font-size` declarations across all production CSS and inline presentation styles** with semantic tokens or named responsive tokens; record intrinsic exceptions beside the test allowlist.
- [ ] **Step 5: Run the design-token test and relevant visual contract tests**; confirm no unapproved font-size literal remains.
- [ ] **Step 6: Commit** as `[Fix] normalize frontend typography tokens`.

### Task 6: Centralize semantic colors and corner radii

**Files:**
- Modify: `frontend/src/design-system/tokens.css`
- Modify: all four production CSS files and style-bearing components where semantic UI colors/radii are inline
- Modify: `frontend/src/styles.design-tokens.test.ts`

**Interfaces:**
- Define named semantic color roles for text, backgrounds/surfaces, borders, accent/focus, danger/success/warning, and named radius steps including control, card, panel, pill, and circle.
- Components consume semantic roles; specialized product illustrations use named component tokens or the explicit non-UI exception list.

- [ ] **Step 1: Extend the failing CSS contract test** to identify raw color/radius declarations outside the token source and explicit visual-data exceptions.
- [ ] **Step 2: Run the focused test and confirm current literal declarations fail.**
- [ ] **Step 3: Add the semantic color and radius values once** in `design-system/tokens.css` and map existing theme variables to these roles.
- [ ] **Step 4: Migrate repeated authored colors and radii in all production stylesheets** to semantic tokens; keep intrinsic chart/media/demo colors only under named documented tokens.
- [ ] **Step 5: Run the token test and full frontend suite**; confirm both light and dark aliases resolve and no unapproved repeated value remains.
- [ ] **Step 6: Commit** as `[Fix] centralize frontend color and radius tokens`.

### Task 7: Move notification mute selector below copy on mobile

**Files:**
- Modify: `frontend/src/styles.css`
- Modify or create: `frontend/src/styles.chat-details.test.ts`

**Interfaces:**
- Desktop layout stays horizontal. At widths `<= 960px`, the helper text remains visible, the selector occupies its own row after the text, and the options menu is constrained to the viewport.

- [ ] **Step 1: Add a failing responsive CSS contract test** that checks the mobile row order, visible helper text, and menu width constraint.
- [ ] **Step 2: Run `cd frontend && npm test -- src/styles.chat-details.test.ts`** and confirm current CSS fails.
- [ ] **Step 3: Adjust the narrow-screen grid/order and menu placement** using the design tokens without changing notification actions.
- [ ] **Step 4: Run the focused test and existing style tests**; confirm desktop rules remain intact.
- [ ] **Step 5: Commit** as `[Fix] align mobile notification selector`.

### Task 8: Round Android sign-in QR surface

**Files:**
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.tsx`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`

**Interfaces:**
- Render the QR image inside a named `.android-sign-in-qr` surface using the shared card radius token. Keep the encoded image, intrinsic size, and QR quiet zone unchanged.

- [ ] **Step 1: Add a failing component assertion** that a generated QR is inside `.android-sign-in-qr` and a CSS contract assertion that the wrapper uses the card-radius token.
- [ ] **Step 2: Run the profile auth-method test** and confirm it fails because no wrapper exists.
- [ ] **Step 3: Add the wrapper and tokenized spacing/radius.**
- [ ] **Step 4: Run the focused test and confirm the generated QR source/data is unchanged.**
- [ ] **Step 5: Commit** as `[Fix] round Android sign-in QR surface`.

### Task 9: Route Capacitor app links without Browser History origin errors

**Files:**
- Create: `frontend/src/PlatformRouter.tsx`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/PlatformRouter.test.tsx`

**Interfaces:**
- `PlatformRouter({ children }: { children: ReactNode })` uses `HashRouter` when `Capacitor.isNativePlatform()` is true and `BrowserRouter` on web.
- Keep every existing route and `NativeAppLinkRouter` call to `navigate()` unchanged.

- [ ] **Step 1: Add a failing native routing test** that navigates to `/server-setup?server=...` and asserts `location.hash` changes without changing the custom-scheme origin or throwing. Add a web test that asserts pathname/history behavior.
- [ ] **Step 2: Run `cd frontend && npm test -- src/PlatformRouter.test.tsx`** and confirm native navigation throws/fails under the current BrowserRouter path.
- [ ] **Step 3: Extract platform router selection and use it at the root of `App`.**
- [ ] **Step 4: Run native/web router tests and existing route-motion/link tests.**
- [ ] **Step 5: Run `cd frontend/android && ./gradlew assembleDebug`** if the Android SDK is installed; record an explicit limitation if it is unavailable.
- [ ] **Step 6: Commit** as `[Fix] use hash routing in Capacitor`.

### Task 10: Make passkey registration failures actionable

**Files:**
- Modify: `frontend/src/config/strings/english.ts`, `russian.ts`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.tsx`
- Modify: `frontend/src/pages/settings/ProfileSettingsTab.auth-methods.test.tsx`

**Interfaces:**
- Preserve backend `ApiError` detail; treat `NotAllowedError`/`AbortError` as user cancellation; map secure-context and known browser `SecurityError`/`NotSupportedError` cases to localized messages; unknown errors get a neutral retry message that does not claim HTTPS is the cause.
- Do not weaken any WebAuthn backend origin or RP validation.

- [ ] **Step 1: Add failing tests** for successful registration, user cancellation, API `APP_URL`/RP rejection, unsupported browser, `SecurityError`, and an unknown exception.
- [ ] **Step 2: Run the focused profile auth-method tests** and confirm the new expected messages fail against the current catch-all behavior.
- [ ] **Step 3: Add localized error keys and map each error class** while leaving the registration protocol calls and backend validation unchanged.
- [ ] **Step 4: Run profile auth-method and catalog tests.**
- [ ] **Step 5: Commit** as `[Fix] clarify passkey registration failures`.

### Task 11: Document the reuse system and run final verification

**Files:**
- Create: `docs/engineering/frontend-design-system.md`
- Modify: `AGENTS.md`
- Modify: `frontend/package.json` if verification scripts need final wiring

**Interfaces:**
- `AGENTS.md` points implementers to the canonical localization catalog, `frontend/src/design-system/tokens.css`, existing component reuse, and the commands that enforce them.
- `frontend-design-system.md` defines token names, exception policy, and how to add translated strings/components without duplicating style values.

- [ ] **Step 1: Write the frontend design-system guide** with examples referencing existing components and tokens, not new parallel components.
- [ ] **Step 2: Update `AGENTS.md`** to require reuse of existing catalog entries/components/tokens and document `npm run check:i18n` plus the design-token test.
- [ ] **Step 3: Run final checks from `CONTRIBUTING.md`:** `cd frontend && npm test`, `npm run check:i18n`, `npm run lint`, and `npm run build`; run Android Gradle build if available.
- [ ] **Step 4: Run `git diff --check`, inspect every commit and worktree status, and confirm the primary checkout is unchanged.**
- [ ] **Step 5: Commit** as `[Docs] document frontend localization and design tokens`.

## Final Commit Order

1. `[Test] add UI localization audit`
2. `[Fix] localize auth and profile screens`
3. `[Fix] localize chat and storage flows`
4. `[Fix] complete English and Russian UI localization`
5. `[Fix] normalize frontend typography tokens`
6. `[Fix] centralize frontend color and radius tokens`
7. `[Fix] align mobile notification selector`
8. `[Fix] round Android sign-in QR surface`
9. `[Fix] use hash routing in Capacitor`
10. `[Fix] clarify passkey registration failures`
11. `[Docs] document frontend localization and design tokens`

## Self-Review

- Spec coverage: catalog parity and full literal migration are Tasks 1–4; typography, colors, and radii are Tasks 5–6; mobile selector and QR are Tasks 7–8; Android routing and passkeys are Tasks 9–10; contributor documentation and checks are Task 11.
- Each failure mode in Review Focus is exercised by the named task tests.
- The router interface is defined once and consumed by `App`; string keys remain in the existing English/Russian shape; token names are consistent across the test and styles.
- Translation commits all precede typography/token commits, and each reported defect with a focused reproduction receives its own fix commit.
- The localization inventory contains demo-preview and attribute candidates; the scanner must classify and document exceptions instead of treating every technical/data string as copy.
