---
title: "Agent workflow system design"
type: design
---

# Agent workflow system design

**Status:** Proposed; scope agreed in chat, written specification and test plan awaiting review.
**Date:** 2026-10-19
**Program:** [Overview](../../engineering/agent-workflow-program.md)
**Companion artifacts:** [Test plan](../../feature-plans/agent-workflow-system-tests.md) and [implementation plan](../plans/2026-10-19-agent-workflow-system.md).

## Problem and desired outcome

Stovo has useful development rules and many skills, but the handoffs depend on which skill is activated. A plan can be reviewable without an explicit approval, UI tests can pass without a useful screenshot, and an implementation author can mistake their own test coverage for independent acceptance. The user needs small, understandable deliveries with evidence and control over important decisions.

Build one repository workflow with portable skill entry points, executable artifact validation, a deterministic mock visual suite, independent QA, and an evaluation loop. Reuse existing Vite, Vitest, Playwright, Node, GitHub CLI, GitHub Actions, and OKF bundle support before adding tooling.

## Policy and skill ownership

Repository workflow pages are the canonical policy. `AGENTS.md` contains short conditional pointers, not another copy of all procedures. Skills route the agent to the relevant workflow, select scripts and templates, and define their expected outputs. Task-specific human instructions and applicable higher-priority host rules continue to take precedence.

Create five project skill sources under `agent-skills/`: `stovo-feature-contract`, `stovo-frontend-evidence`, `stovo-qa-review`, `stovo-delivery-review`, and `stovo-workflow-evals`. A local installer exposes only these names under ignored `.agents/skills/`, without replacing unrelated skills or touching personal plugin caches. Each description states when to activate and when another skill owns the work. Validate activation in a fresh supported Codex session; filesystem installation alone does not prove that a running chat has reloaded its catalog.

Treat Superpowers and Matt Pocock workflows as existing capabilities to reuse selectively. The project skills provide one entry point for Stovo; they reference applicable installed capabilities without reproducing two complete planning or review processes. Inspect actual plugin instructions at execution time; do not promise that a repository file can override higher-priority host instructions. Global plugin changes require a separate explicit decision.

## Contract and approval lifecycle

Scale artifacts to the task. A focused defect follows the regression-first bug workflow. A small feature uses a concise contract and test matrix. A new subsystem has a written spec, test plan, and implementation plan. Every relevant contract has stable acceptance IDs; tests and evidence refer to them.

Use these states: `draft`, `awaiting-approval`, `approved`, `implementing`, `verified`, `ready-for-review`, and `accepted`. `verified` means the specified checks ran successfully on a named source revision. `accepted` requires the designated human decision. An unavailable required check yields a blocked item, not a successful verification.

The human reviews the spec and test plan together before feature behavior changes. The approval record identifies both artifact digests, the actor, source chat/message or review URL, decision, and scope. A supplied implementation plan is included in the approved set when it contains additional product or interface decisions. Approval applies to the reviewed contents; material changes to acceptance criteria, interfaces, security assumptions, or scope invalidate it. Editorial changes can be reacknowledged using an explicit equivalence note; the validator never silently accepts a changed digest.

Before asking, prepare the actual reviewable artifacts. Reuse approval already granted for the same artifacts and actions. Avoid another approval at every test, commit, or read-only inspection. Track contract approval, publication authorization, issue/Project authorization, merge authorization, and deployment authorization separately so one is not inferred from another. A broad explicit instruction can grant multiple scopes; record its actual boundaries.

A local record documents human evidence; it cannot prove its own authenticity. Automated checks can verify digests, completeness, revision binding, and state transitions. GitHub can independently verify reviews for remote merge controls. Agent-created text saying `actor: human` is never sufficient to grant permission.

## Shared artifact interfaces

Store task inputs under `docs/feature-plans/<task-id>/` when a feature needs machine-readable checks, with `spec.md`, `test-plan.md`, and `contract.json`. Existing approved documents may remain in their current folders and be referenced by relative path. Each document has OKF metadata. Generated evidence stays in ignored `artifacts/agent-workflows/<task-id>/` and CI artifacts; sanitized summaries may be committed to the task documents.

The version-1 contract contains `schemaVersion`, `taskId`, `state`, `artifacts` (repository-relative path and SHA-256), `acceptance` (ID and expected behavior), `checks` (ID, acceptance IDs, layer, and command as argument array), `approvals` (artifact digests and human source), and `authorizations` (action scopes and sources). Paths must resolve inside the checkout; commands in a contract are descriptive inputs, never automatically executed by the validator. The contract does not hash itself.

The version-1 evidence manifest contains `schemaVersion`, `taskId`, `sourceRevision`, `baseRevision`, `dirty`, `contractDigest`, `environment`, `checks`, `screenshots`, and `limitations`. Check entries carry command, result, duration, artifact paths, and acceptance IDs. Screenshot entries carry scenario ID, side (`before` or `after`), source revision, viewport, theme, locale, and relative file path. Matching pairs share environment and scenario metadata; a new feature may have an explicitly reviewed after-only example. Hash each evidence file. Source revision alone is insufficient when `dirty` is true: retain a patch digest and mark it in the report.

Use versioned JSON Schema and small Node validators. Validate paths and files without arbitrary shell evaluation, network access, or modification of the application. Link every result to the exact inspected revision and preserve failed, skipped, and blocked outcomes.

## Dependency research and reusable code

Before implementing a capability, inspect existing components, helpers, platform APIs, installed dependencies, and callers. Research external packages when substantial standard functionality would otherwise be reimplemented. Compare viable choices with a local implementation; a trivial change needs only the repository search.

A dependency decision records the actual capability needed, compatibility, license, upstream maintenance, known advisories, exact version, transitive impact, bundle/runtime cost, and rejection reasons for relevant alternatives. Record uncertainty; popularity is one input rather than a safety guarantee. Prefer official documentation and upstream code. Installation and lockfile changes must remain tied to the task and existing authorization.

At the end of a substantial task, assess touched code for reuse across projects. A candidate proposal states another credible use, stable API, product coupling, tests, provenance/license, extraction effort, and maintenance owner. A valid outcome is `no candidate` with a brief reason. Avoid speculative abstractions or compulsory package creation. Repository creation, ownership/license decisions, extraction into another project, and publication require explicit applicable authorization.

## Deterministic frontend evidence

Add a separate Playwright visual configuration using the existing `npm run dev:mock` server on `http://127.0.0.1:5174`. Keep the existing environment-based integration E2E configuration intact. Run Chromium headlessly through scripts and Playwright Test; browser-use tools and interactive browser control are not needed.

Use the real application routes and production styles. Reuse current mock fixtures and the `mockUser` selection mechanism. Add named mock scenarios only where current fixtures cannot express a required state. Restrict hooks to explicit development mock mode, preserve regular development and production behavior, and test the guard. Block external HTTP/WebSocket traffic for visual cases and make unexpected attempts visible in the evidence.

Start with 12 chat-shell screenshots: desktop 1440x900 and mobile 390x844, light/dark themes, English/Russian locales, plus four representative state cases (empty, loading, error, and a popup with long text). The eight viewport/theme/locale combinations cover the stable shell; the four extra states use the specific combinations documented in the test plan. Include keyboard focus and overflow assertions. Permission-sensitive behavior is checked at its real integration layer, not inferred from a synthetic screenshot.

Use fresh browser contexts, known storage and IndexedDB state, fixed time/timezone, deterministic IDs, bundled/local assets, stable fonts, and disabled motion where appropriate. Wait for semantic UI readiness and font loading. Do not use arbitrary sleeps or broad masks that hide the changed element.

First produce evidence screenshots on successful runs. Add screenshot comparisons only after a human reviews initial references. Missing references and changed references fail with artifacts; CI cannot silently accept them. Capture matching base/head states using isolated sequential servers/worktrees or exact revision builds; fail on an occupied port rather than reusing an unidentified server. New states without a meaningful base are explicitly marked. Record browser/OS versions and fix the visual execution environment before enforcing pixel comparisons.

## Independent QA and evaluation

The QA role starts from the accepted requirements and test matrix, then inspects the diff and runs independent scenarios. It reports confirmed findings, gaps, and limitations with reproduction evidence. It does not modify application behavior or weaken expected results. When additional tests are needed, write them in an assigned isolated checkout or return a patch for the implementer to integrate. One fresh QA review per coherent delivery is the default; extra agents are justified by independent scope rather than invoked per file.

Evaluate official Playwright planner/generator definitions as optional inputs against the project QA role. Check the locked CLI's actual capabilities before adoption. Automatic test repair may change selectors or setup only with preserved assertions and traceable rationale; changing the acceptance contract returns to the human review process.

Maintain 12 fixed workflow-evaluation cases, including activation boundaries, correct reuse, regression reproduction, stale approvals, missing evidence, unexpected network access, and unauthorized publication. Use deterministic assertions for process and artifacts; use a named rubric with evidence for qualitative judgments. An LLM score cannot override a failed mandatory check. Run the same cases against a baseline and candidate with recorded model/version, skill revision, runtime, tokens/cost when available, and multiple trials for variable behavior. The default CI exercises validator fixtures; model-backed runs require explicit invocation and available authorized runtime/budget.

## Delivery and GitHub control

Prepare a delivery packet and PR body in English: problem and resulting behavior, related contract/issue, scope, checks, visual evidence, risks, and a short manual review scenario. Preserve existing PR title prefixes, labels, and approximately 300-400 changed code-line guidance. Split by independently reviewable behavior; generated fixtures, snapshots, and lockfiles are explained separately rather than used to conceal scope.

Prepare an idempotent GitHub plan before mutations: inspect existing issues, labels, milestones, Projects, views, and rules; propose only missing items and avoid duplicates. Use one Project with `Backlog`, `Ready`, `In progress`, `Review`, and `Done`; use milestones for a shared release outcome. Map existing field values rather than blindly recreating them. Creating or changing remote items occurs only within explicit human authorization and sufficient API access.

Produce a proposed branch-rules change listing required stable CI check names, required human review, and stale-review handling. Apply only with authorized administrative access, preserve unrelated rules, and read back the result. Keep merge and deployment separate from PR preparation. If settings cannot be applied, report the precise outstanding control rather than claiming enforcement.

Run untrusted PR code in a hosted, secret-free `pull_request` job with read-only permissions and no persistent checkout credentials. Keep visual jobs separate from existing privileged/self-hosted release flows. Publish sanitized screenshots, diffs, HTML reports, and manifests as artifacts. A stable aggregate check always runs and reports success only when every required evidence check passed or was legitimately not applicable. A documentation-only change should not need screenshots. Hosted artifact references must remain useful without relying on local paths or arbitrary Markdown rendering from PR input.

## Acceptance criteria

| ID | Required observable result |
| --- | --- |
| AC-01 | A task routes to one authoritative workflow and the intended project skill; unrelated requests do not activate it. |
| AC-02 | Feature implementation depends on reviewed spec/test-plan contents; stale or unsupported approval cannot advance readiness. |
| AC-03 | Applicable existing authorization is reused; publication, remote management, merge, and deployment scopes remain explicit. |
| AC-04 | Substantial standard functionality receives a documented reuse/dependency decision; trivial tasks avoid compulsory external research. |
| AC-05 | Reuse candidates have a consumer, interface, provenance, and extraction cost; no candidate is an acceptable documented result. |
| AC-06 | One local command produces deterministic headless UI evidence from the real mock app without external services or browser-use tools. |
| AC-07 | Before/after screenshots and approved references match scenario/environment metadata and the exact source contents. |
| AC-08 | Independent QA reports reproducible findings and missing coverage without changing the acceptance contract. |
| AC-09 | Delivery validation rejects missing, failed, stale, or mismatched mandatory evidence and produces a readable English PR body. |
| AC-10 | CI publishes sanitized evidence securely and exposes a stable required check without blocking unrelated docs changes. |
| AC-11 | GitHub planning is idempotent; authorized mutations and administrative controls are applied and verified separately. |
| AC-12 | Fixed eval cases compare baseline/candidate outcomes; mandatory failures cannot be averaged away. |
| AC-13 | OKF finds all program pages and their relationships; new policy has one source of truth and repaired metadata validates. |
| AC-14 | Skills are portable, project installation preserves unrelated content, and normal development, E2E, and production behavior remain protected. |

## Review and rollout

The user reviews this specification and its test plan together. Preparation of this planning package is already authorized; implementation follows review of its actual contents. Keep the complete program in scope, but deliver it in the ordered, independently verifiable slices in the implementation plan. Gradually enable enforcement: evidence capture first, human-approved visual references next, then stable CI requirements after successful pilot runs.

The final pilot is a real small frontend change and a backend/contract change with known accepted behavior. Each goes through the full route, with an intentional failed check proving the gate rejects a bad delivery. The program is complete only when local functionality, eval outcomes, CI behavior, and explicitly authorized remote controls have separate recorded results; unavailable permissions remain visible outstanding items.
