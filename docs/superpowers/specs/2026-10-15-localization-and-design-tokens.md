# Localization and Design Tokens: Audit and Fix Specification

## User need

The Russian interface contains untranslated English UI, typography is inconsistent across the app, several controls overflow or look oversized on mobile, Android app-link navigation can crash the Capacitor WebView, and passkey creation reports an unhelpful generic failure. The user wants these issues fixed, regression coverage added, and documentation updated so future work reuses the existing translation and style systems.

## Scope and acceptance criteria

1. Translate all app-owned user-visible interface copy into Russian and English. Keep protocol labels, user-generated content, file names, URLs, and third-party rendered content as-is. Remove the “Current space” subtitle from the active server-switcher item.
2. Compare translation catalogs recursively so a missing or extra nested key fails a test. Localize copy currently embedded in JSX, including passkey and Android QR sections, and preserve dynamic interpolation and locale-aware date formatting.
3. Make the Android native launch and app-link route to `/server-setup` work without a `History.replaceState` origin exception. Keep normal web URLs and browser history behavior intact.
4. Make passkey registration failures diagnosable and fix the reproducible registration failure. Keep secure-origin and relying-party checks intact; never weaken WebAuthn validation to hide a configuration problem.
5. Establish one configurable design-token source for UI typography, semantic colors, and corner radii. Migrate app-authored UI styles to the token set, including page-specific stylesheets and inline presentation values where practical. Keep a documented, test-enforced exception list for content whose dimensions are intrinsic or data-driven (for example, rendered media, diagrams, and responsive call-stage labels).
6. Normalize the shared-content tab labels and “Add participants” control; place the notification mute selector below its helper copy on narrow screens; apply the shared surface radius to Android QR output.
7. Add regression tests for the reported layouts/behaviors, translation completeness, token usage, Android navigation, and passkey error handling. Update `AGENTS.md` and the relevant developer documentation with the token/catalog reuse rules and verification commands.
8. Commit the spec and implementation as small local commits. Do not publish or open a PR.

## Audit findings

| Area | Evidence and affected locations | Required change |
| --- | --- | --- |
| Translation catalogs | `frontend/src/config/strings/english.ts`, `russian.ts`, and `strings.test.ts`. The catalogs are typed, but the existing parity test checks only selected sections and some nested groups. | Add recursive parity validation for the full catalog shape and keep both languages in sync. |
| Hard-coded UI copy | `frontend/src/pages/settings/ProfileSettingsTab.tsx` embeds the passkey description/actions/status, Android QR copy and expiry label. `frontend/src/pages/LoginPage.tsx` embeds passkey and Android QR labels/errors. Other feature components must be scanned for visible literals and moved into the corresponding feature dictionary. | Audit production TSX UI strings, then migrate all app-owned copy into the dictionaries. Preserve non-UI literals and add an explicit documented exception rule. |
| Active space label | `frontend/src/features/chats/sidebar/ChatSidebar.tsx` renders `strings.spaceSwitcher.currentSpace`, producing the unwanted “Текущий спейс” subtitle. | Remove the subtitle from the active server item and retire its unused string key. |
| Android startup/deep link | `frontend/src/App.tsx` always uses `BrowserRouter`; `frontend/src/native/NativeAppOrchestrators.tsx` navigates to `/server-setup` for connection links. The supplied screenshot shows Capacitor rejecting a `replaceState` URL whose `capacitor://localhost` origin differs from the document's `capacitor://` origin. | Use a native routing mode that does not write app routes into the custom-scheme URL, while retaining BrowserRouter on web; cover app-link navigation in a regression test. |
| Passkeys | `ProfileSettingsTab.tsx` falls back to “Could not add passkey. Try again over HTTPS.” for non-API exceptions. `backend/internal/app/passkeys.go` already distinguishes insecure origins, `APP_URL`, and RP mismatch; backend tests cover these constraints. | Keep server validation strict, distinguish cancellation from actionable client/RP errors, localize surfaced errors, and add tests that reproduce the client failure/reporting path. Verify the configured public origin separately when runtime deployment data is available. |
| Typography | Four production CSS files contain 858 `font-size` declarations; `frontend/src/styles.css` alone has 841 declarations and 147 distinct literal values. Reported oversized controls are in `frontend/src/features/chats/details/ChatDetailsPanel.tsx` and its `.chat-info-tabs`, `.chat-info-tab`, and `.chat-info-member-invite` rules in `frontend/src/styles.css`. | Define a compact semantic type scale and migrate UI declarations to it. Responsive/content-derived sizes must reference configured tokens or be explicit tested exceptions. |
| Color and corner consistency | The four production CSS files contain 1,078 `border-radius` declarations. `styles.css` has a few radius variables, but literal values remain common; a static inventory also found 3,391 color references (948 distinct raw spellings, including alpha colors and `transparent`). | Complete the semantic color and radius token layer; map recurring surface, text, accent, border, status, and control styles to named tokens. Preserve specialized visual treatments through named component tokens rather than new ad hoc values. |
| Narrow notification layout | `ChatDetailsPanel.tsx` lays out the notification mute control and helper copy together. The current narrow-screen rules in `styles.css` place the control at the start of the row and hide helper copy, which causes crowding in the supplied screenshot. | Keep helper copy visible and put the mute selector on its own lower row on narrow screens; the menu itself must remain within the viewport. |
| Android QR styling | `ProfileSettingsTab.tsx` renders the generated QR image without a rounded surface wrapper. | Apply the shared card/control radius without changing QR modules or quiet zone. |
| Documentation | `AGENTS.md` directs contributors to the canonical `docs/` tree and optional `okf-agent`, but that CLI is not installed in this environment. Current design-token reuse guidance is not present in the agent instructions. | Document the token and translation source of truth and checks in `AGENTS.md` plus the appropriate frontend engineering guide. Search canonical Markdown directly; do not create an index tool dependency. |

## Design

### Localization

Keep `english.ts` as the source shape for `AppStrings` and `russian.ts` as a structurally identical catalog. Add recursive parity coverage so any added feature section or nested key must be translated in both languages. UI labels, helper copy, status and error messages, `aria-label`, `title`, and placeholders must resolve through `useStrings()`/`AppStrings`. Use interpolation functions for dynamic values and `Intl.DateTimeFormat` with the resolved language for displayed dates. Keep technical identifiers and user data outside the catalog.

### Design-token configuration

Create one imported token stylesheet as the source of truth. Define semantic tokens for font family, named font sizes, weights and line heights; foreground, background, surface, border, accent, focus, and status colors; and the approved radius scale. Use semantic aliases in components so a global adjustment changes the whole app predictably. Migrate shared and page styles instead of layering a new parallel component library over the existing DOM. Add a static regression check that rejects unapproved literal `font-size`, color, and radius values in production UI CSS; exceptions must be narrowly scoped and explained beside the test/config.

### Native navigation

Select the router by platform at the top-level `App`: browser history for web and hash-based routing for Capacitor native builds, so route transitions remain same-origin under the native custom scheme. Preserve all React Router paths and existing native link parsing. Cover direct server-connection link handling and a normal browser history smoke case.

### Passkey failures

Keep the backend's APP_URL, secure-origin, credential-origin, and RP ID checks unchanged unless a test proves a specific validation defect. In the frontend, treat user cancellation as a quiet outcome, keep API-provided server messages actionable, and map WebAuthn browser exceptions to localized copy that does not falsely claim every error is an HTTPS failure. Cover unsupported/insecure, canceled, API-rejected, and unknown browser failures.

### Responsive fixes

Use design tokens for tab/invite text and QR radius. On narrow widths, stack the notification selector under the descriptive text and constrain its options menu to the visible viewport. Add focused CSS contract tests for mobile and desktop rules.

## Test plan

- Recursive English/Russian catalog key and value-shape parity, including nested objects and interpolation functions.
- Focused component tests proving all passkey/QR copy uses the selected language and that the active server switcher omits the “Current space” label.
- Android native router test for app-link navigation to `/server-setup`, plus a web-router history test.
- Passkey registration tests for successful flow, cancellation, API configuration rejection, and unclassified WebAuthn exception.
- CSS contract tests for semantic token use, mobile mute-selector ordering/viewport bounds, shared-content/invite type scale, and rounded Android QR.
- Run focused frontend tests, the full frontend test suite, frontend lint, and production build. Run focused backend passkey tests only if backend behavior changes. Report Android build/device validation separately if unavailable in the environment.

## Commit sequence

1. This audit/fix specification.
2. Localization completeness and regression tests.
3. Shared typography/color/radius tokens and reported responsive/QR styling fixes.
4. Android native routing fix and regression coverage.
5. Passkey error-path fix and regression coverage, if investigation reproduces a product defect; otherwise document the specific runtime configuration required and preserve the evidence.
6. Developer documentation and agent instructions.

All commits stay on `feature/localization-style-system` in the task worktree. No push, pull request, or merge is in scope.
