# Frontend Stylesheet Modularization

**Status:** Awaiting written spec review  
**Date:** 2026-10-22  
**Repository scope:** `stovo-messenger`, frontend CSS only

## User problem

`frontend/src/styles.css` is 31,808 lines (about 887 KB), combining global foundations, chat and call interfaces, page styles, and late refinements. This makes changes difficult to locate and increases the chance that unrelated styles are changed accidentally.

## Goal and constraints

Split the stylesheet into smaller, named CSS files grouped by purpose. Preserve rendered behavior, selector specificity, source order, responsive behavior, and the existing app and preview entry points. This is an organization change; it does not aim to reduce the CSS shipped to users or remove unrelated assets.

Keep `frontend/src/styles.css` as the entry point imported from `main.tsx` and linked by `call-ui-preview.html`. Its imports define the existing cascade order. Extract rules exactly once and do not reorder them between the split files. Use plain CSS and the existing Vite pipeline; do not add a preprocessor or CSS framework.

## Proposed ordered stylesheet modules

The line ranges are anchors from the current stylesheet, not hard-coded extraction boundaries. Extraction must end at CSS rule boundaries, and the concatenated imports must preserve the original text and rule order.

| Order | Module | Current source area |
|---:|---|---|
| 1 | `foundation.css` | 1–181: shared variables and base styles |
| 2 | `call-popup.css` | 182–1,587: popup, controls, and audio settings |
| 3 | `theme.css` | 1,588–1,982: accents, theme modes, and wallpapers |
| 4 | `app-shell.css` | 1,983–4,013: application layout and navigation |
| 5 | `shared-interactions.css` | 4,014–4,409: scrollbars and shared interaction rules |
| 6 | `conversation.css` | 4,410–5,030: conversation surface and header |
| 7 | `composer-and-message-editing.css` | 5,031–6,447: editing and compose surfaces |
| 8 | `message-rendering.css` | 6,448–8,022: bubbles, reactions, and link previews |
| 9 | `media-attachments.css` | 8,023–8,820: video and document attachments |
| 10 | `image-editors.css` | 8,821–10,236: image and avatar editors |
| 11 | `appearance-and-settings.css` | 10,237–12,912: appearance, settings, help, and legal pages |
| 12 | `storage-and-plans.css` | 12,913–14,690: storage and plans |
| 13 | `call-stage-and-captions.css` | 14,691–15,644: call screens, intelligence, and captions |
| 14 | `attachment-picker.css` | 15,645–16,990: attachment picker |
| 15 | `chat-details.css` | 16,991–18,615: chat details and related surfaces |
| 16 | `secondary-settings.css` | 18,616–20,322: notification settings and secondary screens |
| 17 | `message-actions.css` | 20,323–20,737: message actions and pinned-message styles |
| 18 | `chat-responsive.css` | 20,738–21,640: web and mobile chat layout |
| 19 | `audio-and-document-previews.css` | 21,641–22,526: transcription and audio/document previews |
| 20 | `storage-and-admin.css` | 22,527–24,632: storage refinements, admin, and native shell |
| 21 | `scheduled-messages.css` | 24,633–25,381: scheduled messages and reminder modals |
| 22 | `voice-channels.css` | 25,382–26,653: voice-channel layouts and controls |
| 23 | `storage-canvas-and-checklist-previews.css` | 26,654–27,656: collections, canvas, and checklist previews |
| 24 | `plugins-and-stats.css` | 27,657–27,738: plugin and statistics styles |
| 25 | `quick-switcher-and-shortcuts.css` | 27,739–28,488: quick switcher and keyboard shortcuts |
| 26 | `checklists.css` | 28,489–30,397: checklist components and page |
| 27 | `guest-meetings.css` | 30,398–31,808: guest meetings and related final styles |

The source has accumulated late refinements. They remain at their current cascade positions, even when that means a module contains overrides. Consolidating or reordering overrides is outside this change.

## CSS source tests

Many tests read `styles.css` directly to assert CSS contracts. Add a shared test helper that recursively resolves the entry file's local CSS imports in order and returns the combined source. Migrate those direct reads to the helper without weakening or deleting assertions. Keep the call UI preview linked to the entry file.

## Future growth guard

Add a lightweight CI size ratchet for authored CSS partials: warn above 1,500 lines, reject newly added partials above 2,500 lines, and reject growth to existing partials already above the warning threshold unless an explicit documented exception is recorded. The check must ignore dependencies, generated output, and test fixtures. Do not reformat or rewrite existing CSS as part of introducing the guard.

## Verification

- Confirm that concatenating the extracted files in entry-point import order exactly reproduces the original stylesheet source and preserves its rule sequence.
- Run frontend tests, lint, and production build using the commands in `CONTRIBUTING.md`.
- Review the final diff for moved/duplicated/missing CSS, changed import order, unrelated edits, and threshold exceptions.

No visual behavior change, asset deletion, CSS framework migration, selector cleanup, or unrelated TypeScript refactor is in scope.
