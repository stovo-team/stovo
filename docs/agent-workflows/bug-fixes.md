---
title: "Bug and Issue Fixes"
type: workflow
---

# Bug and Issue Fixes

Use this workflow for every issue classified as a bug or defect, including production incidents and regressions.

1. Establish and document the reported behavior before changing code.
2. Add the smallest regression test that reproduces the issue at the layer where it occurs.
3. Run the new test and confirm it fails for the reported reason.
4. Make the focused fix.
5. Run the same regression test unchanged and confirm it passes.
6. Add broader coverage when the issue exposes a wider contract or boundary risk.

A bug or defect issue is not complete without its regression test. If an automated test cannot reproduce the issue at its original layer, add a deterministic test at the closest relevant layer. If no suitable regression test can be added or run, stop and report the blocker instead of treating the issue as fixed.

## Defects in okf-agent

When using or evaluating `okf-agent`, if you identify and confirm a defect in the agent's own behavior, open an issue in [`left-try/okf-agent`](https://github.com/left-try/okf-agent) with GitHub CLI (`gh`) outside the sandbox. First search that repository's existing issues to avoid duplicates, for example with `gh issue list --repo left-try/okf-agent --state all --search "<keywords>"`; then create the issue with `gh issue create --repo left-try/okf-agent --title "<short summary>" --body-file <issue-details-file>`. Include concise reproduction steps, expected and actual behavior, and the `okf-agent` version or commit when available. Remove secrets, private data, and unrelated user content. Do not file these defects in the Stovo repository. If `gh` is unavailable or the issue cannot be submitted, report the blocker and provide the prepared issue details instead.

Do not use the new-feature planning process for a focused bug fix. Use it only when investigation shows that the request is a behavior redesign or a materially new capability. Follow the shared [testing expectations](testing.md).

Approval scopes and existing authorization follow [human approvals](approvals.md); focused defects retain the regression-first route above.
