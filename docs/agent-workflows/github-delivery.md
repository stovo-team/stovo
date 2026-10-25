---
title: "GitHub delivery and live CI"
type: workflow
---

# GitHub delivery and live CI

Implementation requests include publishing the focused task branch and opening/updating its PR, unless the user explicitly requests local-only work. Review-only tasks do not publish changes. Merge and deployment require separate authorization.

1. Verify the task branch, exact diff, regression/acceptance evidence and relevant checks. Keep each PR at most **445 additions + deletions** across every file; generated files, tests, documentation and lockfiles count. Use the GitHub PR metadata count as the remote authority. Split coherent work before publication.
2. Run `gh` outside the sandbox using the host's escalation mechanism. Resolve the actual target with `gh repo view --json nameWithOwner,defaultBranchRef`; this checkout's old origin redirects to `stovo-team/stovo`. Use that explicit `--repo` for reads and writes. Keep credentials out of logs.
3. Outside the sandbox run `node scripts/agent-workflows/pr-ci.mjs --publish --repo <owner/repo> --branch <branch> --title "<prefix>: <behavior>" --body-file <body.md>`. This verifies the repository/branch and local size, pushes, creates or updates the PR with `gh`, then immediately watches CI. Attach its URL through the host's artifact tool when available. Publication is a required delivery step under the standing authorization above.
For a dependent PR, pass `--base <predecessor-branch>` and link its PR. Its 445-line budget is measured against that base. Retarget `master` after the predecessor merges.

4. Immediately inspect all current-head checks outside the sandbox:

   ```sh
   node scripts/agent-workflows/pr-ci.mjs --repo stovo-team/stovo --pr <number>
   ```

   The watcher reads actual `gh pr view` status cells and head SHA, waits for two identical settled snapshots, and explicitly reports ignored CodeQL and conditional skips. `PR size`, `Pipeline Contract` and `Agent workflow gate` must succeed. A skipped job is not claimed as executed. Missing checks, only skipped/CodeQL checks, queued/running or unknown results remain pending. API errors fail closed; a timeout is a blocker, never green.
5. On failure inspect `gh pr checks` and `gh run view <run-id> --log-failed`, reproduce the cause and fix it on the same task branch. Preserve acceptance assertions. Push, then run the watcher again for the new head. An old green run cannot verify a new push. In the final response link the PR and state its actual CI result and any external blockers.

Use `--once` for a compact read-only snapshot. Default watching is bounded to 45 minutes; use `--timeout-seconds` to set a deliberate bound. If an external queue/outage persists, report the exact pending jobs and links and continue through an authorized follow-up instead of marking complete.

The reusable [PR size policy](../../.github/workflows/pr-size.yml) reads GitHub metadata without executing PR code. Trusted PR discovery and costly CI wait for that policy. It uses trusted base-branch `pull_request_target` code only; first activation requires merging this workflow. The introducing PR has local regression evidence, not a claim that the new gate already ran remotely. An over-limit or stale/unknown PR fails the check.

A failing check prevents agent acceptance. Server-side merge enforcement additionally needs GitHub branch protection/rulesets. On 2026-10-25 this private repository's rules API returned HTTP 403 requiring a plan upgrade; a workflow alone cannot prevent a human bypass. After that capability is enabled, require `PR size` and `Agent workflow gate`, preserve existing stricter checks/reviews, and verify the rules by readback using the [administration workflow](github-projects.md). Do not claim those remote rules exist until verified.
