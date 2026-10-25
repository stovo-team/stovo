---
title: "Independent acceptance QA"
type: workflow
---

# Independent acceptance QA

Review one coherent delivery in a fresh context against its approved spec/test matrix, exact diff/source revision and runnable isolated environment. Give the reviewer self-contained inputs and the required checks; the author's summary is supporting context, not the acceptance authority. Use additional reviewers only for genuinely independent scopes.

The reviewer reports concrete trigger, impact, path/line and reproduction evidence for each finding, plus missing acceptance coverage and unavailable checks. Separate observations, hypotheses and confirmed defects. Use the [QA report template](templates/qa-report.md). Inspect visual artifacts and meaningful error, keyboard, responsive and permission states. A green unit suite alone is not visual acceptance.

Run the headless scripts under [frontend evidence](frontend-evidence.md). Keep application behavior and expected results unchanged during review. If a new reproduction test is useful, return a patch or write it in an assigned isolated checkout; the implementer integrates the fix with red→green proof. A failed mandatory check cannot be waived by a favorable qualitative score. Record all limitations.

The installed Playwright 1.62.1 planner/generator definitions rely on browser-tool navigation/setup; they are optional inputs, not the default here because this workflow uses scripted headless tests. Their scenario-planning guidance is useful. The bundled healer permits marking persistent failures fixme; that conflicts with this repository's mandatory-check contract and must not be adopted as a blanket repair policy. Test-selector/setup repairs preserve original acceptance assertions and have an explained diff.

Follow [approvals](approvals.md) for permissions and [review findings](pr-review-findings.md) for comments/issues. Findings do not authorize remote publication. A local QA record documents who reviewed which contents; readiness remains bound to actual checked source and trusted review evidence.

For backend or deployment behavior, use [backend impact evidence](backend-evidence.md) to compare actual before/after results, bind execution receipts and review their limitations.
