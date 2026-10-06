# Agent workflow

## Isolated work for every task

- Never develop directly on `master` or on a user's unrelated feature/PR branch. This rule applies to every task, including hotfixes and small fixes.
- Before editing, create a dedicated branch from the appropriate base and a separate Git worktree for that branch. Name task branches in Gitflow style: `feature/<short-task-name>` for new capabilities, `hotfix/<short-task-name>` for urgent fixes, and `release/<version>` for release preparation. Keep the primary checkout clean and do not move the user's unrelated changes.
- Complete the requested work and verification in that worktree. When the work is ready for review, create a PR from the task branch and report its link/status.
- After the PR is confirmed merged, remove the task worktree and its local branch. Never delete an unmerged branch or worktree containing uncommitted changes.
- Worktree lifetime (TTL): target cleanup immediately after merge. Treat 30 days without activity as stale and inspect/report it; do not automatically discard unmerged work or data. If a task is intentionally kept open longer, retain its worktree and branch.
- If a task has no remote PR or the user asks to keep the result locally, retain the branch/worktree until they confirm it is no longer needed; do not push or publish without authorization.

## Pull request naming

- Every completed task must be committed on its dedicated task branch and submitted as a pull request targeting `main`. Do not push directly to `main`; the repository owner reviews and merges pull requests manually.
- Organize pull requests around one coherent logical section of work. Keep each pull request small, normally no more than 300–400 changed lines of code. If the work exceeds that size, split it into independently reviewable pull requests with clear logical boundaries; coordinate dependencies in their descriptions.
- Each commit should represent one small, complete task and use a clear, descriptive message. A pull request may contain multiple task-sized commits when they all contribute to its single logical section.
- Use one of these exact pull request title prefixes: `Feature:`, `Fix:`, `CritFix:`, `Test:`, or `Docs:`. The pull request title should match its primary commit message, replacing the commit message's square-bracket category with the corresponding colon prefix (for example, `[Docs] clarify review workflow` becomes `Docs: clarify review workflow`).
- Write pull request titles, descriptions, and comments in English.
- Do not assign or request pull request reviewers by default. Add an appropriate label to every pull request. Link the relevant issue and project when applicable; do not invent issue or project associations when none exists.
- Include a concise explanation of the logical change, why it is needed, and any relevant verification in the pull request description.
- Do not publish changes without authorization. When authorized to push and open a pull request, report its link and status. If a remote pull request cannot be created, retain the branch and worktree and report the blocker.

## New features: test-driven development

For a new feature or a materially new user-visible capability, work in this order:

1. Write a feature plan that states the user problem, scope, observable behavior, constraints, and important design decisions.
2. Write a test plan that enumerates the user scenarios, edge cases, security properties, and the test layer that will prove each behavior.
3. Implement the planned tests before implementing feature behavior. Run them and confirm that the relevant tests fail for the expected missing behavior (the red step).
4. Implement the smallest coherent change that makes the tests pass (the green step).
5. Refactor while keeping the tests green, then run the relevant broader checks and review the test plan for omissions.

Keep the feature plan and test plan reviewable before beginning implementation. Tests should specify externally observable contracts where possible; avoid tests that merely mirror private implementation details. Use unit/component tests for local rules and UI states, integration tests for persistence, HTTP and transaction boundaries, end-to-end tests for critical cross-device user journeys, and property-based or fuzz tests where broad input spaces or parser/protocol robustness justify them. Do not add every test style mechanically: each test must cover a stated risk or invariant.

## Bug fixes: reproduction-first workflow

Bug fixes follow a separate, narrower workflow. First establish the reported behavior and write the smallest regression test that reproduces it at the layer where it occurs. Confirm that this test fails for the reported reason, make the focused fix, and confirm the regression test passes. Add broader coverage only when the bug exposes a wider contract or boundary risk. A bug fix does not require a new-feature plan and exhaustive test-plan document unless the investigation shows that the requested change is actually a new capability or a behavior redesign. Do not use the feature TDD process to delay a focused fix with unrelated planning.

## General test expectations

- Never weaken or delete a test simply to get a passing suite; revisit the expected behavior with the requester when a contract must change.
- Prefer deterministic tests with injected clocks, randomness, and external-service boundaries.
- Keep integration and end-to-end tests isolated from production data and credentials.
- Use fuzzing and property-based tests for invariants over many inputs, not as a substitute for named examples of important user behavior.
- Follow `CONTRIBUTING.md` for available commands and environment setup; do not run checks that the user has not asked for.
