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
| Hard-coded UI copy | Beyond `ProfileSettingsTab.tsx` and `LoginPage.tsx`, a TypeScript AST inventory found user-facing JSX text and accessibility-label candidates in 117 production TSX files (1,466 candidate nodes; includes repeated labels and demo previews). High-density areas include `StorageCollections.tsx`, `ChatDetailsPanel.tsx`, `ChatSidebar.tsx`/`ChatList.tsx`, `AttachmentPickerSheet.tsx` and its picker subcomponents, `RichPollCreator.tsx`/`RichChecklistCreator.tsx`, `GuestMeetingPage.tsx`, call controls/settings/transcripts, `MembersPage.tsx` and admin pages. Representative literals include “Choose who gets access”, “New poll”, “AI Call Transcript”, “Search contacts”, “Close image editor”, and “Mute microphone”. This inventory also includes product/demo preview copy and accessibility attributes; each candidate must be classified rather than blindly extracted. | Audit every production TS/TSX user-facing text path, including JSX text, ARIA/title/placeholder attributes, state/toast/error messages, and product previews. Move app-owned copy into feature dictionaries. Preserve only technical identifiers, user data, external content, and numeric/protocol labels as non-translatable values; document any remaining explicit exceptions. Add a regression scanner that rejects new unapproved UI string literals. |
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

Keep `english.ts` as the source shape for `AppStrings` and `russian.ts` as a structurally identical catalog. Add recursive parity coverage so any added feature section or nested key must be translated in both languages. Inventory all user-facing literals across production `frontend/src/**/*.ts(x)`, classify data/technical/demo values, and move the remaining app-owned copy into feature-scoped dictionaries. Add a focused static regression check so newly introduced JSX text or accessibility copy cannot silently bypass localization. UI labels, helper copy, status and error messages, `aria-label`, `title`, and placeholders must resolve through `useStrings()`/`AppStrings`. Use interpolation functions for dynamic values and `Intl.DateTimeFormat` with the resolved language for displayed dates. Keep technical identifiers and user data outside the catalog.

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
- Focused component tests proving passkey/QR copy uses the selected language and the active server switcher omits the “Current space” label. A static TypeScript-AST check should scan the complete production TSX surface (including UI attributes and state/error copy) and compare candidates against a small, explained allowlist.
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

## Appendix: Production TSX literal inventory

A static TypeScript AST scan of the checked-out production TSX files found candidate JSX text and human-readable accessibility/label attributes in the following files. Counts include repeated text and demo/preview content; they are candidates for review, not a claim that every entry is untranslated. Each string must be classified and migrated or documented as an allowed technical/data value. The scan found 117 files and 1466 candidate nodes.

| Candidate nodes | Source file |
| ---: | --- |
| 3 | `frontend/src/AppLockGate.tsx` |
| 1 | `frontend/src/auth/RequireAuth.tsx` |
| 29 | `frontend/src/components/AttachmentPickerSheet.tsx` |
| 9 | `frontend/src/components/AudioNowPlaying.tsx` |
| 2 | `frontend/src/components/AvatarEditorModal.tsx` |
| 2 | `frontend/src/components/CallParticipantFocusStage.tsx` |
| 1 | `frontend/src/components/CallParticipantGrid.tsx` |
| 1 | `frontend/src/components/CallParticipantTile.tsx` |
| 23 | `frontend/src/components/ChatStatsDrawer.tsx` |
| 9 | `frontend/src/components/DocumentAttachmentPreview.tsx` |
| 2 | `frontend/src/components/ErrorBoundary.tsx` |
| 17 | `frontend/src/components/FormattingToolbar.tsx` |
| 26 | `frontend/src/components/ImageEditorModal.tsx` |
| 7 | `frontend/src/components/ImageLightbox.tsx` |
| 2 | `frontend/src/components/InlineDocumentPreview.tsx` |
| 2 | `frontend/src/components/LinkUnfurlCard.tsx` |
| 3 | `frontend/src/components/MCPConnectorsPanel.tsx` |
| 48 | `frontend/src/components/MessageEnlargeModal.tsx` |
| 5 | `frontend/src/components/PollVotersModal.tsx` |
| 2 | `frontend/src/components/QuickSwitcherModal.tsx` |
| 83 | `frontend/src/components/RealStovoDemo.tsx` |
| 7 | `frontend/src/components/RichCanvasPreview.tsx` |
| 4 | `frontend/src/components/StorageCanvases.tsx` |
| 6 | `frontend/src/components/StorageChecklists.tsx` |
| 78 | `frontend/src/components/StorageCollections.tsx` |
| 120 | `frontend/src/components/StovoFeaturePreviews.tsx` |
| 18 | `frontend/src/components/VideoPlayer.tsx` |
| 21 | `frontend/src/components/YearWithStovoModal.tsx` |
| 2 | `frontend/src/components/attachment-picker/DocumentPickerList.tsx` |
| 7 | `frontend/src/components/attachment-picker/MediaGalleryGrid.tsx` |
| 17 | `frontend/src/components/attachment-picker/RichChecklistCreator.tsx` |
| 21 | `frontend/src/components/attachment-picker/RichPollCreator.tsx` |
| 5 | `frontend/src/features/chats/ChatOverlays.tsx` |
| 15 | `frontend/src/features/chats/QuickAccessPanel.tsx` |
| 35 | `frontend/src/features/chats/calling/CallAudioSettingsPopup.tsx` |
| 3 | `frontend/src/features/chats/calling/CallDeviceControls.tsx` |
| 1 | `frontend/src/features/chats/calling/CallDeviceSelect.tsx` |
| 5 | `frontend/src/features/chats/calling/CallFeature.tsx` |
| 5 | `frontend/src/features/chats/calling/CallPopupAudioStage.tsx` |
| 2 | `frontend/src/features/chats/calling/CallSettingsContextMenu.tsx` |
| 12 | `frontend/src/features/chats/calling/CallSettingsDialog.tsx` |
| 4 | `frontend/src/features/chats/calling/CallSpeakerSheet.tsx` |
| 10 | `frontend/src/features/chats/calling/CallVideoSettingsPopup.tsx` |
| 29 | `frontend/src/features/chats/calling/DesktopCallControls.tsx` |
| 4 | `frontend/src/features/chats/calling/GroupCallActiveBanner.tsx` |
| 7 | `frontend/src/features/chats/calling/GroupCallPreJoinModal.tsx` |
| 9 | `frontend/src/features/chats/calling/GuestMeetingLinkControl.tsx` |
| 4 | `frontend/src/features/chats/calling/GuestMeetingSelect.tsx` |
| 1 | `frontend/src/features/chats/calling/LiveCaptionsOverlay.tsx` |
| 24 | `frontend/src/features/chats/calling/MeetingIntelligencePopover.tsx` |
| 7 | `frontend/src/features/chats/calling/MinimizedCallBar.tsx` |
| 11 | `frontend/src/features/chats/calling/MobileActiveScreen.tsx` |
| 8 | `frontend/src/features/chats/calling/MobileActiveTopBar.tsx` |
| 6 | `frontend/src/features/chats/calling/MobileCallMoreMenu.tsx` |
| 4 | `frontend/src/features/chats/calling/MobileIncomingScreen.tsx` |
| 12 | `frontend/src/features/chats/calling/MockScreenSharePreview.tsx` |
| 4 | `frontend/src/features/chats/calling/SharedCallStage.tsx` |
| 1 | `frontend/src/features/chats/calling/SpeakingWaveBadge.tsx` |
| 14 | `frontend/src/features/chats/calling/TranscriptPanel.tsx` |
| 30 | `frontend/src/features/chats/calling/VoiceChannelStage.tsx` |
| 2 | `frontend/src/features/chats/composer/AttachmentControls.tsx` |
| 7 | `frontend/src/features/chats/composer/Composer.tsx` |
| 5 | `frontend/src/features/chats/composer/ComposerEmojiPicker.tsx` |
| 3 | `frontend/src/features/chats/composer/ComposerReplyBar.tsx` |
| 2 | `frontend/src/features/chats/composer/PendingAttachmentCard.tsx` |
| 1 | `frontend/src/features/chats/composer/PendingAttachmentsStrip.tsx` |
| 16 | `frontend/src/features/chats/composer/ReminderModal.tsx` |
| 18 | `frontend/src/features/chats/composer/ScheduleMessageModal.tsx` |
| 4 | `frontend/src/features/chats/conversation/CanvasCardBubble.tsx` |
| 33 | `frontend/src/features/chats/conversation/ChatHeader.tsx` |
| 9 | `frontend/src/features/chats/conversation/ChecklistCardBubble.tsx` |
| 19 | `frontend/src/features/chats/conversation/ConversationPanel.tsx` |
| 3 | `frontend/src/features/chats/conversation/MessageAttachmentThumbs.tsx` |
| 11 | `frontend/src/features/chats/conversation/MessageBubble.tsx` |
| 1 | `frontend/src/features/chats/conversation/MessageContextMenu.tsx` |
| 14 | `frontend/src/features/chats/conversation/MessageDialogs.tsx` |
| 8 | `frontend/src/features/chats/conversation/MessageList.tsx` |
| 11 | `frontend/src/features/chats/conversation/PollBubble.tsx` |
| 1 | `frontend/src/features/chats/conversation/VoiceLiveCallBanner.tsx` |
| 9 | `frontend/src/features/chats/details/ChatDetailsPanel.tsx` |
| 4 | `frontend/src/features/chats/sidebar/ChatContextMenu.tsx` |
| 11 | `frontend/src/features/chats/sidebar/ChatFolderDialog.tsx` |
| 31 | `frontend/src/features/chats/sidebar/ChatList.tsx` |
| 12 | `frontend/src/features/chats/sidebar/ChatListItem.tsx` |
| 12 | `frontend/src/features/chats/sidebar/ChatSidebar.tsx` |
| 6 | `frontend/src/features/chats/sidebar/DefaultChatSectionDialog.tsx` |
| 19 | `frontend/src/features/chats/sidebar/NewChatDialog.tsx` |
| 1 | `frontend/src/features/chats/transfer/ChatTransferDialog.tsx` |
| 1 | `frontend/src/messageMarkdown.tsx` |
| 23 | `frontend/src/pages/AdminMembersPage.tsx` |
| 1 | `frontend/src/pages/AdminPage.tsx` |
| 4 | `frontend/src/pages/AdminPluginsPage.tsx` |
| 1 | `frontend/src/pages/AdminRolesPage.tsx` |
| 39 | `frontend/src/pages/AdminStatsPage.tsx` |
| 16 | `frontend/src/pages/CanvasPage.tsx` |
| 1 | `frontend/src/pages/ChatsPage.tsx` |
| 33 | `frontend/src/pages/ChecklistPage.tsx` |
| 19 | `frontend/src/pages/FilesPage.tsx` |
| 8 | `frontend/src/pages/GuestMeetingAudioSettings.tsx` |
| 2 | `frontend/src/pages/GuestMeetingConnectingScreen.tsx` |
| 2 | `frontend/src/pages/GuestMeetingMedia.tsx` |
| 48 | `frontend/src/pages/GuestMeetingPage.tsx` |
| 14 | `frontend/src/pages/InvitePage.tsx` |
| 3 | `frontend/src/pages/LegalDocumentsPage.tsx` |
| 34 | `frontend/src/pages/LoginPage.tsx` |
| 22 | `frontend/src/pages/MembersPage.tsx` |
| 16 | `frontend/src/pages/MultiAdminPage.tsx` |
| 8 | `frontend/src/pages/PlansPage.tsx` |
| 6 | `frontend/src/pages/QRLoginApprovalPage.tsx` |
| 1 | `frontend/src/pages/RootRedirect.tsx` |
| 10 | `frontend/src/pages/ServerSetupPage.tsx` |
| 2 | `frontend/src/pages/SettingsPage.tsx` |
| 8 | `frontend/src/pages/SetupPage.tsx` |
| 2 | `frontend/src/pages/settings/AppearanceControls.tsx` |
| 2 | `frontend/src/pages/settings/HelpAboutSection.tsx` |
| 10 | `frontend/src/pages/settings/KeyboardShortcutsSettings.tsx` |
| 7 | `frontend/src/pages/settings/ProfileSettingsTab.tsx` |
