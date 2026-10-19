---
title: "PR Review Findings"
type: workflow
---

# PR Review Findings

Use this workflow when reporting a defect or risk found while reviewing a pull request. A review comment should let the author understand and verify the finding without guessing what the reviewer saw.

## Write an actionable comment

1. Anchor the comment to the smallest changed line range that contains the cause. If the finding is not tied to the diff, report it as a separate follow-up instead of forcing an unrelated inline comment.
2. State the concrete condition that triggers the problem and the observable consequence. Separate confirmed behavior from a hypothesis.
3. Give enough reproduction or verification detail to check the claim: the relevant input or UI state, the affected route or component, and the test, command, trace, or observation that supports it.
4. Include evidence in the comment or attach it where the review system supports attachments. Keep it sanitized and directly relevant.

### Choose evidence that fits the finding

- **Visual or frontend behavior:** attach a screenshot or short recording whenever the reported state can be safely reproduced and captured. Include the viewport/device and the steps or state needed to reach it. For a visual regression, show the affected result and a useful comparison when available. If capture is unavailable or would not clarify the finding, describe the observed state precisely and explain why.
- **Non-visual behavior:** include a minimal reproduction, focused test name and result, sanitized request/response, relevant log or trace excerpt, or another artifact that demonstrates the behavior. Identify the command or environment when it affects the result.
- **Code-only risk:** point to the exact path through the code and explain the concrete input or state that makes it fail. A source citation alone is not evidence of runtime impact; use a focused test or a short reasoning trace when execution is impractical.

Do not attach evidence that contains credentials, private messages, personal data, or production data. Redact sensitive values while keeping the behavior reproducible.

## Include evidence when opening a PR

Put verification evidence in the PR description so reviewers can understand the change before reading the diff. For visual changes, include before-and-after screenshots or a short recording when the relevant UI can be safely reproduced; state the viewport/device and interaction shown. For non-visual changes, list the focused checks and results, or link a sanitized trace or reproduction artifact. For documentation-only changes, report the validation command and result; screenshots are unnecessary unless the docs change itself affects a rendered UI.

## Keep findings useful

- Lead with impact and severity, then explain the trigger and evidence. Prefer one finding per comment.
- Make the comment self-contained. Avoid vague statements such as “this is broken” or “please fix”; tell the author what fails and how to confirm it.
- Keep suggestions optional unless the fix is necessary to remove the reported defect. Do not turn style preferences or unverified suspicions into defect findings.
- If evidence is inconclusive, label the comment as a question or risk to investigate instead of asserting a confirmed bug.

## Decide whether to create an issue

Do not create a backlog issue automatically for every observation. Use an inline PR comment for a confirmed problem in the proposed diff; use the PR review itself for questions, narrow fixes, and findings the author can address in that change.

Create a separate issue only when the finding is confirmed, actionable, and outside the PR's agreed scope or needs independent tracking. Before creating it, search existing issues and avoid duplicates. Do not create issues for speculative concerns, preferences, or findings already being fixed in the PR. Handle suspected security vulnerabilities through the private reporting path in `SECURITY.md`, not a public issue.

When issue creation is authorized for the task, include a concise title, the affected behavior, impact, reproduction or verification steps, sanitized evidence, and any relevant PR link. Codex should report the proposed issue details for review before creating issues when the user has not authorized issue creation. Never treat a review finding by itself as authorization to create a public issue.

Review readiness and human decisions follow [approvals](approvals.md); no review finding grants publication or issue-creation permission by itself.
