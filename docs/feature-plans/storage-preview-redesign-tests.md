---
title: "Storage preview redesign test plan"
type: test-plan
---

# Storage preview redesign test plan

| Scenario / invariant | Test layer | Evidence |
| --- | --- | --- |
| Opening a file uses an overlay without reserving a details column; close, backdrop, and Escape dismiss it | Component interaction + CSS contract | Render the real Files page, select a tile, assert dialog semantics and dismissal; assert the overlay is viewport-bounded and independent of the grid columns |
| Images and videos preserve their intrinsic ratio and normalize small sources to the standard preview size | Component + geometry unit + browser regression | Verify upscaling of a 320×180 video, photo load dimensions, and actual content enlargement in the mock browser |
| Right alignment, content enlargement, readable PDF width, and controls remain valid at 1400×900 and 964×530 | Playwright mock regression | Run `e2e/tests/storage-preview-layout.spec.ts`; measure content and dialog bounds for all four fixtures before/after enlargement, assert right-edge gaps, verify PDF canvas width, and restore the regular size |
| Documents show content without a file-type icon; Markdown has no card background | Component + CSS contract | Render document preview fixtures and assert the actual content is present and decorative type icon is absent; assert plain Markdown surface styles |
| Download, Full screen, and the actions menu overlay the preview for all file types | Component interaction + CSS contract | Assert controls are inside the media surface, Full screen expands/collapses for video, document, audio, and generic file previews, and actions stay inside the media bounds |
| Metadata opens a dedicated information popup and other menu actions remain readable icon rows | Component interaction + CSS contract | Assert Metadata opens a separate popup with size, saved date, and source; assert Open in chat, Favorite, and permission-gated Delete each include an SVG and an unwrapped label |
| Favorite and Delete retain their existing update and authorization behavior from Metadata | Component interaction | Toggle favorite and verify updated state; verify Delete appears only for users allowed by `canDeleteFile` |
| Search is constrained and Settings sits beside it | Component + CSS contract | Render the toolbar, locate the settings action adjacent to search, and assert a bounded search width |
| File and folder grouping settings are disabled gray Premium options | Component interaction + CSS contract | Prepopulate stored grouping flags, verify both controls are disabled and unpressed, check flags are cleared and no grouped headings appear |
| Mock mode provides ephemeral photo, video, renderable PDF, and Markdown files without upload | Mock API + mock UI | Assert seeded records and content are returned by the mock file API, then open the Files route in mock mode and inspect each preview |
| Existing Storage file behavior remains intact | Focused regression suite | Run FilesPage, document preview, lightbox, mock file store/API tests, i18n check, frontend lint, and build |

## Regression test order

1. Add failing FilesPage and styling regressions for the overlay geometry, actions, metadata menu, search settings, and grouping controls; run them before changing production code.
2. Add failing mock fixture/API coverage for ephemeral preview files and content; run it before changing production code.
3. Implement the smallest changes needed for each failing scenario, rerun the unchanged tests, then run the broader frontend checks listed above.
