---
title: "Agent workflow system implementation plan"
type: implementation-plan
---

# Agent workflow system implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` for inline implementation or `superpowers:subagent-driven-development` when the human selects delegated implementation. Follow the selected method task by task. Independent QA is required at coherent delivery boundaries. Checkbox steps track implementation; none is complete merely because it appears in this plan.

**Goal:** Implement the complete agreed program for feature contracts, skills, approvals, dependency/reuse decisions, headless visual evidence, independent QA, evals, and understandable GitHub delivery.

**Architecture:** Repository Markdown is the policy source; project skill wrappers route to that policy. Small Node utilities validate versioned contract/evidence records. A separate Playwright configuration exercises the real mock application, captures evidence, and feeds a delivery validator and secret-free CI. GitHub mutation plans remain separately authorized and idempotent.

**Tech Stack:** Markdown/YAML, installed OKF standalone bundle CLI, Node 22 built-ins, existing Vitest, Playwright 1.62.1 from the current lockfile, Git/GitHub CLI, GitHub Actions.

**Spec:** [Design and acceptance criteria](../specs/2026-10-19-agent-workflow-system-design.md).
**Test plan:** [Checks TP-01 through TP-22 and eval cases](../../feature-plans/agent-workflow-system-tests.md).
**Program entry:** [Overview and baseline](../../engineering/agent-workflow-program.md).
**Status:** Proposed, ready for human review. All tasks below are pending implementation.

## Global constraints

- Work on dedicated branches/worktrees based on the appropriate current base; preserve unrelated work. This planning package starts at locally available commit `26e3aebe72c4441fc518d31d24826e11af5006e9`.
- Preserve regression-first bug fixes and meaningful behavior tests. Documentation-only edits use existing docs validation rather than artificial tests of prose.
- The user has agreed the whole program's scope. Review the concrete written spec/test-plan before implementation; reuse subsequent valid authorization within its stated scope.
- Keep canonical policy in `docs/agent-workflows/`; keep `AGENTS.md` and skills as concise routers. Do not edit vendor skill/plugin caches or globally install personal skills as a side effect.
- Use the existing loopback mock origin `http://127.0.0.1:5174`, real app routes and styles, and synthetic data. The new visual path uses headless Playwright scripts without browser-use tools.
- Preserve existing integration E2E routing and production behavior; mock evidence never claims backend correctness.
- Local preparation does not grant remote write, repository publication, merge, deployment, or administrative permissions. Apply already granted permission without asking again; otherwise prepare a concrete proposal before requesting it.
- Keep generated evidence, caches, model traces, and `.okf-index/` out of Git. Commit reviewed visual reference images intentionally; record their source/environment.
- Use English for PR titles/bodies/comments and the repository's existing title prefixes and labels. Aim for 300-400 changed code lines per coherent PR; explain generated/documentation size separately.

## Review focus

1. Self-authored approval records must not become a permission bypass; TP-03/05 and EV-12 verify provenance limitations and actual actions.
2. A successful screenshot from the wrong server/revision is invalid evidence; TP-09/12 verifies origin, environment, revision, and dirty contents.
3. Visual hook leakage into production or real network traffic must fail; TP-09/22 verifies mode guards, transport boundaries, and build behavior.
4. Skip conditions, retries, missing artifacts, or a high average eval score must not hide mandatory failures; TP-14/16/20 exercises the aggregate result.
5. Existing ignored directories, installed personal skills, and GitHub configuration must survive installation and rollout; TP-02/18/19 verifies no destructive replacement.

## Planned repository layout and interfaces

Paths in code formatting below are planned outputs, not links to existing files.

| Area | Planned source and responsibility |
| --- | --- |
| Policy | Extend existing feature/testing/isolation/review guides; add `approvals.md`, `dependency-and-reuse.md`, `frontend-evidence.md`, `independent-qa.md`, `workflow-evals.md`, and `github-projects.md` under `docs/agent-workflows/` |
| Skills | `agent-skills/stovo-{feature-contract,frontend-evidence,qa-review,delivery-review,workflow-evals}/SKILL.md`; concise entry points and references |
| Templates | `docs/agent-workflows/templates/` for spec, test-plan, decisions, QA report, and delivery packet; project skill files link to these rather than duplicating them |
| Contract tools | `scripts/agent-workflows/{contracts,validate-contract,evidence,validate-delivery,render-pr}.mjs`; pure shared validation plus thin CLIs |
| Versioned formats | `scripts/agent-workflows/schemas/{contract,evidence,github-plan,eval-result}.v1.json`; required fields and allowed values |
| Skill installer | `scripts/agent-workflows/install-skills.mjs`; install only project-owned names into ignored `.agents/skills/` |
| Visual suite | `e2e/playwright.visual.config.ts`, `e2e/visual/`, and `e2e/tools/`; scenario fixtures, capture, and revision comparison |
| Mock hooks | Existing `frontend/src/dev/` files, extended only for missing deterministic states |
| Evals | `agent-evals/cases/`, `agent-evals/fixtures/`, `agent-evals/rubric.md`, and `scripts/agent-workflows/*evals.mjs` |
| GitHub tools | `scripts/agent-workflows/github-plan.mjs` and `github-apply.mjs`; read-only diff, authorized apply, readback |
| CI | `.github/workflows/agent-evidence.yml`, `.github/agent-workflows-ci.test.mjs`, `.github/PULL_REQUEST_TEMPLATE.md` |

Use Node built-ins for filesystem, hashing, subprocesses, and the finite version-1 record validators. JSON Schemas document the shared public records; implement the required field/path/state checks explicitly rather than writing a general schema engine. Validate valid/invalid fixtures against every supported constraint. If a maintained schema library would reduce real complexity, perform Task 4's dependency review and keep it in a scoped tool package; do not silently add another root package manager.

Internal functions are imported in tests. CLIs accept data paths and named flags, emit JSON to stdout and explanations to stderr, return 0 on success and nonzero on invalid/blocked operation, and never execute commands found inside a record.

## Task 1: Establish canonical workflow routing and repair OKF metadata

**Files:** Modify `AGENTS.md`, `docs/README.md`, existing `docs/agent-workflows/{feature-development,bug-fixes,testing,isolation-and-delivery,pr-review-findings}.md`; create `docs/agent-workflows/approvals.md` and `templates/{feature-spec,test-plan}.md`. Add only metadata to the 10 baseline pages listed below.

**Interfaces:** `AGENTS.md` maps a task class to one canonical guide. Approval policy owns scope/freshness semantics; existing guides link to it. The current program documents remain the design history, not a second active policy.

- [ ] Read the current base and all relevant guides; compare supplied/task instructions and installed skills before changing any approval behavior.
- [ ] Define artifact sizes for focused bugs, small features, and subsystems. Preserve the focused regression-first bug route. Add combined spec/test-plan review, stable acceptance IDs, existing-authorization reuse, and material-change handling.
- [ ] Add canonical templates for scope, user behavior, alternatives, acceptance criteria, test matrix, explicit approval evidence, and unresolved constraints. Do not mark templates or drafts as approved.
- [ ] Add concise routing pointers and an explicit conflict rule: applicable human/host instructions prevail; repository policy provides Stovo-specific details without repeating full third-party processes.
- [ ] Repair missing `title`/`type` metadata on `agent-workflows/pr-review-findings.md`, `ui/popup-standards.md`, the `2026-10-12-repository-structure`, `2026-10-14-intelligence-backup-restore-operations-implementation`, `2026-10-15-localization-design-system`, and `2026-10-15-popup-component-system` plans, and their four matching spec pages. Obtain exact filenames from the current OKF diagnostics; keep bodies intact.
- [ ] Run `node --test --test-name-pattern='all Markdown local links|documented Compose filenames' .github/docs-validation.test.mjs`, `okf-agent bundle index --root docs --index-root .okf-index/docs`, and `okf-agent bundle validate --root docs --index-root .okf-index/docs`. Expected: link/config tests pass and zero error-severity OKF diagnostics; existing intentional bundle-escape diagnostics are explained.
- [ ] Search `approval`, `testing`, and `"agent workflow"` with OKF and inspect backlinks for the program entry and new approvals page. Commit `[Docs] define agent contract and approval workflow`.

**Done:** TP-01/03/05/21 policy and navigation requirements have one authoritative home. This task creates reviewable policy; it does not claim that Markdown can independently enforce human identity.

## Task 2: Add versioned contracts and approval freshness validation

**Files:** Create `scripts/agent-workflows/contracts.mjs`, `validate-contract.mjs`, `schemas/contract.v1.json`, `contracts.test.mjs`, and `fixtures/contracts/`; modify `.gitignore` to allow only maintained `scripts/agent-workflows/` sources under the existing `/scripts/*` ignore rule.

**Interfaces:** `validateContract(record, { root, readFile, expectedState }) -> { ok, errors, warnings }`; `hashFile(path) -> sha256`. CLI: `node scripts/agent-workflows/validate-contract.mjs <contract.json> --root <checkout> --state approved`.

- [ ] Add valid and invalid fixtures for required IDs, spec/test-plan hashes, source references, transitions, explicit action scopes, duplicate acceptance IDs, out-of-checkout paths/symlinks, and a changed approved artifact. Assert returned errors and CLI exit codes, not implementation-private structures.
- [ ] Run `node --test scripts/agent-workflows/contracts.test.mjs` before validator implementation; confirm a missing required capability causes failure.
- [ ] Implement finite version-1 validation, actionable errors, and digest freshness. Resolve real paths safely. Keep check commands as argument-array data and make validation read-only. Report that approval provenance needs trusted human/host evidence.
- [ ] Run the same tests unchanged. Validate a complete sample and demonstrate that editing its test plan makes the approval stale.
- [ ] Check `git status` shows all intended maintained tool sources are tracked and generated artifacts remain ignored. Commit `[Feature] validate task contracts and approval freshness`.

**Done:** TP-03/04/05 pass for deterministic validation. Human identity and tool permissions remain enforced by the actual host/GitHub boundary.

## Task 3: Package portable project skills without changing personal plugins

**Files:** Create five `agent-skills/stovo-*/SKILL.md` wrappers and `agent-skills/README.md`; create `scripts/agent-workflows/install-skills.mjs` and `install-skills.test.mjs`. QA/eval/evidence wrappers may initially declare their workflow unavailable until their owning tasks land; they must not claim success.

**Interfaces:** `installSkills({ sourceRoot, targetRoot, mode }) -> { installed, unchanged, collisions }`; CLI: `node scripts/agent-workflows/install-skills.mjs --target .agents/skills --mode link --dry-run`, then the same command without `--dry-run`. A copy mode supports environments without usable symlinks.

- [ ] Write and run failing subprocess tests using temporary source/target roots: repeated install, existing unrelated files, same-name collision, symlink escape, dry-run, broken source, and copy mode.
- [ ] Implement ownership checks and safe idempotent installation. Never overwrite a non-owned target or edit plugin caches/global directories by default.
- [ ] Give each wrapper a narrow trigger, canonical references, expected outputs, and completion conditions. Resolve the current repository root before opening workflow references so both symlink and copy installations locate the same canonical documents. Check actual installed Superpowers/Matt Pocock instructions and explain the preferred single Stovo route; retain generic skills for appropriate independent tasks.
- [ ] Rerun installer tests and install locally in the task worktree. Start a fresh supported Codex session to check catalog discovery and explicit/implicit activation; record this as a real-session smoke rather than a regex test.
- [ ] Record optional personal installation instructions with a concrete target and ownership/collision preview; global application is a separate authorized action. Commit `[Feature] add portable Stovo workflow skill entry points`.

**Done:** TP-01/02 and the project-install part of AC-14 pass; the program does not claim that repository copies globally replace installed skills.

## Task 4: Add conditional dependency research and extraction proposals

**Files:** Create `docs/agent-workflows/dependency-and-reuse.md`, `templates/dependency-decision.md`, and `templates/reuse-candidate.md`; update feature/delivery pointers and `stovo-feature-contract` references.

**Interfaces:** A dependency record answers capability, existing/platform/package choices, version/license/maintenance/advisories, compatibility/cost, decision and uncertainty. An extraction record answers consumer, API, coupling, tests, provenance, effort and ownership, or records `no candidate`.

- [ ] Define triggers for external research: substantial standard capability, high maintenance risk, or an explicit library comparison request. Small component/token changes start and can finish with repository reuse research.
- [ ] Document upstream-source and license verification, lockfile review, bundle/runtime impact, and why popularity does not establish safety. Preserve the smallest complete solution rule.
- [ ] Make reusable-code assessment a brief closeout step for substantial work; prepare a proposal without modifying other repositories or publishing a package.
- [ ] Walk through one small UI example, one substantial standard capability, and one no-candidate outcome using the templates. Add EV-01/05/06 expectations for later real evals.
- [ ] Run existing docs link checks and OKF update/validate. Commit `[Docs] define dependency research and reusable code assessment`.

**Done:** TP-06/07 have executable eval inputs and clear reviewer outputs; additional dependencies are considered only when justified.

## Task 5: Add a separate headless mock visual runner

**Files:** Create `e2e/playwright.visual.config.ts`, `e2e/visual/fixtures.ts`, `e2e/visual/mock-shell.spec.ts`, `e2e/tools/visual-options.mjs`, `e2e/tools/visual-options.test.mjs`, `e2e/tools/capture-evidence.mjs`, and `e2e/tools/capture-evidence.test.mjs`; modify `e2e/package.json` and ignore rules for new evidence outputs. Keep `e2e/playwright.config.ts`'s integration behavior.

**Interfaces:** `npm run test:visual` from `e2e` runs only the visual project; `npm run evidence:capture -- --task <task-id> --output <path>` invokes `capture-evidence.mjs`. Its `captureEvidence({ taskId, output, config, revision })` returns check results, screenshot paths and source/environment metadata for Task 7's manifest. `readVisualOptions(env)` accepts only the configured loopback origin and explicit output paths. The Playwright server starts `npm --prefix ../frontend run dev:mock` from `e2e`, waits for readiness, and refuses an occupied unidentified port.

- [ ] Inspect current lockfiles, server guards, locale/theme settings and accessible selectors. Use the locked Playwright version; do not upgrade merely to use a new agent template.
- [ ] Add failing runner-option tests and one initial real-route Playwright case for server readiness, screenshot creation, external-request rejection and cleanup. Run them and confirm expected missing-runner failures.
- [ ] Implement the dedicated config with headless Chromium, explicit local server ownership, bounded startup/test timeouts, HTML/JSON results, and screenshot attachments even on success.
- [ ] Implement fresh-context isolation, fixed clock/timezone, local fonts/assets, semantic readiness, request and WebSocket guards. Surface console/runtime errors and preserve legitimate intentional error-state assertions.
- [ ] Run `node --test e2e/tools/visual-options.test.mjs`, then from `e2e` run `npm ci`, `npx playwright install chromium`, and `npm run test:visual -- --grep 'mock shell'`. Run the existing `tests/local-mock-mode.spec.ts` against the same owned mock server sequentially and verify teardown.
- [ ] Record source/environment in a preliminary evidence record. Commit `[Feature] capture headless evidence from the real mock frontend`.

**Done:** TP-08/09 pass for runner isolation and no external services; later tasks extend matrix coverage and strict manifest validation.

## Task 6: Add deterministic states and the initial visual acceptance matrix

**Files:** Extend existing `frontend/src/dev/mockApi.ts`, `mockFixtures.ts`, `mockBootstrap.ts` and their focused tests only as needed; create `e2e/visual/scenarios.ts`, `chat-states.spec.ts`, and `popup.spec.ts`; document the final matrix in `docs/agent-workflows/frontend-evidence.md`.

**Interfaces:** Named scenarios are explicitly mock-only and scoped to the current test/browser context. `prepareVisualScenario(page, scenario)` selects verified existing locale/theme controls/storage, synthetic state, and readiness. The registry contains the exact V-01 through V-12 route/state/viewport identities from the test plan.

- [ ] Locate actual empty/loading/error handlers and shared popup controls; reuse them before adding hooks. Record the exact V-12 popup and locator. Choose mock-only scenario transport after inspecting the existing fetch interception, so double mocking cannot bypass required errors.
- [ ] Add and run failing unit tests for new scenario behavior and mode guards before changing handlers. Add Playwright expectations for loading/empty/error retry, keyboard focus/Escape, and overflow.
- [ ] Implement only missing deterministic hooks under the existing explicit dev/mock guard. Extend existing fixture shapes and synthetic strings without production initialization or real-data access.
- [ ] Implement all eight shell combinations plus four state cases. Use existing tokens/components; introduce no duplicate production UI for screenshots. Update test selectors only where necessary.
- [ ] Run focused mock Vitest tests, `npm run check:i18n` if copy changes, shared token tests if styles change, the existing local-mock Playwright spec, the new visual matrix twice, and `npm run build` from `frontend`.
- [ ] Save the two repeated-run reports and any remaining nondeterminism as blocked work. Commit `[Test] cover responsive mock states and popup evidence`.

**Done:** TP-09/10/22 pass; screenshots exist for successful cases, but unreviewed images are not yet accepted visual baselines.

## Task 7: Bind before/after evidence to exact revisions and approved references

**Files:** Create `scripts/agent-workflows/evidence.mjs`, `schemas/evidence.v1.json`, `evidence.test.mjs`, `e2e/tools/compare-revisions.mjs` and its tests; add reviewed `e2e/visual/__screenshots__/` references and extend `stovo-frontend-evidence`.

**Interfaces:** `validateEvidence(manifest, { root, contract, expectedRevision }) -> result`; `npm run evidence:compare -- --base <sha> --head <sha> --task <task-id> --output <path>` from `e2e`. Only explicit revisions are accepted; the tool never checks out or resets the user's working tree.

- [ ] Write/run failing tests for mismatched scenario metadata, missing/hash-changed files, stale source/contract, path escape, dirty source without patch digest, missing base, and legitimate reviewed after-only evidence.
- [ ] Implement exact-revision capture through isolated temporary checkouts and sequential owned servers. Reuse approved existing worktree mechanisms at execution; clean up only tool-owned temporary checkouts. Apply identical fixtures/browser settings; report incompatible base states explicitly.
- [ ] Finalize evidence manifests with file hashes and acceptance mappings. Keep full generated reports ignored and publish only sanitized synthetic artifacts.
- [ ] Present initial screenshot references for human review. Record accepted sources/environment; enable `toHaveScreenshot()` for those references. Missing/changed references fail, and an explicit update command produces a reviewable diff without granting approval.
- [ ] Run manifest/runner tests; compare two known revisions; introduce a deliberate clipping change in a disposable checkout and prove the visual test fails while keeping the diff/report. Restore that disposable mutation and prove clean pass.
- [ ] Commit `[Feature] bind visual comparisons to reviewed source revisions`.

**Done:** TP-10/11/12 pass and reference approval is recorded. CI cannot rewrite references to turn failures green.

## Task 8: Implement independent QA and evaluate ready-made test-agent inputs

**Files:** Create `docs/agent-workflows/independent-qa.md`, `templates/qa-report.md`; finalize `agent-skills/stovo-qa-review/SKILL.md`; record the external-tool comparison in this program's engineering notes.

**Interfaces:** QA input is the approved contract, test matrix, exact diff/revision and runnable local environment. Output is findings with severity/trigger/impact/evidence, acceptance coverage, check results and limitations. Product changes remain with the implementer.

- [ ] Define when one fresh reviewer is required and when independent frontend/backend scopes justify parallel reviewers. Pass self-contained requirements instead of relying on the author's private reasoning.
- [ ] Check the locked Playwright CLI help and official planner/generator definitions. Compare them with the custom QA role on one representative synthetic task. Record compatibility, tool needs, evidence quality and cost; adopt only the useful supported parts.
- [ ] Keep the routine execution path in headless scripts. Review any proposed test repair for unchanged acceptance assertions; no blanket healer permission to weaken tests.
- [ ] Run a seeded visual defect and a seeded missing-edge-case pilot. Verify QA reports both using real evidence and leaves application sources/expected assertions untouched. A reproduction test patch is isolated or handed back.
- [ ] Run docs/skill validation and record TP-13 results. Commit `[Docs] define independent QA with reproducible findings`.

**Done:** AC-08 has an operational independent review protocol and the third-party test-agent choice is based on a recorded comparison.

## Task 9: Validate delivery packets and render useful PR descriptions

**Files:** Create `scripts/agent-workflows/validate-delivery.mjs`, `render-pr.mjs`, `delivery.test.mjs`, fixtures, `templates/delivery-packet.md`, and `.github/PULL_REQUEST_TEMPLATE.md`; update isolation/review guides and finalize `stovo-delivery-review`.

**Interfaces:** `validateDelivery({ contract, evidence, qa, changedPaths }) -> { ok, missing, blocked }`; CLI accepts `--contract`, `--evidence`, `--qa`, and `--changed-paths`. `render-pr.mjs` emits an English body to a file/stdout and performs no publication.

- [ ] Add/run failing fixtures for complete UI delivery, docs-only not-applicable evidence, failed/missing/stale checks, mismatched source/contract, absent QA, shared-token changes, and unsupported after-only evidence.
- [ ] Implement acceptance-to-evidence coverage and changed-path classification. Unknown impacted UI requires review/coverage justification rather than silently skipping screenshots. Do not classify applicability solely from an agent's claim.
- [ ] Render problem/result, scope, contract/issue links, commands/results, screenshot/report references, risks/limits and a short manual scenario. Use actual artifact URLs when available; never present local paths as usable remote proof.
- [ ] Preserve existing PR prefixes, labels, authorization and small coherent scope rules. Record size and explain generated snapshots/lockfiles separately.
- [ ] Run `node --test scripts/agent-workflows/delivery.test.mjs`; generate one frontend and one nonvisual sample body and manually inspect them against evidence. Commit `[Feature] validate delivery evidence and render reviewable PR descriptions`.

**Done:** TP-14/15 pass; a polished description cannot turn missing mandatory evidence into ready-for-review status.

## Task 10: Add a repeatable skill/workflow eval harness

**Files:** Create `agent-evals/cases/EV-01.json` through `EV-12.json`, synthetic fixtures and `rubric.md`; create `scripts/agent-workflows/run-evals.mjs`, `score-evals.mjs`, `evals.test.mjs`, `schemas/eval-result.v1.json`; finalize the eval guide and `stovo-workflow-evals`.

**Interfaces:** `run-evals.mjs --cases <dir> --adapter <trusted-local-module> --output <dir>` produces versioned traces/results. The adapter returns actual task execution artifacts/tool events; no fabricated transcript fallback. `score-evals.mjs --baseline <dir> --candidate <dir> --report <file>` compares identical case/grader revisions.

- [ ] Add/run failing tests for omitted mandatory checks, fake self-report without tool evidence, mismatched cases/models, incomplete runs, unavailable telemetry, and higher-average candidates with a hard failure.
- [ ] Implement deterministic artifact/permission assertions and evidence-based 0-2 qualitative rubrics. Record unknown/blocked outcomes and measured duration/tokens/cost without inventing telemetry. Keep model calls out of default CI.
- [ ] Inspect the available Codex runtime's actual supported noninteractive interfaces before writing a real adapter. Use explicit runtime/model configuration, a bounded budget, isolated worktrees, and no production secrets. Never infer authorization for remote writes from an eval prompt.
- [ ] Run a baseline and candidate on the 12 fixed cases; perform three trials for variable activation/approval cases and two held-out variants. Keep graders fixed between comparisons. Capture the real cost/runtime and stop at the approved budget with a partial-run report if needed.
- [ ] Run `node --test scripts/agent-workflows/evals.test.mjs` and publish a sanitized local comparison report. Commit `[Feature] evaluate workflow skills against fixed acceptance cases`.

**Done:** TP-20 passes; report hard failures individually and do not claim improvement based on a single favorable run.

## Task 11: Prepare idempotent GitHub issue, Project, milestone and rules plans

**Files:** Create `scripts/agent-workflows/github-plan.mjs`, `github-apply.mjs`, `github.test.mjs`, `schemas/github-plan.v1.json`; create `docs/agent-workflows/github-projects.md` and extend delivery references.

**Interfaces:** Plan mode reads existing state and outputs operations with stable identity, before/after values and required action scopes. Apply mode requires the reviewed plan digest and matching trusted authorization evidence, invokes `gh` outside the sandbox when authorized, and reads back results. Authentication stays with `gh`; credentials are not written into plans.

- [ ] Add/run fake-transport tests for issue deduplication, existing Project fields/options, milestone reuse, repeated apply, partial failure/resume, missing access, changed remote state, and out-of-scope operations.
- [ ] Implement read-only discovery first. Search all relevant issue states, map existing field IDs and statuses, inspect available review/check settings, and propose only necessary changes. Keep stable IDs to avoid duplicate creation after retries.
- [ ] Prepare a concrete plan for one Project with Backlog/Ready/In progress/Review/Done and release-level milestones only when useful. Link actual existing issues/PRs; create task issues only when authorized and independently actionable.
- [ ] Propose required CI checks and human review/stale-review controls as a separate administrative section. Preserve unrelated existing rules and distinguish repository permissions from organization Project permissions.
- [ ] Run `node --test scripts/agent-workflows/github.test.mjs`. Show the real read-only diff; apply only within already supplied or newly granted explicit scopes, and read back. An ungranted operation stays proposed with an unblock condition, without blocking useful local preparation.
- [ ] Commit `[Feature] plan authorized GitHub delivery and project updates`.

**Done:** TP-18/19 deterministic checks pass. Live creation/admin work is separately reported as applied or pending authorization/access; simulation is not live enforcement.

## Task 12: Add secure CI evidence and a stable aggregate gate

**Files:** Create `.github/workflows/agent-evidence.yml`, `.github/agent-workflows-ci.test.mjs`; update path selection/links only where required, maintaining existing pipeline contracts.

**Interfaces:** Stable check name `Agent workflow gate`; supporting jobs validate records and run applicable mock visual scenarios. A documented artifact name and manifest bind screenshots/reports to the PR head and comparison base. Docs-only applicability is explicit. Model-backed evals stay manually invoked.

- [ ] Write/run failing workflow contract tests for event/permission boundaries, hosted runners, pinned actions, upload-on-failure, fork behavior, path selection, shared-token coverage and aggregate failure/skip handling.
- [ ] Implement a read-only hosted `pull_request` workflow with bounded timeouts and no application secrets or persistent credentials. Pin dependencies/actions following repository practice. Do not run untrusted PR code on privileged/self-hosted runners or via a privileged event.
- [ ] Install frontend/e2e locked dependencies and the matching Chromium runtime, run deterministic validators and required visual scenarios, upload sanitized evidence even on failure, and report artifact links in the job summary.
- [ ] Make the aggregate job run regardless of upstream status and reject missing/failing required jobs. Avoid a path-filtered absent check that would leave required-check status pending. Draft PR behavior is explicit: evidence may run before review; no merge permission is implied.
- [ ] Run `node --test .github/agent-workflows-ci.test.mjs` and existing affected pipeline contract tests. With publication/CI authorization, run docs-only, visual-success and intentional visual-failure pilots in disposable branches. Verify artifacts, check names, and fork-safe behavior.
- [ ] Commit `[Feature] gate frontend delivery on reproducible CI evidence`.

**Done:** TP-15/16/17 pass locally and, when authorized, in real CI. Until the hosted pilot succeeds, do not advertise the proposed check as an enforced merge requirement.

## Task 13: Complete end-to-end pilots, activate approved controls and document operation

**Files:** Update the program overview, relevant guides, installer notes and sanitized pilot/eval reports. Add actual status/links only after they exist.

**Interfaces:** A completion matrix lists AC-01 through AC-14, TP-01 through TP-22, local check evidence, CI evidence, accepted references, and applied/pending remote settings.

- [ ] Run one real bounded frontend delivery and one nonvisual contract/backend delivery through contract approval, reuse research, tests, independent QA, evidence and PR-body preparation. Keep the pilot changes independently useful and focused.
- [ ] Demonstrate three negative controls: changed approved spec becomes stale, wrong-revision evidence is rejected, and an intentionally broken visual state fails without automatic baseline repair. Keep these mutations disposable.
- [ ] Review eval baseline/candidate results and held-out cases. Fix identified instruction/implementation defects with regression coverage; rerun only affected and necessary broader checks.
- [ ] Present the final branch-rules/project diff and screenshot references; apply existing authorized settings after stable CI checks exist, or obtain a scoped decision on the concrete outstanding proposal. Read back all live changes.
- [ ] Verify no credentials, personal content, local indexes, model traces or generated reports are committed; ensure all maintained scripts/skills and accepted references are tracked. Verify the original user's checkout remains untouched.
- [ ] Reindex OKF, verify search/backlinks, run focused docs checks and `git diff --check`, and record any outstanding access/budget/environment limitations with owners and unblock conditions.
- [ ] Commit `[Docs] record workflow rollout evidence and operating guidance`.

**Done:** The complete agreed scope has an explicit result. Report local functionality, independently verified behavior, CI operation, and remote enforcement separately; leave incomplete controls visible rather than marking them complete.

## Delivery slices and dependency order

This is one program with the full agreed scope, delivered in reviewable slices rather than one oversized implementation PR. Split a slice further when its code exceeds the repository guideline; preserve independently testable behavior.

| Slice | Tasks | Reviewable result | Depends on |
| --- | --- | --- | --- |
| A | 1-2 | Canonical contract/approval policy and working record validation | Reviewed spec/test plan |
| B | 3-4 | Installable project entry points and dependency/extraction decisions | A |
| C | 5 | One-command owned mock runner and evidence screenshot | A |
| D | 6-7 | Full initial visual matrix, reviewed references and revision-bound comparisons | C |
| E | 8-9 | Independent QA protocol and validated delivery/PR body | B, D |
| F | 10 | Fixed-case evaluation harness and baseline/candidate report | B, E |
| G | 11 | Dry-run GitHub plan and authorized idempotent apply | A, E |
| H | 12-13 | Hosted evidence gate, real pilots, approved remote controls and operating report | D, E; use F/G before final rollout |

Within inline execution, follow the sequence above. Parallel execution is optional for independent work after shared interfaces land and requires the selected delegation method; do not delegate overlapping files by default. A new execution checkout rebases/reconciles with the current authorized base before edits; this plan's observed commit is a baseline, not a mandate to ignore later work.

## Verification commands and expected evidence

Commands naming planned files become runnable when their owning tasks implement them. A missing planned file before that task is not a result to report as passed.

```sh
# Repository root: maintained local validators and workflow contracts.
node --test scripts/agent-workflows/*.test.mjs
node --test e2e/tools/*.test.mjs
node --test .github/agent-workflows-ci.test.mjs
node --test --test-name-pattern='all Markdown local links|documented Compose filenames' .github/docs-validation.test.mjs
git diff --check

# Existing documentation tooling; full errors must be repaired in Task 1.
okf-agent bundle index --root docs --index-root .okf-index/docs
okf-agent bundle search '"agent workflow"' --root docs --index-root .okf-index/docs --limit 10
okf-agent bundle backlinks engineering/agent-workflow-program.md --root docs --index-root .okf-index/docs
okf-agent bundle validate --root docs --index-root .okf-index/docs

# From frontend, after relevant mock/UI changes.
npm ci
npm test -- src/dev/mockApi.test.ts src/dev/mockBootstrap.test.ts
npm run check:i18n
npm test -- --run src/design-system/tokens.test.ts
npm run build

# From e2e, after the owning visual tasks land.
npm ci
npx playwright install chromium
npm run test:visual
```

Document backend checks only for a pilot that actually modifies backend behavior. Inspect current supported runtime and environment prerequisites before model-backed evals; report budget/access blockers precisely. Never run integration/E2E cases against production accounts or data.

## Human review packet and implementation handoff

Review the linked spec and test plan together, including the 12 visual cases, approval boundaries, five project skills, and remote-operation limits. The implementation plan adds engineering sequencing and exact record/tool interfaces; any material change returns to the same reviewed set.

Recommended execution is inline implementation in dedicated worktrees, with one independent QA review per coherent delivery and targeted parallel work only when useful. It avoids paying for a fresh agent on every small step while preserving a separate acceptance check. If the human selects delegated execution, retain these shared interfaces and deliverable boundaries.

After review, record the actual human decision and artifact digests. Do not manufacture that decision from this plan's existence. Start Task 1, finish each slice with its specified evidence, and proceed autonomously within the approved scope and publication permissions.
