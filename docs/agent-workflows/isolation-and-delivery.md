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
