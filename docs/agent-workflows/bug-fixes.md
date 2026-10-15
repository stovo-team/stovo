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

Do not use the new-feature planning process for a focused bug fix. Use it only when investigation shows that the request is a behavior redesign or a materially new capability. Follow the shared [testing expectations](testing.md).
