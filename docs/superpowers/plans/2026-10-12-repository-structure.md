# Repository Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group deployment files by responsibility, move the chat-transfer fixture into `e2e/`, and keep the application package boundaries intact.

**Architecture:** Keep the Go backend and its Atlas migrations together. Put the Helm chart, orchestrator master-database SQL, ntfy Compose configuration, and deployment helpers under `deploy/`; keep frontend package configuration at the npm/Vite root and place its CSS contract tests with frontend source.

**Tech Stack:** Git, GitHub Actions, Docker Compose, Helm, Node.js, npm, Vitest, Go.

**Spec:** `docs/superpowers/specs/2026-10-12-repository-structure-design.md`

## Global Constraints

- Preserve runtime behavior, service definitions, migration contents, fixture contents, and existing service data paths.
- Keep `backend/` package structure and `backend/migrations/` unchanged.
- Keep the top-level `e2e/` directory and `uploads/.gitkeep` unchanged.
- Keep frontend package/build configuration and the standalone call UI preview entrypoint at the frontend root.
- Keep general architecture-check tooling under root `scripts/`.
- Do not publish, push, merge, or open a pull request.

## Review Focus

- The Helm chart's new path is used by documentation checks and every documented Helm command. Pin this with `.github/docs-validation.test.mjs`, `helm lint`, and `helm template` in Task 1.
- The Compose ntfy bind mount resolves to the moved configuration file. Pin this with both production Compose `config --quiet` commands in Task 1.
- CI still classifies master-database migrations and deploy-script changes for the backend/deployment workflow. Pin this with `.github/workflows/pipeline.test.sh` and the deployment workflow checks in Task 2.
- Deployment helpers still resolve sibling scripts and run from the repository root after relocation. Pin this with `ensure-docker-buildx.test.sh`, `deploy-environment.test.ps1`, and the workflow path checks in Task 2.
- The fixture bytes remain identical and moved CSS contract tests are discovered by Vitest. Pin this with `cmp` and the frontend test, lint, and build commands in Task 3.

---

### Task 1: Move deployment configuration into `deploy/`

**Files:**
- Move: `charts/stovo/` → `deploy/charts/stovo/`
- Move: `migrations/master/` → `deploy/migrations/master/`
- Move: `ntfy/server.yml` → `deploy/ntfy/server.yml`
- Modify: `deploy/compose/production-bluegreen.yml`
- Modify: `.gitignore`
- Modify: `.github/docs-validation.test.mjs`
- Modify: `.github/workflows/docs-validation.yml`
- Modify: `.github/workflows/pipeline.yml`
- Modify: `.github/workflows/trusted-pr-tests.yml`
- Modify: `.github/workflows/deploy.test.ps1`
- Modify: `docs/README.md`
- Modify: `docs/self-hosting/kubernetes.md`

**Interfaces:**
- Consumes: Compose still runs with `--project-directory .`; CI and documentation use paths relative to the repository root.
- Produces: Helm chart at `deploy/charts/stovo/`, master-database scripts at `deploy/migrations/master/`, and ntfy configuration at `deploy/ntfy/server.yml`.

- [ ] **Step 1: Move the deployment-owned directories with Git.** Move each source path to its target path without changing file contents. Leave `backend/migrations/` and `uploads/` untouched.
- [ ] **Step 2: Update every maintained consumer of those paths.** Change the production Compose ntfy mount, ignore rules for ntfy's local state, documentation and Helm invocations, workflow path filters and master-migration loop, and static deployment/chart checks. Keep workflow filters covering the new `deploy/**` paths.
- [ ] **Step 3: Verify deployment configuration and chart discovery.** Run:

  ```sh
  docker compose --project-directory . -f deploy/compose/production-bluegreen.yml --env-file .env.example config --quiet
  docker compose --project-directory . -f deploy/compose/production-bluegreen.yml -f deploy/compose/external-overlay.yml --env-file .env.example config --quiet
  node --test .github/docs-validation.test.mjs
  helm lint deploy/charts/stovo \
    --set backend.image.repository=registry.example.test/stovo/backend \
    --set backend.image.tag=v1.2.3 \
    --set frontend.image.repository=registry.example.test/stovo/frontend \
    --set frontend.image.tag=v1.2.3
  helm template stovo deploy/charts/stovo \
    --set backend.image.repository=registry.example.test/stovo/backend \
    --set backend.image.tag=v1.2.3 \
    --set frontend.image.repository=registry.example.test/stovo/frontend \
    --set frontend.image.tag=v1.2.3
  ```

  Expected: both Compose commands and the documentation test pass; the documentation test skips Helm CLI cases if Helm is unavailable. Direct Helm commands pass when Helm is installed. Report unavailable commands instead of claiming they passed.
- [ ] **Step 4: Commit this deployment-configuration slice.** Use a focused commit such as `Refactor: group deployment configuration`.

---

### Task 2: Group deployment helpers under `deploy/scripts/`

**Files:**
- Move: `scripts/deploy-environment.sh` → `deploy/scripts/deploy-environment.sh`
- Move: `scripts/deploy-environment.test.ps1` → `deploy/scripts/deploy-environment.test.ps1`
- Move: `scripts/deploy-stage.sh` → `deploy/scripts/deploy-stage.sh`
- Move: `scripts/ensure-docker-buildx.sh` → `deploy/scripts/ensure-docker-buildx.sh`
- Move: `scripts/ensure-docker-buildx.test.sh` → `deploy/scripts/ensure-docker-buildx.test.sh`
- Modify: `.gitignore`
- Modify: `.github/workflows/dev-deploy.yml`
- Modify: `.github/workflows/stage-e2e-gate.yml`
- Modify: `.github/workflows/pipeline.yml`
- Modify: `.github/workflows/pipeline.test.sh`
- Modify: `.github/workflows/deploy.test.ps1`

**Interfaces:**
- Consumes: The deployment jobs execute from the repository root; `deploy-stage.sh` invokes `deploy-environment.sh` beside itself.
- Produces: Deployment helpers under `deploy/scripts/`; architecture checks and baseline tools remain under `scripts/`.

- [ ] **Step 1: Move the five deployment helper and test files with Git.** Move both helper/test pairs and the stage wrapper together so the wrapper's sibling-script lookup stays valid.
- [ ] **Step 2: Update CI commands, workflow path filters, static assertions, and `.gitignore`.** Keep root SOLID tooling paths unchanged; point deploy workflow steps and shell test invocations at `deploy/scripts/`.
- [ ] **Step 3: Verify workflow contracts and helper tests.** Run:

  ```sh
  bash .github/workflows/pipeline.test.sh
  bash -n deploy/scripts/deploy-stage.sh deploy/scripts/deploy-environment.sh deploy/scripts/ensure-docker-buildx.sh
  test -f "$(dirname deploy/scripts/deploy-stage.sh)/deploy-environment.sh"
  pwsh -NoProfile -File .github/workflows/deploy.test.ps1
  pwsh -NoProfile -File deploy/scripts/deploy-environment.test.ps1
  ```

  Expected: available checks pass. If `pwsh` is unavailable, record that limitation and retain the workflow's shell/static checks.
- [ ] **Step 4: Commit this deployment-tooling slice.** Use a focused commit such as `Refactor: group deployment scripts`.

---

### Task 3: Place test fixtures and frontend style checks with their suites

**Files:**
- Move: `testdata/chat-transfer/v1/single-chat.json` → `e2e/fixtures/chat-transfer/v1/single-chat.json`
- Modify: `docs/superpowers/plans/2026-10-11-chat-import-export.md`
- Move: `frontend/styles.emoji-picker.test.ts` → `frontend/src/styles.emoji-picker.test.ts`
- Move: `frontend/styles.scrollbar.test.ts` → `frontend/src/styles.scrollbar.test.ts`
- Move: `frontend/styles.voice-channel.test.ts` → `frontend/src/styles.voice-channel.test.ts`

**Interfaces:**
- Consumes: Vitest runs from `frontend/` and reads frontend source paths relative to that package root.
- Produces: The chat-transfer fixture under `e2e/fixtures/` and CSS contract tests beside existing `frontend/src/styles.*.test.ts` files.

- [ ] **Step 1: Move the fixture and CSS contract tests with Git.** Do not edit the JSON fixture or test assertions.
- [ ] **Step 2: Update the chat import/export plan to name the new fixture path.** Do not change application import/export behavior.
- [ ] **Step 3: Verify fixture identity and frontend checks.** From the repository root, run:

  ```sh
  git show HEAD:testdata/chat-transfer/v1/single-chat.json | cmp - e2e/fixtures/chat-transfer/v1/single-chat.json
  cd frontend
  npm ci
  npm test
  npm run lint
  npm run build
  ```

  Expected: `cmp` reports no differences and the frontend commands pass. The three moved tests must appear in the Vitest run.
- [ ] **Step 4: Commit this test-asset slice.** Use a focused commit such as `Refactor: organize test assets`.

---

## Final Branch Audit

- [ ] Confirm the working tree is clean and the branch contains the approved design commit, this plan commit, and the three scoped implementation commits, with no unrelated changes.
- [ ] Search maintained files for old root-relative paths (`charts/stovo`, `migrations/master`, `ntfy/server.yml`, the five moved `scripts/*` paths, `testdata/chat-transfer/`, and the three root-level style-test paths). Review matches and leave only intentional historical source-path mentions in the approved design and implementation planning documents or Git history.
- [ ] Confirm the old root directories no longer contain tracked deployment assets or the chat-transfer fixture; confirm `backend/migrations/`, `uploads/.gitkeep`, and the frontend call preview entrypoint remain in place.
- [ ] Re-run the applicable Compose configuration, documentation/deployment, pipeline workflow, and frontend checks above after all moves.
- [ ] Report each command's result and clearly identify checks skipped because Docker, Helm, PowerShell, or a running E2E environment is unavailable. Do not run E2E against an unspecified environment.
