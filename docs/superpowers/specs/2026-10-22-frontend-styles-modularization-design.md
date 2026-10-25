# Frontend Stylesheet Modularization

**Status:** Approved for implementation  
**Date:** 2026-10-22  
**Repository scope:** `stovo-messenger`, frontend CSS only

## User problem

`frontend/src/styles.css` on the required `master` base is 32,762 lines (about 1.02 MB), combining global foundations, chat and call interfaces, page styles, and late refinements. This makes changes difficult to locate and increases the chance that unrelated styles are changed accidentally.

## Goal and constraints

Split the stylesheet into smaller, named CSS files grouped by purpose. Preserve rendered behavior, selector specificity, source order, responsive behavior, and the existing app and preview entry points. This is an organization change; it does not aim to reduce the CSS shipped to users or remove unrelated assets.

Keep `frontend/src/styles.css` as the entry point imported from `main.tsx` and linked by `call-ui-preview.html`. Its imports define the existing cascade order. Extract rules exactly once and do not reorder them between the split files. Use plain CSS and the existing Vite pipeline; do not add a preprocessor or CSS framework.

## Proposed ordered stylesheet modules

The line ranges are anchors from the current `master` stylesheet. Extraction must end at CSS top-level rule boundaries, not merely at the nearest comment. The imported files must concatenate to the original source without changing its text or rule order.

| Order | Module | Current source area |
|---:|---|---|
| 1 | `foundation.css` | 1–181: shared variables and base styles |
| 2 | `call-popup.css` | 182–1,587: popup, controls, and audio settings |
| 3 | `theme.css` | 1,588–1,976: accents, theme modes, and wallpapers |
| 4 | `app-shell.css` | 1,977–4,004: application layout and navigation |
| 5 | `shared-interactions.css` | 4,005–4,409: responsive layout and shared interactions |
| 6 | `conversation.css` | 4,410–5,030: conversation surface and header |
| 7 | `composer-and-message-editing.css` | 5,031–6,445: editing and compose surfaces |
| 8 | `message-rendering.css` | 6,446–8,022: bubbles, reactions, and link previews |
| 9 | `media-attachments.css` | 8,023–8,815: video and document attachments |
| 10 | `image-editors.css` | 8,816–10,236: image and avatar editors |
| 11 | `appearance-editor.css` | 10,237–10,917: appearance editor |
| 12 | `appearance-and-settings.css` | 10,918–12,895: settings, help, and legal pages |
| 13 | `storage-and-plans.css` | 12,896–14,544: storage and plans |
| 14 | `responsive-and-call-stage.css` | 14,545–15,644: responsive rules, call screens, and captions |
| 15 | `attachment-picker.css` | 15,645–16,988: attachment picker |
| 16 | `chat-details.css` | 16,989–18,615: chat details and related surfaces |
| 17 | `secondary-settings.css` | 18,616–20,325: notification settings and secondary screens |
| 18 | `message-actions.css` | 20,326–20,714: message actions and pinned-message styles |
| 19 | `chat-responsive.css` | 20,715–21,641: web and mobile chat layout |
| 20 | `audio-and-document-previews.css` | 21,642–22,523: transcription and audio/document previews |
| 21 | `storage-and-admin.css` | 22,524–24,625: storage refinements, admin, and native shell |
| 22 | `scheduled-messages.css` | 24,626–25,382: scheduled messages and reminder modals |
| 23 | `voice-channels.css` | 25,383–26,653: voice-channel layouts and controls |
| 24 | `storage-canvas-and-checklist-previews.css` | 26,654–27,653: collections, canvas, and checklist previews |
| 25 | `plugins-and-stats.css` | 27,654–27,734: plugin and statistics styles |
| 26 | `quick-switcher-and-shortcuts.css` | 27,735–28,488: quick switcher and keyboard shortcuts |
| 27 | `checklists.css` | 28,489–30,396: checklist components and page |
| 28 | `guest-meetings-and-final-overrides.css` | 30,397–32,762: guest meetings and final related refinements |

Late refinements remain at their current cascade positions, even when that means a module contains overrides. The extra appearance-editor module keeps every new partial under the 2,500-line limit. Consolidating or reordering overrides is outside this change.

## CSS source tests

Many tests read `styles.css` directly to assert CSS contracts. Add a shared test helper that recursively resolves the entry file's local CSS imports in order and returns the combined source. Migrate those direct reads to the helper without weakening or deleting assertions. Keep the call UI preview linked to the entry file.

## Future growth guard

Add a lightweight CI size ratchet for authored CSS partials: warn above 1,500 lines, reject newly added partials above 2,500 lines, and reject growth to existing partials already above the warning threshold unless an explicit documented exception is recorded. The check must ignore dependencies, generated output, and test fixtures. Do not reformat or rewrite existing CSS as part of introducing the guard.

## Verification

- Confirm that concatenating the extracted files in entry-point import order exactly reproduces the original stylesheet source and preserves its rule sequence.
- Run frontend tests, lint, and production build using the commands in `CONTRIBUTING.md`.
- Review the final diff for moved/duplicated/missing CSS, changed import order, unrelated edits, and threshold exceptions.

No visual behavior change, asset deletion, CSS framework migration, selector cleanup, or unrelated TypeScript refactor is in scope.
