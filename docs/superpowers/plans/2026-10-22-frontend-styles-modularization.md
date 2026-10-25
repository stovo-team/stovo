---
title: "Frontend Stylesheet Modularization Implementation Plan"
type: plan
---

# Frontend Stylesheet Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 32,762-line frontend stylesheet into ordered, feature-focused CSS files while preserving its exact cascade and current behavior.

**Architecture:** Keep `frontend/src/styles.css` as the app and preview entry point, containing ordered local CSS imports. Extract contiguous source sections into the 28 partials listed in the design spec, and migrate tests to a shared helper that expands those imports in order. Add a CI CSS-size ratchet for partials without changing runtime CSS.

**Tech Stack:** Plain CSS, TypeScript/Vitest test helper, Node.js CJS size-check script, existing Vite and GitHub Actions workflows.

**Spec:** `docs/superpowers/specs/2026-10-22-frontend-styles-modularization-design.md`

## Global Constraints

- Preserve rendered behavior, selector specificity, source order, responsive behavior, and existing app and preview entry points.
- Extract rules exactly once and do not reorder them between split files.
- Keep `frontend/src/styles.css` as the entry point imported from `main.tsx` and linked by `call-ui-preview.html`.
- Use plain CSS and existing Vite; add no preprocessor or CSS framework.
- Migrate CSS source tests without weakening or deleting assertions.
- CSS size policy: warn above 1,500 lines, reject new partials above 2,500 lines, and reject growth to existing partials above 1,500 lines unless a documented exception is recorded.
- Do not remove assets, clean selectors, or refactor unrelated TypeScript.

## Review Focus

- Import ordering changes cascade: test source expansion preserves import order and compare extracted concatenation to the pre-change stylesheet.
- Nested local imports could be omitted: test recursive expansion with nested fixture imports.
- An import cycle could hang or recurse indefinitely: test cycle detection and fail with the import path.
- Unsupported or missing import targets could produce incomplete assertions: test that the helper rejects unresolved/non-local CSS imports.
- Test migration could lose existing CSS assertions: migrate every direct stylesheet read and run the complete frontend suite.

---

## File Structure

- `frontend/src/styles.css`: stable entry point; only ordered imports after extraction.
- `frontend/src/styles/`: 28 focused partials named in the spec, kept in original source order.
- `frontend/src/test/cssSource.ts`: shared `readCssSource(entryPath: string): string` helper that recursively expands quoted local CSS imports relative to the importing file.
- `frontend/src/test/cssSource.test.ts`: fixture-based tests for the helper's order, nested imports, duplicate imports, cycles, and unsupported/missing paths.
- Existing CSS-reading tests under `frontend/`: use `readCssSource` rather than reading the entry point as raw text.
- `frontend/css-size-baseline.json`: line-count baseline for current partials above the warning threshold; include documented exceptions only when needed.
- `scripts/check-frontend-css-size.cjs`: size-policy check for authored partials.
- `frontend/package.json`: `check:css-size` script.
- `.github/workflows/pipeline.yml` and `.github/workflows/trusted-pr-tests.yml`: run the size check in frontend CI.

## Task 1: Add CSS source reader and migrate source assertions

**Files:** Create `frontend/src/test/cssSource.ts` and `frontend/src/test/cssSource.test.ts`; modify every frontend test that reads `src/styles.css` directly (identify all with `rg -n 'readFileSync.*styles\.css' frontend`).

- [ ] Add failing tests for `readCssSource(entryPath)` that assert imports are expanded in written order, nested relative imports resolve from their parent file, duplicate imports remain duplicated, cycles fail clearly, and missing/remote imports fail clearly.
- [ ] Run `cd frontend && npx vitest run src/test/cssSource.test.ts`; confirm the new helper tests fail because the helper is not implemented.
- [ ] Implement `readCssSource(entryPath: string): string` in `frontend/src/test/cssSource.ts`. Read source files synchronously, replace each supported local quoted CSS import with its recursively expanded contents, and track the active import stack to report cycles.
- [ ] Run `cd frontend && npx vitest run src/test/cssSource.test.ts`; confirm all helper tests pass while the current monolithic stylesheet still returns its original source.
- [ ] Replace direct `readFileSync(...styles.css...)` calls in frontend tests with `readCssSource(...)`, preserving every existing assertion and each test's current entry path.
- [ ] Run `cd frontend && npm test`; confirm all current CSS source assertions pass before extraction.
- [ ] Commit the helper and test migration as `[Refactor] load CSS source through imports in tests`.

## Task 2: Extract the stylesheet in original order

**Files:** Modify `frontend/src/styles.css`; create the 28 partials under `frontend/src/styles/` as named in the design spec; update tests only if a migration missed a stylesheet read.

- [ ] Save the original `frontend/src/styles.css` contents to a temporary file outside the repository for a byte-for-byte comparison during this task.
- [ ] Extract each contiguous source section once into its corresponding partial. Keep every rule and comment in its original relative position; do not move late refinements beside earlier component rules.
- [ ] Replace the body of `frontend/src/styles.css` with imports for the 27 partials in the design spec's order. Keep `main.tsx` and `call-ui-preview.html` pointing to this entry file.
- [ ] Use `readCssSource("src/styles.css")` from the frontend directory and compare its output byte-for-byte with the saved original. Fix any missing, duplicate, altered, or reordered text until the comparison succeeds.
- [ ] Run focused CSS contract tests: `cd frontend && npx vitest run src/styles.integrity.test.ts src/styles.voice-channel.test.ts src/styles.voice-channel-layout.test.ts src/App.route-motion.test.ts`.
- [ ] Run `cd frontend && npm test`; confirm the full existing suite passes with the split files.
- [ ] Commit the extraction as `[Refactor] split frontend stylesheet by feature area`.

## Task 3: Add the frontend CSS size ratchet

**Files:** Create `frontend/css-size-baseline.json`, `scripts/check-frontend-css-size.cjs`, and `scripts/check-frontend-css-size.test.cjs`; modify `frontend/package.json`, `.github/workflows/pipeline.yml`, and `.github/workflows/trusted-pr-tests.yml`.

- [ ] Add Node test cases in `scripts/check-frontend-css-size.test.cjs` for: a new partial above 2,500 lines failing; a partial above 1,500 lines warning; growth to a baseline partial already above 1,500 lines failing unless an explicit exception is configured; and generated/vendor files being ignored.
- [ ] Run `node --test scripts/check-frontend-css-size.test.cjs`; confirm the new checker tests fail because the checker is not implemented.
- [ ] Implement the checker in `scripts/check-frontend-css-size.cjs` and record post-extraction line counts for partials already above 1,500 lines in `frontend/css-size-baseline.json`. Require each exception entry to state its reason.
- [ ] Run `node --test scripts/check-frontend-css-size.test.cjs`; confirm all size-policy tests pass.
- [ ] Add `npm run check:css-size` and invoke it in both frontend CI workflows after dependency installation and before the test/build steps.
- [ ] Run `cd frontend && npm run check:css-size`; confirm no current partial violates policy.
- [ ] Run `bash .github/workflows/pipeline.test.sh`; confirm workflow validation still passes.
- [ ] Commit the guard as `[Build] guard frontend stylesheet growth`.

## Final verification

- [ ] Run `cd frontend && npm test`.
- [ ] Run `cd frontend && npm run lint`.
- [ ] Run `cd frontend && npm run build`.
- [ ] Review `git diff --check` and the complete diff for exact source preservation, unchanged import order, no duplicated/missing rules, and no unrelated changes.
