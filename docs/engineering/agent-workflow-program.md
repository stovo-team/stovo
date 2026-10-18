---
title: "Agent workflow improvement program"
type: index
---

# Agent workflow improvement program

**Status:** Proposed implementation; planning artifacts prepared on 2026-10-19.

The user approved the scope of improving skills, feature contracts, human approvals, dependency research, reusable-code discovery, independent QA, frontend evidence, workflow evaluations, and GitHub delivery. This page connects the concrete design and rollout documents for review. Approval of that scope does not assert that these newly written artifacts have already been reviewed, implemented, or deployed.

## Read and review in this order

1. [Design and acceptance criteria](../superpowers/specs/2026-10-19-agent-workflow-system-design.md): responsibilities, permission boundaries, artifact formats, and intended behavior.
2. [Test and evaluation plan](../feature-plans/agent-workflow-system-tests.md): requirement-to-check mapping, negative cases, visual coverage, and rollout evidence.
3. [Implementation plan](../superpowers/plans/2026-10-19-agent-workflow-system.md): exact files, interfaces, task order, commands, and reviewable delivery slices.

## Existing authorities

- [Feature development](../agent-workflows/feature-development.md), [bug fixes](../agent-workflows/bug-fixes.md), and [testing](../agent-workflows/testing.md) remain the active development policy until their proposed revisions are implemented.
- [Isolation and delivery](../agent-workflows/isolation-and-delivery.md) governs branches, local commits, publication authorization, and cleanup.
- [PR review findings](../agent-workflows/pr-review-findings.md) already requires evidence and limits automatic issue creation.
- [Frontend conventions](frontend-ui-conventions.md) and [popup standards](../ui/popup-standards.md) govern UI reuse.
- [Local mock design](../superpowers/specs/2026-10-09-frontend-mock-mode-design.md) describes why the real application runs against synthetic local data.

## Baseline inspected

Planning started from locally available `origin/master` at commit `26e3aebe72c4441fc518d31d24826e11af5006e9`. Remote repository settings and currently installed personal skill files are not modified by this planning change.

| Existing capability | Gap addressed by the program |
| --- | --- |
| Feature and test plans, test-first implementation | Explicit combined contract approval and freshness tracking |
| Ponytail implementation guidance and UI reuse rules | Conditional external dependency research and optional extraction proposals |
| Superpowers and Matt Pocock skills | One repository policy, explicit routing, portable project skills, and measurable activation |
| Vite `dev:mock` on loopback port 5174 | A dedicated headless visual suite and deterministic states |
| Playwright locked at 1.62.1 in `e2e/package-lock.json` | Screenshots on successful visual checks, before/after comparison, and evidence manifests |
| PR guidance and screenshot evidence requirements | A delivery packet, reproducible validation, and an independent QA role |
| Existing GitHub issue forms and CI | Optional authorized Project/milestone management and enforceable review gates |
| OKF bundle search over 51 existing documents | Linked program artifacts and a baseline-aware documentation cleanup |

## Documentation organization with okf-agent

Canonical content stays in Markdown. Each new document has YAML `title` and `type`; ordinary relative Markdown links provide relationships. The disposable `.okf-index/docs` directory remains ignored by Git. Search and backlinks locate existing material before another policy page is added.

From the repository root:

```sh
okf-agent bundle index --root docs --index-root .okf-index/docs
okf-agent bundle search '"agent workflow"' --root docs --index-root .okf-index/docs --limit 10
okf-agent bundle backlinks engineering/agent-workflow-program.md --root docs --index-root .okf-index/docs
okf-agent bundle validate --root docs --index-root .okf-index/docs
```

The initial full-corpus validation reports 10 existing missing-frontmatter errors and 7 diagnostics for intentional links outside the `docs/` bundle. The implementation plan includes the metadata repair. Planning acceptance requires no new diagnostics and valid new pages; it does not relabel the existing full-corpus failure as a pass. Repository-wide link checks continue to validate the destinations of links that leave the bundle.

## Delivery boundary

This program is one coordinated scope delivered through several coherent PRs. Local preparation and verification do not authorize publishing repositories, installing personal skills globally, creating issues or Projects, changing branch rules, merging, or deploying. Record existing task-specific or standing human authorization and reuse it within its stated scope.

## Planning verification

On 2026-10-19, the existing Markdown-link and documented-configuration tests passed (2 tests, 0 failures). OKF indexing found 55 documents after the four program pages were added; search returned all four pages and backlinks linked them with this entry and the documentation index. Comparing validation to the pre-change baseline showed no new diagnostics: the same 10 missing-frontmatter errors and 7 bundle-escape diagnostics remain. `git diff --check` is part of final local verification. Application tests, chargeable model evals, live GitHub changes, and visual execution are implementation tasks, not results asserted by this planning package.

## Upstream references

- [OpenAI skill mechanics](https://learn.chatgpt.com/docs/build-skills): activation, metadata and progressive disclosure.
- [OpenAI skill evaluations](https://developers.openai.com/blog/eval-skills): fixed success checks and recorded task runs.
- [Playwright local web server](https://playwright.dev/docs/test-webserver) and [visual comparisons](https://playwright.dev/docs/test-snapshots): owned server startup and reference screenshots.
- [Playwright Test Agents](https://playwright.dev/docs/test-agents): planner/generator/healer capabilities to evaluate against the custom QA role before adoption.
