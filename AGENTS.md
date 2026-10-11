# Agent Instructions

These instructions apply to every task. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for repository setup and available development commands.

## Rules for every task

- Work on a dedicated task branch and worktree. Keep the primary checkout clean and preserve unrelated changes. See [task isolation and delivery](docs/agent-workflows/isolation-and-delivery.md).
- Every bug or defect issue fix must include a regression test that reproduces the reported problem. Add and run that test before changing behavior; do not mark the issue complete without it. Follow [bug-fix workflow](docs/agent-workflows/bug-fixes.md).
- Never weaken or delete a test to make a change pass.
- Keep changes focused and preserve unrelated work.
- Do not push, publish, merge, or open a pull request without authorization.
- After authorization, create pull requests with `gh` outside the sandbox and record their URLs in the Active pull requests section below.

## Workflows

Read the applicable guide before editing:

| Work | Guide |
| --- | --- |
| New feature or materially new user-visible behavior | [Feature development](docs/agent-workflows/feature-development.md) |
| Bug, defect, incident, or regression fix | [Bug fixes](docs/agent-workflows/bug-fixes.md) |
| Test selection and verification expectations | [Testing](docs/agent-workflows/testing.md) |
| Branches, worktrees, pull requests, and cleanup | [Task isolation and delivery](docs/agent-workflows/isolation-and-delivery.md) |

## Verification

Run the focused checks required by the applicable workflow and relevant commands from CONTRIBUTING.md. Report the commands and results, including any required check that could not be run. Avoid unrelated checks.

## Active pull requests

- Chat import/export V1: https://github.com/stovo-team/stovo/pull/164
