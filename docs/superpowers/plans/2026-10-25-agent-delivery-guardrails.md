---
title: "Agent delivery guardrails implementation plan"
type: implementation-plan
---

# Agent delivery guardrails implementation plan

Goal: implement the user's 2026-10-25 request for a hard 445-line PR limit, real CI verification, maintained OKF knowledge, discoverable project skills and backend impact proof for smaller agents.
Architecture: independent changes in existing Node tooling, GitHub Actions and canonical Markdown. Each PR stays within 445 added/deleted lines. The user's implementation request authorizes task-branch publication with gh outside the sandbox; merge/deployment remain separate.

| Acceptance | Deliverable | Proof |
| --- | --- | --- |
| AC-01 | Reject 446 lines, accept 445, count every file; expensive CI depends on gate | Execute actual workflow program against boundary, API-error and stale-head fixtures |
| AC-02 | Watch all current-head CI cells after every publication, excluding CodeQL | Queued/empty/red/skipped/legacy-status/head-change/timeout fixtures; actual PR status readback |
| AC-03 | OKF task-start/task-finish commands and Git lifecycle hooks maintain wiki/search | Real installed CLI integration tests; doctor/index/docs checks |
| AC-04 | Version project skills and supply focused context/handoff paths; preserve Ponytail and Matt Pocock specialized routing | Installer/discovery tests, exact upstream/source inspection and link validation |
| AC-05 | Backend evidence records same-input before/after observations and source-bound artifacts; fix actual evidence gate defects | Regression-first validator/source-path/cleanup tests; real recording command |

- [ ] Add and run new failing regression tests for AC-01/02, then implement reusable metadata gate and bounded gh watcher.
- [ ] Implement AC-03/04/05 in independent task worktrees with focused red/green tests and commits.
- [ ] Review each diff, run relevant tooling/link checks, count remote additions/deletions, publish coherent PRs and inspect actual CI.

Review focus: no empty-status false green; moving heads invalidate settled results; path renames preserve applicability; synthetic evidence cannot establish production impact; private-plan restrictions cannot be presented as installed branch protection.
