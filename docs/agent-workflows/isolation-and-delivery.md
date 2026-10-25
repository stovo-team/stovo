---
title: "Task Isolation and Delivery"
type: workflow
---

# Task Isolation and Delivery

## Branch and worktree

- Never develop directly on `master` or on a user's unrelated feature or pull-request branch.
- Before editing, create a dedicated branch from the appropriate base and a separate Git worktree. Use Gitflow names: `feature/<short-task-name>` for new capabilities, `hotfix/<short-task-name>` for urgent fixes, and `release/<version>` for release preparation.
- Keep the primary checkout clean. Do not move or modify the user's unrelated changes.
- Complete and verify the requested work in the task worktree.

## Commits and pull requests

- Each commit should represent one small, complete task. A pull request may contain several task-sized commits when they belong to the same logical section.
- Commit every completed task on its dedicated branch. Once publishing is authorized, submit a pull request targeting `master` and report its link and status; never push directly to `master`. If publication is not authorized or a remote pull request cannot be created, keep the local branch and worktree and report the blocker.
- Group a pull request around one coherent section of work. Keep it small, normally no more than 300–400 changed code lines; split larger work into independently reviewable pull requests with clear dependencies.
- Use a clear, descriptive commit message. Pull request titles must use one of these exact prefixes: `Feature:`, `Fix:`, `CritFix:`, `Test:`, `Docs:`. Match the primary commit message, replacing its square-bracket category with the corresponding colon prefix (for example, `[Docs] clarify workflow` becomes `Docs: clarify workflow`).
- Write pull request titles, descriptions, and comments in English. Do not assign or request reviewers by default. Add an appropriate label to every pull request. Link issues and projects only when they exist; do not invent associations.
- Explain the logical change, why it is needed, and relevant verification in the description.

## Worktree cleanup

- After the pull request is confirmed merged, remove its task worktree and local branch.
- Never delete an unmerged branch or a worktree with uncommitted changes.
- Target cleanup immediately after merge. Treat 30 days without activity as stale and inspect/report it; do not automatically discard unmerged work or data.
- Retain intentionally open work. If there is no remote pull request or the user asks to keep the result locally, retain the branch and worktree until the user confirms they are no longer needed.

## Review readiness

Use [human approvals](approvals.md) for action scopes and freshness. A delivery includes acceptance coverage, exact checks/results, independent QA where required, and before/after evidence for visual behavior. Prepare a self-contained English PR description and a short manual review scenario before requesting publication. Existing publication authorization applies within its stated scope.

Use [dependency and reusable-code assessment](dependency-and-reuse.md) when substantial capability or extraction is involved.

From the repository root, `node scripts/agent-workflows/validate-delivery.mjs --contract <contract.json> --evidence <evidence.json> --qa <qa.json> --changed-paths <paths.json>` verifies current source-bound readiness. Generate the English description with `node scripts/agent-workflows/render-pr.mjs --packet <packet.json> --output <body.md>`. Both operate locally and perform no publication. Delivery paths are derived from Git against the merge-base with `origin/master` (or an explicitly trusted `--target` ref); evidence cannot select its own smaller base. QA and test evidence must cover the actual dirty patch as well as HEAD. Remote evidence uses actual HTTPS artifact links; keep publication-pending local outputs clearly labelled. Use the [delivery template](templates/delivery-packet.md). Follow [GitHub planning](github-projects.md) for authorized issue, Project, milestone, and branch-ruleset updates.
