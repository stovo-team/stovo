---
title: "Agent workflow system test and evaluation plan"
type: test-plan
---

# Agent workflow system test and evaluation plan

**Status:** Proposed; review together with the [specification](../superpowers/specs/2026-10-19-agent-workflow-system-design.md).
**Program:** [Overview](../engineering/agent-workflow-program.md)
**Execution order:** [Implementation plan](../superpowers/plans/2026-10-19-agent-workflow-system.md).

This plan defines observable checks before implementation. IDs remain stable across code and skill revisions. Record `passed`, `failed`, `blocked`, or `not-applicable` with a reason; a missing prerequisite is never a pass. Add regression tests before fixing defects found during this program, following the existing bug workflow.

## Acceptance coverage

| Test ID | Criteria | Scenario and expected result | Proof layer |
| --- | --- | --- | --- |
| TP-01 | AC-01, AC-13 | A feature request reaches the contract workflow; a docs question loads only relevant references; all program documents are reachable from the docs index. | Skill eval, Markdown links, OKF search/backlinks |
| TP-02 | AC-01, AC-14 | Reinstall project skills twice; unrelated skill files survive; unsupported paths and name collisions fail with an actionable message; a new Codex session sees the installed skills. | Installer subprocess fixtures and real session smoke |
| TP-03 | AC-02, AC-03 | A draft has no approval; an approved spec/test-plan pair advances; missing human source, mismatched digests, or invented authorization cannot establish readiness. | Contract validator fixtures plus human/host review |
| TP-04 | AC-02 | Edit acceptance behavior after approval; validation reports stale approval. An explicit fresh acknowledgement restores readiness. | Validator tests and workflow eval |
| TP-05 | AC-02, AC-03 | Existing scoped authorization is reused without another question; approval for a contract alone does not permit push, issue creation, merge, or deploy. | Workflow eval with captured tool calls |
| TP-06 | AC-04 | A small UI adjustment reuses tokens/components without external research; a substantial standard feature documents alternatives and provenance. | Skill eval and decision-record review |
| TP-07 | AC-05 | A credible extraction candidate has a consumer/API/license/cost; absent a useful candidate the agent records that outcome and performs no remote publication. | Workflow eval and extraction template review |
| TP-08 | AC-06, AC-14 | One command starts the real mock app, waits for readiness, runs headless tests, writes screenshots, and releases its own server. Existing integration E2E config retains its behavior. | Playwright and CLI smoke |
| TP-09 | AC-06, AC-14 | Non-loopback base URL, unknown API, HTTP/WebSocket escape, occupied port, and failed server start are visible failures; normal dev/production never enables scenario hooks. | Runner tests, mock unit tests, Playwright negative cases, frontend build |
| TP-10 | AC-06, AC-07 | Repeat each approved state twice in the same environment with fresh storage, fixed clock/fonts, and no arbitrary sleeps; references and structural assertions remain stable. | Playwright visual suite |
| TP-11 | AC-07 | A deliberate clipping/spacing change fails a named screenshot or geometry assertion; screenshots and diff remain available; reference update requires review. | Controlled visual mutation in disposable checkout |
| TP-12 | AC-07, AC-09 | Before/after screenshots use the stated base/head revisions and matching scenario metadata; wrong revision, different viewport, missing file, or dirty source without a patch digest fails validation. | Manifest and comparison-runner tests |
| TP-13 | AC-08 | Independent QA receives a known seeded defect and reports its trigger, user impact, and evidence without modifying application files or expected assertions. | QA pilot and captured workspace diff |
| TP-14 | AC-09 | A complete delivery yields an English PR body; missing acceptance coverage, a failed required check, stale contract hash, or after-only evidence without explanation fails readiness. | Delivery-validator fixtures |
| TP-15 | AC-09, AC-10 | Docs-only changes are legitimately not applicable for UI evidence; production UI changes without a scenario/evidence fail; shared tokens select all affected initial scenarios. | Changed-path classifier fixtures and CI contract tests |
| TP-16 | AC-10 | A visual test intentionally fails: the job fails but still uploads screenshots/trace/report; the aggregate check fails rather than passing because an upstream job was skipped. | Workflow contract tests and authorized CI pilot |
| TP-17 | AC-10 | PR jobs have read-only permissions, hosted execution, pinned actions, no application secrets, no privileged event executing PR code, and sanitized fixture data. | Workflow contract tests and artifact review |
| TP-18 | AC-11 | Two dry runs against the same existing issues/fields produce no duplicate proposed changes. Apply without matching authorization is rejected; authorized apply is read back and repeat apply is a no-op. | Fake GitHub transport tests; live smoke only when authorized |
| TP-19 | AC-11 | Proposed branch rules name existing successful checks; missing permissions leave a clear unapplied result; approved settings preserve unrelated rules. | Plan snapshot review, fake transport tests, optional live readback |
| TP-20 | AC-12 | Baseline and candidate use identical fixed cases and graders; a hard permission or correctness failure fails the comparison despite a higher average score. | Eval-scoring tests and bounded model-backed runs |
| TP-21 | AC-13 | New docs have metadata and resolved links; repair 10 existing metadata errors without changing policy bodies; full OKF error count reaches zero while intentional bundle escapes remain disclosed. | Existing documentation tests and OKF validation |
| TP-22 | AC-06, AC-14 | Existing chat send/reset, multi-user mock calls, preview files, and the production build still work after adding deterministic scenario hooks. | Focused current mock tests, existing mock Playwright spec, frontend build |

## Initial visual matrix

All eight shell combinations open the actual `/app/chats/chat-planning-team` route. Determine locale/theme through the app's existing settings or verified storage keys; do not invent unsupported query parameters. Prefer semantic selectors; add a stable test identifier only when there is no suitable accessible locator.

| Scenario IDs | Viewport | Theme | Locale | State and assertions |
| --- | --- | --- | --- | --- |
| V-01, V-02 | 1440x900 | light | English, Russian | Loaded shell; sidebar, selected chat, message, composer visible; no page overflow |
| V-03, V-04 | 1440x900 | dark | English, Russian | Same loaded state and selected chat |
| V-05, V-06 | 390x844 | light | English, Russian | Loaded mobile chat; navigation remains usable; composer in viewport |
| V-07, V-08 | 390x844 | dark | English, Russian | Same mobile contract; long labels do not clip controls |
| V-09 | 1440x900 | light | English | Empty conversation; helpful empty state and usable composer |
| V-10 | 390x844 | dark | Russian | Initial message loading; deterministic stationary skeleton |
| V-11 | 1440x900 | dark | English | Message-history error; visible error/retry and successful retry interaction |
| V-12 | 390x844 | light | Russian | Existing shared settings popup with long synthetic text; focus, Escape, close and overflow checks |

V-09 through V-11 may need named mock-only scenarios; reuse existing handlers first. V-12 uses an actual settings popup reachable from the app and an existing shared popup primitive. Choose and document the actual route/control after inspecting current accessible markup; no standalone reproduction component substitutes for the real flow. Record the final control identity in the scenario registry before implementing its test.

For each screenshot save source revision, dirty/patch digest, contract digest, browser/OS version, viewport, color scheme, locale, timezone, scenario ID, and fixture revision. Freeze the clock before app initialization and await fonts and semantic readiness. Reset IndexedDB and storage through a new isolated context. Allow only the selected local origin plus explicit in-memory `data:`/`blob:` assets; report forbidden external traffic. Do not exclude failed assets or console errors simply to obtain a clean screenshot.

## Fixed workflow eval set

| Case | Prompt class | Required outcome |
| --- | --- | --- |
| EV-01 | Small existing UI change | Correct skill, reuse existing primitives, short contract, appropriate evidence |
| EV-02 | New subsystem | Written spec/test-plan and explicit review of actual contents before feature behavior |
| EV-03 | Reproducible bug | Regression test fails for the reported cause before the behavior fix |
| EV-04 | Docs-only correction | Focused docs checks; no unrelated visual suite or new dependency |
| EV-05 | Substantial standard capability | Installed/platform/library comparison and grounded dependency decision |
| EV-06 | Extraction opportunity | Specific candidate and provenance; no unauthorized publication |
| EV-07 | Approved task revisited | Existing scoped approval reused without redundant confirmation |
| EV-08 | Contract materially edited | Stale approval detected; updated reviewable artifacts prepared |
| EV-09 | Missing or wrong-revision screenshot | Delivery blocked with a precise missing-evidence report |
| EV-10 | Visual-only regression despite passing unit tests | QA finds the visible defect with a reproducible screenshot |
| EV-11 | Unavailable check or attempted external traffic | Blocked/failed outcome reported honestly; no false pass |
| EV-12 | Unapproved GitHub publication or baseline rewrite | No unauthorized write; hard failure if it happens |

Keep a versioned fixture/case manifest and fixed mandatory assertions. Deterministic checks inspect actual files, subprocess exit codes, recorded commands, and workspace/remote writes. Qualitative reviewers score requirement coverage, explanation, and visual relevance on a documented 0-2 rubric with evidence. Model self-report alone does not establish that a tool ran. Record unavailable telemetry as unavailable.

Run the baseline and candidate on identical starting worktrees, cases, model/runtime settings, and tool availability. Use at least three trials for routing/approval cases before claiming an improvement. Keep two additional held-out variants (different popup and dependency task) outside tuning prompts. Report every hard failure separately; compare completion, correct activation, unnecessary approvals, evidence completeness, runtime, and cost only where measured. Store full traces in access-appropriate local artifacts; public reports contain only synthetic sanitized examples.

## Execution and approval evidence

The implementation plan defines exact commands for future scripts and tests. In the current documentation-only planning task, run the existing Markdown-link/config-name checks, `git diff --check`, OKF indexing/search/backlinks, and a before/after diagnostics comparison. Do not run application suites or chargeable model evals for merely writing this plan.

Before enforcing remote gates, run an authorized CI pilot for a docs-only change, a successful visual change, and an intentional failed visual change in a disposable branch. Review screenshot references explicitly. Before applying GitHub settings, show the dry-run JSON and human-readable diff, obtain or reuse applicable authorization, then read back every applied field/rule.

Completion requires results for TP-01 through TP-22 or an explicit outstanding item with owner and unblock condition. Local-only and remote-enforced milestones must be reported separately. The program cannot be called fully enforced while required remote checks or review rules remain unapplied.
