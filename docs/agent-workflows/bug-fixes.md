---
title: "Bug and Issue Fixes"
type: workflow
---

# Bug and Issue Fixes

Use this workflow for every issue classified as a bug or defect, including production incidents and regressions.

1. **Establish and actively reproduce the reported behavior before changing code.**
   - For frontend and UI bugs:
     - Start the local mock server: `npm --prefix frontend run dev:mock` (serves the real application with synthetic data on `http://127.0.0.1:5174`).
     - Actively reproduce the reported error on the running mock server: navigate to the affected route/view, set the reported viewport dimensions, light/dark theme, locale, and trigger the interaction.
     - Confirm the defect occurs visually or interactively.
     - Capture the genuine **BEFORE** screenshot showing the defect in action directly from the running mock server, and save it under `docs/agent-workflows/evidence/<task>/` (or `e2e/visual/evidence/<task>/`).
2. **Add the smallest regression test that reproduces the issue at the layer where it occurs.**
3. **Run the new test and confirm it fails for the reported reason.**
4. **Make the focused fix.**
5. **Run the same regression test unchanged and confirm it passes.**
6. **Verify the fix against the running mock server and capture the AFTER screenshot.**
   - Confirm the defect is resolved on `http://127.0.0.1:5174` under identical conditions (matching viewport, theme, locale, and interaction).
   - Capture the genuine **AFTER** screenshot.
7. **Embed real screenshots in the pull request description.**
   - Embed real screenshots using Markdown images (`![Caption](url)`) or direct viewable image links to committed assets.
   - Both before and after screenshots must be distinct real images demonstrating the transition from broken to fixed.
   - NEVER use bare text file paths in code backticks (such as `` `e2e/visual/...png` ``) or fake text placeholders like `(prior)`.
8. **Add broader coverage when the issue exposes a wider contract or boundary risk.**

A bug or defect issue is not complete without its regression test and verified reproduction. If an automated test cannot reproduce the issue at its original layer, add a deterministic test at the closest relevant layer. If no suitable regression test can be added or run, stop and report the blocker instead of treating the issue as fixed.


## Defects in okf-agent

When using or evaluating `okf-agent`, if you identify and confirm a defect in the agent's own behavior, open an issue in [`left-try/okf-agent`](https://github.com/left-try/okf-agent) with GitHub CLI (`gh`) outside the sandbox. First search that repository's existing issues to avoid duplicates, for example with `gh issue list --repo left-try/okf-agent --state all --search "<keywords>"`; then create the issue with `gh issue create --repo left-try/okf-agent --title "<short summary>" --body-file <issue-details-file>`. Include concise reproduction steps, expected and actual behavior, and the `okf-agent` version or commit when available. Remove secrets, private data, and unrelated user content. Do not file these defects in the Stovo repository. If `gh` is unavailable or the issue cannot be submitted, report the blocker and provide the prepared issue details instead.

Do not use the new-feature planning process for a focused bug fix. Use it only when investigation shows that the request is a behavior redesign or a materially new capability. Follow the shared [testing expectations](testing.md).

Approval scopes and existing authorization follow [human approvals](approvals.md); focused defects retain the regression-first route above.
