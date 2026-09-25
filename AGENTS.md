# Engineering workflow: test-first, reviewed, and delegated

These instructions apply to every change in this repository unless the user explicitly waives a gate. Treat them as delivery requirements, not suggestions.

## 1. Define the work before changing production code

1. Restate the requested behavior as small, observable acceptance criteria.
2. Make a brief plan identifying affected components, test layers, ownership, and verification commands.
3. For each new or changed behavior, write or update the automated tests **before** its production implementation. Run them and record the expected initial failure (red) when practicable.

For a defect, first add a regression test that reproduces it. Do not merely patch the symptom.

## 2. Orchestrate non-trivial work

For changes with separable concerns, the orchestrator must delegate explicit, non-overlapping ownership:

- **Test/spec owner:** acceptance criteria and test cases, including edge cases.
- **Implementation owner:** minimum production change needed to make approved tests pass.
- **Independent reviewer:** reviews both tests and implementation and may block completion.

Give every agent its owned files or responsibility, known dependencies, and test command. Agents must preserve other agents' work and must not weaken, delete, skip, or rewrite a test merely to make a change pass without the test/spec owner's approval.

For a genuinely small, indivisible change, one agent may perform the TDD loop, but an independent review of the diff and tests is still required before declaring it done.

## 3. Isolate feature work in a worktree and deliver PRs

Every discrete feature, fix, or reviewable concern must be implemented in its own Git worktree, whether the work is done by the orchestrator or a subagent. Creating or switching to a new branch in the shared checkout is not sufficient isolation. Before implementation, create a new managed worktree with its own feature branch from a known clean base, then do all edits, tests, commits, and PR work for that concern inside that worktree. Do not make feature changes in the shared checkout, and never assign multiple agents to edit the same worktree concurrently.

The worktree must start from a clean base so it does not inherit unrelated working-tree changes or commits from another feature branch. Check the base checkout's status and the intended base revision before creating the worktree; if the base is dirty, do not carry those changes into the feature worktree. Preserve the dirty changes in their existing checkout and create the feature worktree from the clean base revision. If the current branch contains unrelated feature commits, use the appropriate clean base branch or commit rather than branching from it.

Use the repository's managed worktree workflow (for example, `git worktree add` with a new branch, or the Codex managed worktree tool) so each feature has a distinct directory and branch. Confirm the worktree path and branch before editing, and run all feature commands from that path.

- Name feature branches with the `left-try/` prefix unless the user specifies another convention.
- Treat worktrees as temporary. Reuse neither a finished feature worktree nor one with unknown changes.
- Retain a worktree while its PR is active so review feedback can be addressed. After the PR is merged or formally abandoned, remove the managed worktree safely and report that cleanup. Do not perform broad/manual filesystem deletion.

Each discrete feature or fix must have its own pull request, unless the user explicitly asks not to create one. The owning agent must push its branch and create the PR with:

- a clear title and summary of observable behavior;
- linked acceptance criteria and the tests that prove each one;
- commands run and their results, including known limitations;
- explicit reviewer request/comments addressing test quality and edge-case coverage.

The independent reviewer must leave actionable PR review comments for every finding and approve only after both implementation and tests satisfy this document. The implementing agent resolves review comments on its feature branch; it must not silently bypass them or fold unrelated work into the PR.

## 4. TDD loop

Repeat in small increments:

1. Add the smallest focused test for the next acceptance criterion.
2. Run it and confirm it fails for the intended missing behavior.
3. Implement only enough code to pass it.
4. Run the focused test, then the relevant suite.
5. Refactor only while the tests remain green.

Never add future functionality without its corresponding test. If a behavior cannot be tested automatically, document why, add the closest practical automated coverage, and request explicit user approval for the exception.

## 5. Test review is a release gate

Review test quality separately from production code. For each changed behavior, the reviewer must check that tests cover relevant:

- happy path and contract/output;
- empty, missing, null, malformed, and boundary inputs;
- error handling, retries/timeouts, and unavailable dependencies;
- state transitions, ordering, duplicate/idempotent operations, and concurrency where applicable;
- authorization, validation, and data isolation for user-facing or API changes;
- regressions at integration/E2E boundaries when the behavior crosses components.

Use deterministic tests: isolate time, randomness, network, storage, and external services. Assert meaningful outcomes rather than implementation details. Do not accept coverage percentages as a substitute for scenario coverage.

## 6. Completion criteria

Before reporting completion, the orchestrator must ensure:

1. Every acceptance criterion is linked to one or more passing tests.
2. The independent reviewer approved the tests and code, or all findings are resolved.
3. Focused and applicable full test suites pass, plus relevant lint, typecheck, build, and E2E checks.
4. Its feature PR contains the required description, test evidence, and resolved review feedback.
5. The final report lists the PR URL, test commands/results, reviewer findings, any approved coverage exceptions, and worktree-cleanup status.

If a required command cannot run, report the exact blocker and do not claim the change is fully verified.
