---
title: "Stovo documentation"
type: index
---

# Stovo documentation

Choose a starting point for your role. The Markdown in this repository is the source of truth for these guides and changes alongside the code. The [product README](../README.md) introduces Stovo and its capabilities.

## Use Stovo

- [Get started with Stovo](user-guide/getting-started.md): join a workspace and find your way around.
- [Conversations and calls](user-guide/conversations-and-calls.md): create chats, send messages and meet.
- [Files and plans](user-guide/files-and-plans.md): find and share files, and view or create plans.

## Administer a workspace

- [Workspace administration](administration/getting-started.md): initial owner setup, invitations, roles, member access and operator handoff.
- [Security policy](../SECURITY.md): private vulnerability reporting and deployment security practices.

## Self-host and operate

- [Docker Compose](self-hosting/docker-compose.md): single-host deployment, configuration, networking, backups, upgrades and diagnostics.
- [Kubernetes with Helm](self-hosting/kubernetes.md): chart configuration, external services, secrets, persistence and rollout operations.
- [Intelligence Source v2 operations](integrations/intelligence-source-v2.md): source integration and operational boundaries.

## Develop and contribute

- [Developer getting started](engineering/getting-started.md): mock frontend, source builds and links to verification.
- [Contributing](../CONTRIBUTING.md): propose changes, run checks and prepare a pull request.
- [End-to-end tests](../e2e/README.md): mock UI and visual test setup.
- [Backend and frontend subsystem map](architecture/subsystems.md): feature boundaries and code entry points.
- [Frontend UI conventions](engineering/frontend-ui-conventions.md): shared components, translations, design tokens and focused checks.
- [Authentication feature test plan](architecture/authentication-test-plan.md): web passkey, QR sign-in and guest-invite scenarios.

## Agent workflows

- [Human approvals and contracts](agent-workflows/approvals.md): reviewed artifacts, freshness and action scopes.
- [Bug and issue fixes](agent-workflows/bug-fixes.md): reproduction-first fixes and regression tests.
- [Feature development](agent-workflows/feature-development.md): feature plans and verification.
- [Testing and verification](agent-workflows/testing.md): test-layer selection and reporting.
- [Task isolation and delivery](agent-workflows/isolation-and-delivery.md): branches, worktrees and pull requests.
- [PR review findings](agent-workflows/pr-review-findings.md): review comments, evidence and follow-up.
- [GitHub Project, milestone and rules planning](agent-workflows/github-projects.md): project administration.
- [Agent workflow improvement program](engineering/agent-workflow-program.md): proposed changes and evaluation sequence.

## Historical plans and evidence

[Feature plans](feature-plans/), [dated specifications and implementation plans](superpowers/), [other plans](plans/) and [evidence](evidence/) record particular pieces of work. They can describe proposals or past behavior; use the current guides and source code to verify present behavior.

## Search the documentation with OKF

The standalone `okf-agent bundle` profile can index these Markdown pages without initializing repository hooks or writing to the source pages. The current OKF CLI is a Rust binary; see the [okf-agent installation instructions](https://github.com/left-try/okf-agent#install) for releases and Cargo installation. For example:

```sh
okf-agent bundle index --root docs --index-root .okf-index/docs
okf-agent bundle search 'backup restore' --root docs --index-root .okf-index/docs
okf-agent bundle backlinks architecture/subsystems.md --root docs --index-root .okf-index/docs
okf-agent bundle validate --root docs --index-root .okf-index/docs
```

The local index is rebuildable and ignored by Git; rebuild it after changing documentation. Searches cover `docs/` only, including historical material, so inspect the result's path and date before relying on it. Results are not currently ordered by relevance ([issue #20](https://github.com/left-try/okf-agent/issues/20)). For an operator-focused search, build a separate index of `docs/self-hosting` and search that narrower root:

```sh
okf-agent bundle index --root docs/self-hosting --index-root .okf-index/self-hosting
okf-agent bundle search 'backup restore' --root docs/self-hosting --index-root .okf-index/self-hosting
```

Quote hyphenated phrases such as `"self-host"`. Links outside the bundle root can be reported as diagnostics even when their targets exist; OKF also currently reports some existing images and directories as broken ([issue #18](https://github.com/left-try/okf-agent/issues/18), [issue #23](https://github.com/left-try/okf-agent/issues/23)).

The separate `okf-agent index` and `docs build` repository profile uses `.okf/` knowledge. In the tested version, `index` creates `.okf/` templates when absent and updates `.gitignore` ([issue #22](https://github.com/left-try/okf-agent/issues/22)); review these repository changes before adopting the profile. Its generated local wiki is not this documentation index and is not published automatically. Its current web interface does not render page links correctly ([issue #19](https://github.com/left-try/okf-agent/issues/19)) or provide the advertised search control ([issue #21](https://github.com/left-try/okf-agent/issues/21)).

## Project references and scope

- [Environment template](../.env.example): Compose configuration reference; replace example credentials before use.
- [Database migrations](../backend/migrations/) and [Atlas baseline procedure](../backend/migrations/BASELINE.md).
- [Contributor guide](../CONTRIBUTING.md) and [security policy](../SECURITY.md).

Deployment guides describe the production Compose stack and Helm chart. Development and staging manifests are not drop-in production manifests. Check chart defaults with `helm show values deploy/charts/stovo` before applying chart-specific settings.
