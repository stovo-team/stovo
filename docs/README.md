---
title: "Stovo documentation"
type: index
---

# Stovo documentation

## Self-hosting and operations

- [Docker Compose](self-hosting/docker-compose.md): supported single-host deployment, environment setup, bundled or external infrastructure, ports, persistence, upgrades, backup/restore, and diagnostics.
- [Kubernetes with Helm](self-hosting/kubernetes.md): the `deploy/charts/stovo` chart, Secret handling, persistence, ingress/network requirements, rollout operations, and validation commands.

## Architecture

- [Backend and frontend subsystem map](architecture/subsystems.md): ownership and entry points for backend features, adapters, transports, and the web client.
- [Authentication feature test plan](architecture/authentication-test-plan.md): scenarios and test layers for web passkey, QR sign-in, and guest-invite registration.

## Agent workflows

- [Human approvals and contracts](agent-workflows/approvals.md): reviewed artifacts, freshness, action scopes, and task sizing.

- [Agent workflow improvement program](engineering/agent-workflow-program.md): proposed specification, test/evaluation plan, and implementation sequence for skills, approvals, visual evidence, QA, and GitHub delivery.
- [Bug and issue fixes](agent-workflows/bug-fixes.md): reproduction-first fixes with a required regression test for every bug or defect issue.
- [Feature development](agent-workflows/feature-development.md): feature and test plans, test-first implementation, and relevant verification.
- [Testing and verification](agent-workflows/testing.md): test-layer selection, test quality, isolation, and reporting.
- [Task isolation and delivery](agent-workflows/isolation-and-delivery.md): branches, worktrees, pull requests, publication authorization, and cleanup.
- [PR review findings](agent-workflows/pr-review-findings.md): actionable review comments, evidence, and when to create follow-up issues.
- [GitHub Project, milestone, and rules planning](agent-workflows/github-projects.md): idempotent discovery, scopes, Project statuses, and ruleset administration.

## Engineering

- [Frontend UI conventions](engineering/frontend-ui-conventions.md): translation catalogs, shared components, design tokens, and focused checks.

## Project references

- [Repository README](../README.md): project overview and quick start.
- [Environment template](../.env.example): Compose configuration reference. Use it as a starting point; do not deploy its placeholder credentials.
- [Database migrations](../backend/migrations/): versioned Atlas migrations applied by the Compose `backend-migrate` service.
- [Atlas baseline procedure](../backend/migrations/BASELINE.md): inspect and baseline an existing schema during a documented migration cutover.
- [Contributor guide](../CONTRIBUTING.md) and [security policy](../SECURITY.md).

## Optional local search index

Install [`okf-agent`](https://github.com/left-try/okf-agent) with `pipx` if you want full-text search and backlinks across these Markdown pages:

```sh
pipx install "git+https://github.com/left-try/okf-agent.git@ed3a192d0e44437a446d51d02781a3fa9a5cda93"
okf-agent bundle index --root docs --index-root .okf-index/docs
okf-agent bundle search "backup restore" --root docs --index-root .okf-index/docs
okf-agent bundle backlinks architecture/subsystems.md --root docs --index-root .okf-index/docs
okf-agent bundle validate --root docs --index-root .okf-index/docs
```

The index is local, rebuildable, and ignored by Git. The Markdown pages remain the source of truth. Each page carries a short YAML frontmatter `title` and `type` so search results have useful labels and the corpus can be validated. Quote hyphenated search phrases such as `"self-host"`.

## Scope and accuracy

Deployment instructions in this directory describe the repository's production Compose stack and its Helm chart. `deploy/compose/dev.yml`, `deploy/compose/stage.yml`, `deploy/compose/production-multiserver.yml`, and `deploy/livekit.yaml` are for development, staging, orchestration, or local reference use; they are not drop-in production manifests. Check the chart's own defaults before applying chart-specific settings:

```sh
helm show values deploy/charts/stovo
```
