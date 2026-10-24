# CI Test Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce CI test wall time by using three Vitest workers, removing repeated PostgreSQL schema migration setup, and splitting backend tests across three isolated CI jobs.

**Architecture:** Keep frontend worker selection local to `vite.config.ts`. In backend integration tests, initialize the schema once per process and reset table rows plus Redis before each sequential server test. A small deterministic shard helper selects `internal/app` test names, and CI runs one shard per matrix entry with unique test-service containers and per-shard coverage; a merge step preserves the current combined coverage artifact. The existing `backend-ci` matrix job remains the deploy dependency, and lint runs once on shard 0. Apply the same backend test contract to both standard and trusted PR workflows.

**Tech Stack:** Vitest, Go testing package, PostgreSQL, Redis, GitHub Actions, PowerShell and Git Bash on Windows self-hosted runners.

**Spec:** `docs/superpowers/specs/2026-10-24-ci-test-performance-design.md`

## Global Constraints

- Frontend CI uses exactly three Vitest workers; local Vitest worker selection remains automatic.
- Backend integration tests remain sequential within each shard.
- Every backend test function runs exactly once across three shards.
- Each shard gets its own PostgreSQL and Redis containers using dynamically allocated loopback ports.
- `TEST_DATABASE_URL` and `TEST_REDIS_URL` use resolved host ports. Keep `ATLAS_DATABASE_URL` on container port 5432 because Atlas runs in the PostgreSQL container network namespace.
- Merge coverage in `atomic` mode and retain the `backend-coverage` artifact and summary.
- Keep the aggregate backend CI gate for deployment; do not change deploy behavior.
- Do not modify unrelated working-tree changes or publish the branch.

## Review Focus

- Schema initialization errors must be returned to the calling test setup and fail that test immediately.
- Resetting data must preserve schema and restart identity sequences; prove with a real PostgreSQL fixture regression test.
- Empty or changed test-name input must not leave tests unassigned; test deterministic, complete, non-overlapping shard assignment.
- Coverage profiles must share a mode; disjoint blocks are unioned, while duplicate block keys with conflicting statement counts must fail clearly.
- Windows runner shards must not collide on container names or ports; workflow contract checks must verify unique shard suffixes and dynamic host ports in both workflows.

---

### Task 1: Frontend Vitest worker count

**Files:**
- Modify: `frontend/vite.config.ts`
- Test: `frontend/vite.config.test.ts`

**Interfaces:**
- Consumes: existing `CI` environment variable.
- Produces: `maxWorkers === 3` when `CI` is set and `undefined` otherwise.

- [ ] Update the CI config contract test to expect three workers and run the focused Vitest config test; it should fail against the current one-worker config.
- [ ] Set `maxWorkers` to `process.env.CI ? 3 : undefined` and revise the comment to reflect the new Windows runner capacity.
- [ ] Run the focused config test and frontend lint.

### Task 2: Reuse backend schema and reset data between integration tests

**Files:**
- Modify: `backend/internal/app/integration_test.go`
- Test: `backend/internal/app/integration_test.go`

**Interfaces:**
- Consumes: existing `resetTestRuntime(t, databaseURL, redisURL)` call from `newTestServer`.
- Produces: one schema initialization per app test process, followed by data/sequence reset and Redis flush on each call.

- [ ] Add a PostgreSQL-backed regression test that calls the reset path twice and proves a probe row is cleared, its generated identity restarts, the table remains present, and Redis is flushed; run it against disposable PostgreSQL and Redis and confirm it fails with the current drop-schema implementation.
- [ ] Replace repeated schema drop/recreation and migration replay with a process-scoped schema initializer guarded by `sync.Once`; cache and report any initialization error.
- [ ] Reset public table data with `TRUNCATE ... RESTART IDENTITY CASCADE` while retaining schema objects, and flush Redis on each test setup.
- [ ] Run the fixture regression and focused `internal/app` integration tests against disposable local services.

### Task 3: Deterministic backend test sharding and coverage merging

**Files:**
- Create: `backend/internal/testshard/shard.go`
- Test: `backend/internal/testshard/shard_test.go`
- Create: `backend/internal/testshard/coverage.go`
- Test: `backend/internal/testshard/coverage_test.go`
- Create: `backend/cmd/test-shard/main.go`

**Interfaces:**
- Produces: `Select(names []string, shardIndex, shardCount int) ([]string, error)` using stable name sorting and a stable hash; valid shard indexes are zero-based.
- Produces: coverage merge that requires identical `mode:` headers and block keys, sums statement counters, and emits a single profile.
- CLI reads `go test -list '^Test'` output from stdin and prints a Go `-run` regular expression for one shard; it also provides a coverage merge subcommand for downloaded profiles.

- [ ] Add tests for stable assignment, no overlap, complete union, empty input, invalid shard indexes, matching atomic profiles, counter sums, and incompatible profiles; run them and confirm missing implementations fail.
- [ ] Implement the selector, coverage merger, and CLI with explicit validation and useful errors.
- [ ] Run `go test ./internal/testshard ./cmd/test-shard` and exercise CLI output with the current `internal/app` test list.

### Task 4: Three isolated backend CI shards and aggregate coverage

**Files:**
- Modify: `.github/workflows/pipeline.yml`
- Modify: `.github/workflows/trusted-pr-tests.yml`
- Modify: `.github/workflows/pipeline.test.sh`
- Test: `.github/workflows/pipeline.test.sh`
- Test: `.github/workflows/deploy.test.ps1`

**Interfaces:**
- Consumes: `test-shard` CLI from Task 3 and the existing `backend-ci` job identity used by deployment dependencies.
- Produces: three backend test matrix jobs; every app test selected once, non-app packages tested once on shard 0, and one merged `backend-coverage` artifact in the standard pipeline.

- [ ] Extend workflow contract checks to require three matrix shards, unique shard-qualified PostgreSQL/Redis names, dynamic ports, correct internal `ATLAS_DATABASE_URL` port in the standard pipeline, and the merged coverage artifact; run the contract script and confirm it fails before workflow changes.
- [ ] Split backend test execution into three shards in both workflows. Run lint once on shard 0, retain `backend-ci` as the matrix job ID used by deployment, and guard quick non-test checks so they are not repeated by every shard.
- [ ] Upload shard-specific coverage profiles and merge them into the existing coverage summary/artifact in the standard workflow; run the trusted PR workflow without coverage as it does today.
- [ ] Run `.github/workflows/pipeline.test.sh`, `deploy.test.ps1`, and YAML/workflow validation available locally.

### Task 5: End-to-end verification and review

**Files:**
- Review: all files above

- [ ] Run the repository-required backend and frontend checks that are available, plus workflow contract tests.
- [ ] Inspect `git diff --check` and the final diff; confirm no deployment steps changed and unrelated files remain unstaged.
- [ ] Record any checks that require Windows runners or external services and cannot run in this environment.

---
