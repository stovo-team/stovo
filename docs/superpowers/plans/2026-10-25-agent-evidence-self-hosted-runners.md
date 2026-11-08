---
title: "Agent Evidence Self-Hosted Runner Plan"
type: engineering-plan
---

# Agent Evidence Self-Hosted Runner Plan

**Goal:** Reduce reliance on GitHub-hosted runners for agent-workflow checks by using the available Windows self-hosted runner where its platform does not affect the result.

**Scope:** Route the `changes`, `validators`, and `aggregate` jobs in `.github/workflows/agent-evidence.yml` to the Windows `tests` runner for ready pull requests from this repository. Keep draft and fork pull requests on disposable hosted workers. Keep `visual` on Linux-hosted runners because approved references are Linux-specific.

**Constraints:** The workflow remains read-only and uses `pull_request`; self-hosted jobs must not process fork or draft PR code. Preserve the existing visual comparison environment and all aggregate gate behavior. This routing does not remove the hosted Linux dependency for visual PRs.

**Test plan:** Extend `.github/agent-workflows-ci.test.mjs` to require the guarded Windows runner expression on the three platform-independent jobs, verify visual stays on `ubuntu-24.04`, and retain checks for read-only permissions, pinned actions, and head-SHA checkout. Run that focused test, the complete agent-workflow/evidence suite, and `git diff --check`.

**Implementation:** Add the routing regression assertion first, confirm it fails against the current workflow, then update the runner expressions and verify the listed checks.
