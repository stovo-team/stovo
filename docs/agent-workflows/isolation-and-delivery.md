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
- Commit every completed task on its dedicated branch. Once publishing is authorized, submit a pull request targeting `master` (or a documented predecessor branch for a dependent PR; retarget `master` after it merges) and report its link and status; never push directly to `master`. If publication is not authorized or a remote pull request cannot be created, keep the local branch and worktree and report the blocker.
- Group a pull request around one coherent section of work. Keep each PR focused. Split larger work into coherent PRs; do not hide changes in baselines or exclusions.
- Use a clear, descriptive commit message. Pull request titles must use one of these exact prefixes: `Feature:`, `Fix:`, `CritFix:`, `Test:`, `Docs:`. Match the primary commit message, replacing its square-bracket category with the corresponding colon prefix (for example, `[Docs] clarify workflow` becomes `Docs: clarify workflow`).
- Write pull request titles, descriptions, and comments in English. Do not assign or request reviewers by default. Add an appropriate label to every pull request. Link issues and projects only when they exist; do not invent associations.
- Explain the logical change, why it is needed, and relevant verification in the description.

### Stacked pull requests (PR stacks)

When a task, feature, or refactoring requires substantial code changes (targeting near or below 300–400 lines, and strictly capped at a large change), or when changes naturally span multiple architectural boundaries, partition the work into a logical stack of pull requests.

#### Logical partitioning
Decompose the changes into coherent, independently testable slices:
1. **Foundations, Schemas & Contracts**: Specifications, database schema migrations, interface types, and design tokens.
2. **Core Domain & Backend Logic**: Business rules, service logic, API routes, and unit/integration tests.
3. **Frontend & UI Surfaces**: UI components, styling, page layouts, client state, and component tests.
4. **Integration, End-to-End Tests & Documentation**: Browser journeys, visual regression evidence, workflow/user docs, and final feature enablement.

For refactoring tasks, partition into: preparatory abstractions/helpers -> caller migrations/behavior changes -> cleanup of deprecated paths.

#### Branching and stack creation
- The first PR in the stack branches from `origin/master` and targets `master`.
- Each subsequent PR branches from its immediate predecessor branch: `git checkout -b feature/<task>-part2 feature/<task>-part1`.
- When opening the dependent PR, set its base to the predecessor branch (`--base feature/<task>-part1`). GitHub evaluates the line budget against that base branch, keeping each PR focused.
- Leverage GitHub's native stacked PR features ("Preview stack" / "Create stack") to group and visualize the pull requests in the stack.
- In each PR description, include bidirectional stack links (e.g. `Part of stack: #354 -> #356 -> #357`).

#### Merging and retargeting
- Merge pull requests sequentially from base to top (bottom-up).
- When a predecessor PR merges into `master`, retarget the immediate successor PR to `master` (or its updated predecessor branch if intermediate PRs remain). Verify all required CI checks on the updated base before merging.

## Worktree cleanup

- After the pull request is confirmed merged, remove its task worktree and local branch.
- Never delete an unmerged branch or a worktree with uncommitted changes.
- Target cleanup immediately after merge. Treat 30 days without activity as stale and inspect/report it; do not automatically discard unmerged work or data.
- Retain intentionally open work. If there is no remote pull request or the user asks to keep the result locally, retain the branch and worktree until the user confirms they are no longer needed.

## Review readiness

Use [human approvals](approvals.md) for action scopes and freshness. A delivery includes acceptance coverage, exact checks/results, independent QA where required, and before/after evidence for visual behavior. Prepare a self-contained English PR description and a short manual review scenario before requesting publication. Existing publication authorization applies within its stated scope.

Use [dependency and reusable-code assessment](dependency-and-reuse.md) when substantial capability or extraction is involved.

From the repository root, `node scripts/agent-workflows/validate-delivery.mjs --contract <contract.json> --evidence <evidence.json> --qa <qa.json> --changed-paths <paths.json>` verifies current source-bound readiness. Generate the English description with `node scripts/agent-workflows/render-pr.mjs --packet <packet.json> --output <body.md>`. Both operate locally and perform no publication. Delivery paths are derived from Git against the merge-base with `origin/master` (or an explicitly trusted `--target` ref); evidence cannot select its own smaller base. QA and test evidence must cover the actual dirty patch as well as HEAD. Remote evidence uses actual HTTPS artifact links; keep publication-pending local outputs clearly labelled. Use the [delivery template](templates/delivery-packet.md). Follow [GitHub planning](github-projects.md) for authorized issue, Project, milestone, and branch-ruleset updates.

Publication and live CI verification follow [GitHub delivery](github-delivery.md). Implementation tasks include task-branch publication unless the user requests local-only work; merge and deployment remain separate scopes.
