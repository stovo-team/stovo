# Stovo documentation

## Self-hosting and operations

- [Docker Compose](self-hosting/docker-compose.md): supported single-host deployment, environment setup, bundled or external infrastructure, ports, persistence, upgrades, backup/restore, and diagnostics.
- [Kubernetes with Helm](self-hosting/kubernetes.md): the `deploy/charts/stovo` chart, Secret handling, persistence, ingress/network requirements, rollout operations, and validation commands.

## Architecture

- [Backend and frontend subsystem map](architecture/subsystems.md): ownership and entry points for backend features, adapters, transports, and the web client.
- [Authentication feature test plan](architecture/authentication-test-plan.md): scenarios and test layers for web passkey, QR sign-in, and guest-invite registration.

## Agent workflows

- [Bug and issue fixes](agent-workflows/bug-fixes.md): reproduction-first fixes with a required regression test for every bug or defect issue.
- [Feature development](agent-workflows/feature-development.md): feature and test plans, test-first implementation, and relevant verification.
- [Testing and verification](agent-workflows/testing.md): test-layer selection, test quality, isolation, and reporting.
- [Task isolation and delivery](agent-workflows/isolation-and-delivery.md): branches, worktrees, pull requests, publication authorization, and cleanup.

## Project references

- [Repository README](../README.md): project overview and quick start.
- [Environment template](../.env.example): Compose configuration reference. Use it as a starting point; do not deploy its placeholder credentials.
- [Database migrations](../backend/migrations/): versioned Atlas migrations applied by the Compose `backend-migrate` service.
- [Atlas baseline procedure](../backend/migrations/BASELINE.md): inspect and baseline an existing schema during a documented migration cutover.
- [Contributor guide](../CONTRIBUTING.md) and [security policy](../SECURITY.md).

## Scope and accuracy

Deployment instructions in this directory describe the repository's production Compose stack and its Helm chart. `deploy/compose/dev.yml`, `deploy/compose/stage.yml`, `deploy/compose/production-multiserver.yml`, and `deploy/livekit.yaml` are for development, staging, orchestration, or local reference use; they are not drop-in production manifests. Check the chart's own defaults before applying chart-specific settings:

```sh
helm show values deploy/charts/stovo
```
