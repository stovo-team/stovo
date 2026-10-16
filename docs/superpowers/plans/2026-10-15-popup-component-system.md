# Shared Popup Component System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish one reusable popup component system, require agents to use it, then migrate existing messenger popups to the shared style without changing their behavior.

**Architecture:** Add small React/TypeScript primitives under `frontend/src/components/ui/`, with focused CSS that uses the existing theme variables. Make the shared overlay, dialog, close action, buttons, fields, and listbox dropdown the only source of popup-level styling. Migrate callers in four groups, preserving special fullscreen, sheet, drawer, and floating-call geometry while replacing their popup controls and removing conflicting overrides.

**Tech Stack:** React 19, TypeScript, CSS, lucide-react, Vitest, existing frontend lint/build scripts.

**Spec:** `docs/superpowers/specs/2026-10-15-popup-component-system-design.md`

## Global Constraints

- Backdrop is `rgba(0, 0, 0, 0.56)` with no blur.
- Dialog surface uses theme variables and a 24px radius.
- Popup close action is a 34px gray circle with a white 18px X.
- Every popup action button, including Delete, is exactly 44px high and fully rounded.
- Text fields and dropdown triggers are exactly 46px high and fully rounded.
- Dropdown triggers use one trailing 16px Lucide chevron; menus use an 18px radius and rounded option rows.
- Popup titles use 20px/26px semibold; body 14px/21px; labels 13px/18px medium; helper text 12px/17px.
- Use existing light, dark, and AMOLED theme variables; do not hardcode per-popup theme colors.
- Keep current content, copy, validation, events, labels, keyboard behavior, and responsive behavior unless the spec explicitly changes visual treatment.
- Do not add dependencies or alter non-popup page controls.
- Keep the user's primary checkout untouched; work only in `feature/popup-style-audit`.

## Review Focus

1. Backdrop and Escape dismissal differ by flow; test the shared API with dismissal enabled and disabled, and preserve each caller's current behavior.
2. Keyboard selection and focus return can regress in custom dropdowns; cover ArrowUp/ArrowDown, Enter, Escape, disabled options, and selected option.
3. Device dropdowns may be empty or change after permission/device updates; cover empty, disabled, and refreshed option lists.
4. Fullscreen media and mobile sheets need different geometry; assert shared control styles without forcing a centered 24px dialog layout.
5. Light, dark, and AMOLED palettes vary; assert theme-variable consumption rather than a single hardcoded rendered color.

---

### Task 1: Shared popup shell and close action

**Files:**
- Create: `frontend/src/components/ui/Popup.tsx`
- Create: `frontend/src/components/ui/Popup.css`
- Create: `frontend/src/components/ui/Popup.test.tsx`
- Modify: `frontend/src/styles.css` only for any shared token declaration or import required by the existing global stylesheet entry.

**Interfaces:**
- Produces `PopupBackdrop`, `PopupDialog`, and `PopupCloseButton`.
- `PopupDialog` accepts accessible naming (`ariaLabel`, `ariaLabelledBy`, `ariaDescribedBy`), `onClose`, explicit `closeOnBackdrop` / `closeOnEscape` flags, a named size, and a caller class for content layout. It sets dialog semantics without imposing a new focus trap.
- `PopupBackdrop` renders the shared overlay. `PopupCloseButton` accepts an accessible label, click handler, and disabled state.

- [ ] Run `cd frontend && npm ci` to install the locked frontend dependencies in this worktree.
- [ ] Write tests for dialog semantics, backdrop opacity/no blur contract, close button name/size class, and backdrop/Escape dismissal enabled and disabled.
- [ ] Run `cd frontend && npm test -- src/components/ui/Popup.test.tsx`; confirm the expected missing-export/behavior failures.
- [ ] Implement the shell and close action with shared theme variables and the exact contract from the spec.
- [ ] Re-run the focused test; confirm it passes.
- [ ] Commit as `Feature: add shared popup shell and close action`.

### Task 2: Shared action buttons and text fields

**Files:**
- Create: `frontend/src/components/ui/PopupButton.tsx`
- Create: `frontend/src/components/ui/PopupField.tsx`
- Create: `frontend/src/components/ui/PopupControls.test.tsx`
- Create: `frontend/src/components/ui/PopupControls.styles.test.ts`
- Modify: `frontend/src/components/ui/Popup.css`

**Interfaces:**
- `PopupButton` accepts `variant: "primary" | "secondary" | "danger"`, standard button props, and optional icon slots.
- `PopupField` accepts a label, optional helper/error text, standard input props, and a forwarded input ref.

- [ ] Write component tests for label/input association, helper/error exposure, and each button variant's semantic classes and disabled behavior.
- [ ] Write style tests for the exact 44px button height/pill radius and 46px field height/pill radius using the existing stylesheet-test conventions.
- [ ] Run the two focused tests; confirm they fail on the absent primitives/contract.
- [ ] Implement the primitives and CSS with theme-aware border, accent, danger, focus, hover, and disabled states.
- [ ] Re-run both focused tests; confirm they pass.
- [ ] Commit as `Feature: add shared popup buttons and fields`.

### Task 3: Shared custom dropdown

**Files:**
- Create: `frontend/src/components/ui/PopupSelect.tsx`
- Create: `frontend/src/components/ui/PopupSelect.test.tsx`
- Create: `frontend/src/components/ui/PopupSelect.styles.test.ts`
- Modify: `frontend/src/components/ui/Popup.css`

**Interfaces:**
- Controlled `PopupSelect` accepts options `{ value, label, disabled? }[]`, `value`, `onChange`, `ariaLabel` or `labelledBy`, `disabled`, and optional render hooks for option rows and a menu footer.
- Trigger exposes `aria-haspopup`, `aria-expanded`, and `aria-controls`; menu uses `role=listbox`; options use `role=option` / `aria-selected`.

- [ ] Write interaction tests for open/close, keyboard navigation, selection, disabled options, empty options, selected-state rendering, and trigger focus restoration after Escape/selection.
- [ ] Write style tests for a fixed 16px trailing chevron, exact trigger height/radius, 18px menu radius, and no decorative separators or pointer triangle.
- [ ] Run focused tests; confirm the dropdown contract fails before implementation.
- [ ] Implement the dropdown by adapting the existing keyboard behavior from `GuestMeetingSelect` and the icon approach from `CallDeviceSelect`.
- [ ] Re-run focused tests; confirm they pass.
- [ ] Commit as `Feature: add shared popup dropdown`.

### Task 4: Agent guidance and popup reference

**Files:**
- Create: `docs/ui/popup-standards.md`
- Modify: `AGENTS.md`

- [ ] Write the reference page with imports/examples for every primitive, the shared token table, supported variants/states, accessibility requirements, responsive exceptions, and migration rules.
- [ ] Update `AGENTS.md` to require reuse of these primitives for new popup work and link to `docs/ui/popup-standards.md`.
- [ ] Review the examples against the exports created in Tasks 1–3 and check links, wording, and Markdown formatting.
- [ ] Commit as `Docs: require shared popup components for agent work`.

### Task 5: Chat, message, composer, and transfer popups

**Files:**
- Modify: `frontend/src/features/chats/sidebar/NewChatDialog.tsx`
- Modify: `frontend/src/features/chats/sidebar/DefaultChatSectionDialog.tsx`
- Modify: `frontend/src/features/chats/sidebar/ChatFolderDialog.tsx`
- Modify: `frontend/src/features/chats/sidebar/ChatList.tsx`
- Modify: `frontend/src/features/chats/ChatOverlays.tsx` (new-chat overlay in this task; guest-meeting planner in Task 8)
- Modify: `frontend/src/features/chats/details/AddPeopleDialog.tsx`
- Modify: `frontend/src/features/chats/details/ChatDetailsPanel.tsx`
- Modify: `frontend/src/features/chats/conversation/MessageDialogs.tsx`
- Modify: `frontend/src/features/chats/composer/ScheduleMessageModal.tsx`
- Modify: `frontend/src/features/chats/composer/ReminderModal.tsx`
- Modify: `frontend/src/features/chats/transfer/ChatTransferDialog.tsx`
- Update relevant existing tests in the same directories; add focused style assertions where no popup contract is currently covered.

- [ ] Add/update failing tests for dialog labels, cancel/confirm/destructive variants, and current backdrop/Escape behavior for the migrated flows.
- [ ] Run focused tests; confirm failures represent old class/style contracts or missing shared composition.
- [ ] Migrate the listed flows to Tasks 1–3 primitives; remove conflicting local radius, overlay, close, button, input, and select rules.
- [ ] Re-run focused tests and the affected chat component tests; confirm they pass without changing user-facing behavior.
- [ ] Commit as `Feature: migrate chat popups to shared components`.

### Task 6: General, account, plan, and admin popups

**Files:**
- Modify: `frontend/src/AppLockGate.tsx`
- Modify: `frontend/src/components/InviteModal.tsx`
- Modify: `frontend/src/components/PollVotersModal.tsx`
- Modify: `frontend/src/components/QuickSwitcherModal.tsx`
- Modify: `frontend/src/components/ChatStatsDrawer.tsx`
- Modify: `frontend/src/components/MCPConnectorsPanel.tsx`
- Modify: `frontend/src/components/YearWithStovoModal.tsx`
- Modify: `frontend/src/pages/settings/AppearanceEditor.tsx`
- Modify: `frontend/src/pages/PlansPage.tsx`
- Modify: `frontend/src/pages/MultiAdminPage.tsx`
- Modify: `frontend/src/pages/AdminMembersPage.tsx`
- Update relevant existing tests in the same directories; add focused style assertions where needed.

- [ ] Add/update failing tests for shared close/buttons/fields/dropdowns and destructive confirmation actions.
- [ ] Run focused tests; confirm failures match the absent shared contract.
- [ ] Migrate listed flows and remove conflicting popup-local surface and control styles; keep alert dialogs and focus behavior semantically intact.
- [ ] Re-run focused tests; confirm they pass.
- [ ] Commit as `Feature: migrate account and admin popups to shared components`.

### Task 7: Media, attachment, and storage popups

**Files:**
- Modify: `frontend/src/components/AttachmentPickerSheet.tsx`
- Modify: `frontend/src/components/AvatarEditorModal.tsx`
- Modify: `frontend/src/components/ChatWallpaperEditorModal.tsx`
- Modify: `frontend/src/components/ImageEditorModal.tsx`
- Modify: `frontend/src/components/ImageLightbox.tsx`
- Modify: `frontend/src/components/MessageEnlargeModal.tsx`
- Modify: `frontend/src/components/DocumentAttachmentPreview.tsx`
- Modify: `frontend/src/components/StorageCollections.tsx`
- Update relevant existing tests; add focused style assertions for full-screen/sheet exceptions.

- [ ] Add/update failing tests for shared close and action styles, popup semantic labels, and preservation of fullscreen/mobile-sheet geometry.
- [ ] Run focused tests; confirm failures match the old visual implementation.
- [ ] Migrate the shared controls and dialog surfaces while preserving editor/viewer layout and attachment-sheet responsive behavior.
- [ ] Remove the local `Modal` wrapper from `StorageCollections.tsx` in favor of the shared shell; migrate its file picker, detail/settings, create, and delete flows.
- [ ] Re-run focused media/storage tests; confirm they pass.
- [ ] Commit as `Feature: migrate media and storage popups to shared components`.

### Task 8: Call and meeting popups and menus

**Files:**
- Modify: `frontend/src/features/chats/calling/CallAudioSettingsPopup.tsx`
- Modify: `frontend/src/features/chats/calling/CallVideoSettingsPopup.tsx`
- Modify: `frontend/src/features/chats/calling/CallSettingsDialog.tsx`
- Modify: `frontend/src/features/chats/calling/CallDeviceSelect.tsx`
- Modify: `frontend/src/features/chats/calling/GuestMeetingSelect.tsx`
- Modify: `frontend/src/features/chats/calling/GroupCallPreJoinModal.tsx`
- Modify: `frontend/src/features/chats/calling/CallSpeakerSheet.tsx`
- Modify: `frontend/src/features/chats/calling/TranscriptPanel.tsx`
- Modify: `frontend/src/features/chats/calling/DesktopCallControls.tsx`
- Modify: `frontend/src/features/chats/calling/MeetingIntelligencePopover.tsx`
- Modify: `frontend/src/features/chats/calling/SendSubmenu.tsx`
- Modify: `frontend/src/features/chats/ChatOverlays.tsx`
- Modify: `frontend/src/pages/GuestMeetingAudioSettings.tsx`
- Modify: `frontend/src/pages/GuestMeetingPage.tsx`
- Keep `CallFeature.tsx` floating-call geometry; update only popup controls if they violate the shared control contract.
- Update relevant existing tests; add dropdown empty/device-refresh and menu placement assertions.

- [ ] Add/update failing tests for shared dropdown trigger/chevron/menu behavior, popup close/button styles, and current call/meeting dismissal semantics.
- [ ] Run focused tests; confirm failures represent the separate call/meeting popup styles.
- [ ] Consolidate the duplicated custom selects on `PopupSelect`, remove the pointer-triangle CSS and local chevron sizing, and migrate popup controls while preserving audio/video selection and meeting interactions.
- [ ] Re-run focused call/meeting tests; confirm they pass.
- [ ] Commit as `Feature: migrate call and meeting popups to shared components`.

### Task 9: Full verification and visual review

**Files:**
- Modify only any files required to resolve findings from the checks and visual review.

- [ ] Run focused tests for `frontend/src/components/ui/` and every changed popup family; inspect the full results.
- [ ] Run `cd frontend && npm test`; record the full suite result.
- [ ] Run `cd frontend && npm run lint`; record the result.
- [ ] Run `cd frontend && npm run build`; record the result.
- [ ] Start the frontend in the isolated local environment and visually inspect representative desktop and mobile dialogs, dropdown-open state, destructive state, and light/dark/AMOLED surfaces in the in-app browser.
- [ ] Fix any verified issue with a test-first change, rerun the relevant checks, and commit the fix.

## Commit sequence

Use the task commit messages above. Do not push, publish, merge, or open a pull request without separate authorization.
