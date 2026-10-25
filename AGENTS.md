# Agent Instructions

These instructions apply to every task. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for repository setup and available development commands.

## Rules for every task

- Work on a dedicated task branch and worktree. Keep the primary checkout clean and preserve unrelated changes. See [task isolation and delivery](docs/agent-workflows/isolation-and-delivery.md).
- Every bug or defect issue fix must include a regression test that reproduces the reported problem. Add and run that test before changing behavior; do not mark the issue complete without it. Follow [bug-fix workflow](docs/agent-workflows/bug-fixes.md).
- Every frontend fix must include screenshot evidence showing the fixed behavior in the affected state. Link the screenshots in the pull request description and state the viewport, theme, locale, and interaction; include before-and-after screenshots when the original behavior can be reproduced safely.
- If an agent discovers a defect in `okf-agent` itself while using or evaluating it, report it in the [`left-try/okf-agent`](https://github.com/left-try/okf-agent) repository using `gh` outside the sandbox. Follow the reporting steps in the [bug-fix workflow](docs/agent-workflows/bug-fixes.md); do not file `okf-agent` defects in this repository.
- Never weaken or delete a test to make a change pass.
- Keep changes focused and preserve unrelated work.
- Deliver implementation tasks with a task-branch push and pull request unless the user requests local-only work. This repository grants standing publication authorization for that delivery; merge and deployment need their own authorization.
- When the user asks to merge pull requests, inspect each PR in its actual target repository and merge green PRs automatically. A PR is green when it is open, mergeable, all required checks have passed, and no required review is outstanding. If any required check is failing (red) or pending, queued, running, unknown, or otherwise inconclusive (yellow), hold that PR and ask the user for additional approval before merging it in that state. Continue merging other green PRs independently, then verify and report which PRs merged and which were held.
- Use `gh` outside the sandbox for GitHub operations. At implementation completion, open/update the PR and inspect every CI cell on its current head until settled; ignore only CodeQL. Follow [GitHub delivery](docs/agent-workflows/github-delivery.md). Red, absent, queued, running, cancelled or unknown checks prevent a verified delivery claim; fix red checks and repeat after each push.
- For new popup work and popup migrations, reuse the shared popup primitives and follow [Popup UI standards](docs/ui/popup-standards.md). Do not add popup-local overlay, surface, close, button, field, dropdown, radius, or blur styles that conflict with that standard.
- Apply the approved typography work through `frontend/src/design-system/tokens.css`: use `--font-family-ui` (or `--font-family-mono` for code), shared font-size, weight, and line-height tokens. Popup primitives must inherit/use these tokens; reuse `PopupDialog`, `PopupBackdrop`, `PopupCloseButton`, `PopupButton`, `PopupField`, and `PopupSelect` instead of creating parallel popup components.

## Implementation approach

Adapted from [Ponytail](https://github.com/DietrichGebert/ponytail):

- Before editing, trace the affected flow and callers; check existing helpers, platform capabilities, dependencies, tests, and configuration.
- Choose the smallest complete solution. Reuse established code and installed dependencies; add abstractions, options, or dependencies only when the task requires them. Include every affected caller, test, fixture, configuration, and document.
- Keep validation, error handling, security, accessibility, and data-loss protections intact. Follow the repository's stricter bug-fix, testing, and verification workflows above.

Use one applicable Stovo workflow as the task entry point. Project skill wrappers route to these canonical pages; applicable human and higher-priority host instructions take precedence. Generic installed skills remain available for their specific work.

## Workflows

Read the applicable guide before editing:

| Work | Guide |
| --- | --- |
| Evaluating skills, routing or approval decisions | [Workflow evals](docs/agent-workflows/workflow-evals.md) |
| Independent acceptance or whole-delivery review | [Independent QA](docs/agent-workflows/independent-qa.md) |
| Frontend behavior, UI copy, layout, or shared styles | [Headless frontend evidence](docs/agent-workflows/frontend-evidence.md) |
| Substantial dependency choice or cross-project reuse proposal | [Dependency and reuse assessment](docs/agent-workflows/dependency-and-reuse.md) |
| Human approval, task scope, or changed approved artifacts | [Approvals and contracts](docs/agent-workflows/approvals.md) |
| New feature or materially new user-visible behavior | [Feature development](docs/agent-workflows/feature-development.md) |
| Bug, defect, incident, or regression fix | [Bug fixes](docs/agent-workflows/bug-fixes.md) |
| Test selection and verification expectations | [Testing](docs/agent-workflows/testing.md) |
| Branches, worktrees, pull requests, and cleanup | [Task isolation and delivery](docs/agent-workflows/isolation-and-delivery.md) |
| Review findings, comment evidence, and follow-up issues | [PR review findings](docs/agent-workflows/pr-review-findings.md) |

## Verification

Run the focused checks required by the applicable workflow and relevant commands from CONTRIBUTING.md. Report the commands and results, including any required check that could not be run. Avoid unrelated checks.

## Frontend UI reuse

- Before adding UI copy, search `frontend/src/config/strings/english.ts` and `russian.ts`; add the same key to both catalogs and consume it through `useStrings()` or the existing strings prop. Do not add another translation dictionary.
- Before adding a UI component or style, search for an existing component and style token to reuse. Prefer extending the existing component over creating a parallel one.
- Use the shared typography, weight, line-height, radius, and CSS color tokens in `frontend/src/design-system/tokens.css`. For static colors that must be passed as data to canvas, QR, or persisted color controls, reuse `frontend/src/design-system/palette.ts`; its values must have matching palette entries in `tokens.css`. Theme presets stay in `frontend/src/config/colors/`, and plugin-owned themes stay with the plugin. Do not add raw color literals or one-off font sizes, weights, or radii to production UI styles.
- Run `npm run check:i18n` and `npm test -- --run src/design-system/tokens.test.ts` from `frontend` after UI copy or shared style changes. See [Frontend UI conventions](docs/engineering/frontend-ui-conventions.md) for token names and examples.

## Optional documentation search

The canonical human-readable documentation lives in `docs/`. When a question spans several documentation areas and `okf-agent` is installed, use its standalone bundle profile to search the existing pages:

```sh
okf-agent bundle index --root docs --index-root .okf-index/docs
okf-agent bundle search "backup restore" --root docs --index-root .okf-index/docs
okf-agent bundle backlinks architecture/subsystems.md --root docs --index-root .okf-index/docs
```

Quote hyphenated phrases in search queries, for example `"self-host"`. Rebuild the local index after documentation changes. It is disposable and ignored by Git; edit the Markdown source pages instead.

## Active pull requests

- MCP connector settings button circle: https://github.com/stovo-team/stovo/pull/309
- Quick access layout reset: https://github.com/stovo-team/stovo/pull/306
- Chat transfer controls follow-up: https://github.com/stovo-team/stovo/pull/174
- Call and sidebar UI fixes: https://github.com/stovo-team/stovo/pull/177
- Ponytail agent guidance: https://github.com/stovo-team/stovo/pull/184
- PR merge approval policy: https://github.com/stovo-team/stovo/pull/302
- Compact media previews below 1600px: https://github.com/stovo-team/stovo/pull/310
- Storage production layout: https://github.com/stovo-team/stovo/pull/308
- New chat dialog desktop width: https://github.com/stovo-team/stovo/pull/305
- Pinned banner hover: https://github.com/stovo-team/stovo/pull/304
