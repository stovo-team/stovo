---
title: "Headless frontend evidence"
type: workflow
---

# Headless frontend evidence

Run the real application with synthetic mock fixtures through headless Playwright. Use the separate visual configuration; existing integration E2E targets remain unchanged. No browser-use tool is required.

From the repository root, install locked frontend/e2e dependencies and matching Chromium, then run:

```sh
npm --prefix frontend ci
npm --prefix e2e ci
npm --prefix e2e exec -- playwright install chromium
npm --prefix e2e run test:visual
node e2e/tools/capture-evidence.mjs --task example-task --output artifacts/agent-workflows/example-task
```

The runner owns a strict loopback server on port 5174 and refuses an occupied port. Fresh contexts isolate local storage and IndexedDB. The clock is fixed to 2026-10-19 06:00 UTC, fonts load before capture, and motion is disabled. The test harness serves a licensed local copy of the application's existing Material Symbols font; its provenance/hash/license live with the test asset. Production HTML and font configuration are unchanged. External HTTP and WebSocket traffic fails a test; the Vite client's exact loopback root HMR socket is the only WebSocket exception.

The eight shell combinations cover 1440x900 and 390x844, light/dark and English/Russian. Four state cases cover empty history, loading, history error/retry and the real shared section-settings popup with long Russian input. The popup opens through the existing section settings button by keyboard, uses the actual PopupDialog/PopupField, intentionally stays open on Escape per its configured behavior, and closes through its close button. Desktop navigation and the mobile back control have separate visibility assertions.

Successful tests attach screenshots; failures retain screenshots and traces. A screenshot is evidence of the named state, not proof of backend correctness or a human-approved design. Keep generated output under ignored `artifacts/agent-workflows/`. Record exact source contents, browser/OS, scenario, viewport, theme, locale and contract digest. Paired comparisons require matching metadata and actual base/head revisions.

Capture first, present concrete references for human review, then enable pixel comparisons only for accepted references. Missing or changed references must produce a reviewable diff and a failing comparison, never an automatic acceptance. Preserve blocked/failed outcomes. Follow [testing](testing.md), [approvals](approvals.md), and [PR evidence](pr-review-findings.md).

## Mock server and bug reproduction

When fixing a frontend defect, bug, or layout issue:
1. **Start the local mock server:** `npm --prefix frontend run dev:mock` (or `npm run dev:mock` from `frontend/`). It serves the real application with synthetic data on `http://127.0.0.1:5174`.
2. **Mandatory bug reproduction:** Before making any code changes, navigate to the affected route, match the reported viewport dimensions, theme, and locale, and execute the user interactions. Confirm and document that the defect actively reproduces on the running mock server.
3. **Capture real BEFORE screenshot:** Capture the actual defect state directly from the running mock server and save it under `docs/agent-workflows/evidence/<task>/` (or `e2e/visual/evidence/<task>/`).
4. **Fix and verify:** After implementing the fix, verify that the defect is gone on `http://127.0.0.1:5174` under identical conditions, and capture the actual **AFTER** screenshot.

## PR visual evidence standards

Visual evidence in pull request descriptions must display real rendered screenshots, not plain text paths:
- **Embed real images:** Use Markdown image embeds (`![Caption](https://raw.githubusercontent.com/stovo-team/stovo-messenger/<branch>/path/to/image.png)`) or `<img src="..." width="..." />` so that reviewers see the actual visual output in GitHub.
- **Strictly forbidden:** NEVER put bare text file paths in code backticks (e.g. `` `e2e/visual/...png` ``) or fake text placeholders like `path.png (prior)` in tables or PR bodies.
- **Distinct before and after images:** Before and after screenshots must be distinct image files showing the actual transition from the reproduced defect to the resolved state under matching viewport, theme, and locale.


## Reference gate and revision comparison

`STOVO_VISUAL_COMPARE=true` enables exact screenshot comparisons only when `e2e/visual/__screenshots__/<platform>/reference-approval.json` cites a real human decision and hashes the references in the same browser/platform/timezone. Missing, changed or mismatched references fail. Capture output remains separate; it never certifies its own reference approval. Review the generated gallery first, then copy only accepted images into the reference directory and record their digests/source. A baseline update is another reviewable change.

From the repository root, compare two distinct exact commit IDs:

```sh
node e2e/tools/compare-revisions.mjs --base <base-commit> --head <head-commit> --task example-task --output artifacts/agent-workflows/example-comparison --grep 'loaded shell'
```

The standalone CLI owns temporary detached worktrees and cleans up only those paths. It overlays the same test harness on each application revision, reuses dependencies only when lockfiles match, captures sides sequentially and preserves reports for failed sides. A new scenario absent from the base is explicitly limited rather than called a successful pair. Harness changes are included in dirty-source metadata; application revisions remain named separately. Full delivery validation requires a contract-bound manifest and matching before/after metadata.
