# CI Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shorten frontend and backend CI wall time without reducing test or lint coverage, using the four available self-hosted runners efficiently.

**Architecture:** Start frontend CI and backend CI independently because they use separate `e2e` and `tests` runner pools. Within the two-runner backend pool, split the slow `internal/app` integration suite into two deterministic process shards with one isolated PostgreSQL and Redis pair per shard; keep Go package-level parallelism and use the two machines as the outer concurrency layer. Tune Vitest workers and Go lint only against repeated measurements on the actual runners.

**Tech Stack:** GitHub Actions YAML, Windows self-hosted runners, Go test, golangci-lint v2, Vitest, PostgreSQL, Redis, GitHub Actions artifacts/cache.

**Spec:** This document's [design and acceptance criteria](#design-and-acceptance-criteria) section.

## Global Constraints

- Keep the existing `Backend CI` aggregate check as the backend deploy gate.
- Use no more than two simultaneously scheduled backend jobs requiring the `tests` runner label.
- Each backend integration shard gets its own PostgreSQL and Redis services; tests must never share mutable service state across shards.
- Do not add `t.Parallel()` to tests that mutate shared in-process or service state.
- Preserve full Go test and lint coverage, atomic coverage output, migration validation, and workflow conditions.
- Keep full Vitest coverage; worker tuning may change concurrency but may not skip suites.
- Do not remove the npm cache cleanup until its purpose, disk impact, and repeat-run timings are understood.
- Do not merge or deploy without separate authorization.

## Review Focus

- A test name lands in zero or multiple shards: test the selector for deterministic, exhaustive, disjoint assignment.
- One shard mutates another shard's database or Redis: assert distinct per-shard service/container names and endpoints.
- Sharding silently drops Go coverage: test the coverage merge with profiles from both shards and preserve the existing summary/artifact.
- Runner queueing erases the expected speedup: keep heavy backend work within two runner lanes and measure queue time separately from execution time.
- Higher Vitest concurrency causes memory pressure or flakes: compare 1, 2, and 3 workers on the actual E2E runners over repeated runs.

---

## Design and Acceptance Criteria

### User-facing summary

1. Run frontend CI and backend CI in parallel; they use separate runner pools.
2. Benchmark Vitest with 2 and 3 framework workers, then set the fastest stable count for the E2E runner. Current CI is pinned to one worker.
3. Split backend tests into two Go processes on the two `tests` runner machines. Split only the expensive `backend/internal/app` package initially; run every other package exactly once. Give each process its own PostgreSQL and Redis containers.
4. Keep Go lint and the two test shards within two runner lanes. Initially run lint alongside shard 0's lane (sequentially if concurrent CPU load is harmful); shard 1 occupies the other lane. Do not create an unbounded third heavy job that just waits for a runner.
5. Preserve and merge atomic coverage from both shards before publishing the current backend coverage report.
6. Profile the 179-second Go lint step and cache behavior, tune only proven bottlenecks, and investigate the roughly 23-second npm cache cleanup as a separate small win.

### Baseline evidence

- GitHub Actions run `40465193894` on `0171ab5f`: `Go lint` took 179 seconds; `Ent generation drift` 18 seconds; the golangci binary cache step 15 seconds; binary install 2 seconds. The lint action has `skip-cache: false`, so first determine whether the analysis cache is being restored and saved before changing cache settings.
- In that same run the golangci **analysis** cache was a hit, but its 7.2 MB restore took 74.6 seconds. The 15.6 MB binary cache was also a hit and took about 14 seconds to restore. This makes remote cache transfer a concrete optimization candidate; set the runner-local cache path explicitly before trying `skip-cache: true` so the persistent runner can reuse it.
- Three representative CI runs show why before/after must use the same revision: PR #301 run `40159842624` completed with frontend tests in 173 seconds and backend tests in 522 seconds; master run `40274939550` used frontend tests in about 394 seconds and backend tests in 574 seconds; master run `40465193894` used one Vitest worker, took 707 seconds in frontend tests, and backend `internal/app` hit Go's 10-minute package timeout. The latter also reports `TestIntelligenceSourcePostgresContract` failing with HTTP 503 after 161 seconds. These runs span different revisions and are context, not a controlled median.
- The same run started Backend CI 22 seconds after Frontend CI completed because `backend-ci` declares `needs: [changes, frontend-ci]`.
- Existing `frontend/vite.config.ts` pins CI `maxWorkers` to 1. An earlier PR (#301) tried 3 Vitest workers and three Go shards, but required three `tests` runners; PR #303 reverted it without recording a specific failure reason. Re-read both diffs and the run history before reusing any implementation.
- Two online Windows runners currently have the `e2e` label and two have `tests`. Confirm CPU and memory on each actual runner; the user's 12-logical-core PC is not assumed to describe all four machines.
- GitHub's runner inventory API exposes names and labels, not CPU or RAM. Capture that data from actual PR-run jobs before selecting parallelism; recent jobs ran on `web-e2e-runner-win-1/-2` and `ci-runner-1/-2`.
- `go test ./...` already runs different packages concurrently. The `internal/app` integration tests are sequential within that package and `resetTestRuntime` drops/recreates PostgreSQL schema and flushes Redis, so same-process `t.Parallel()` is unsafe.
- Historical run `40274939550` measured frontend tests at about 394 seconds and backend tests at about 574 seconds; use current same-run measurements as the implementation baseline because suite size and runner conditions change.

### Acceptance criteria

- **CI-1:** On a frontend+backend change, Frontend CI and Backend CI become eligible together; frontend-only and backend-only filtering remains unchanged.
- **CI-2:** Vitest worker count is selected from repeatable timings on the E2E runners; report median duration for 1, 2, and 3 workers and retain a configuration only if it improves time without OOMs or new flaky failures.
- **CI-3:** Every selected `internal/app` top-level test is assigned to exactly one of two deterministic shards; subtests stay with their parent test; all other Go packages run once.
- **CI-4:** The two integration shards use distinct PostgreSQL and Redis endpoints and can run at the same time on the two `tests` runners.
- **CI-5:** Merged coverage contains profiles from both shards, is accepted by `go tool cover -func`, and preserves the existing summary and artifact interface.
- **CI-6:** Lint still runs the full configured linter set. Capture cache hit/miss, runner CPU/RAM, and lint duration; only change concurrency or cache keys based on that evidence.
- **CI-7:** Keep exactly the existing deploy gate semantics and `Backend CI` check identity. Both standard and trusted-PR workflows retain their current trust and path-filter behavior.
- **CI-8:** Compare at least three representative complete runs before and after; report median CI critical-path time and separate queue time from job execution time. No test coverage or linter is removed.

## Implementation Map

- `.github/workflows/pipeline.yml`: remove unnecessary frontend prerequisite, schedule two Go test shards, isolate services, run lint within the two available backend lanes, merge coverage in a short aggregate job, preserve the `backend-ci` job ID and deploy conditions.
- `.github/workflows/trusted-pr-tests.yml`: apply matching frontend/backend independence and backend shard behavior where that workflow runs the same checks; keep its aggregate check stable.
- `.github/workflows/pipeline.test.sh` and adjacent workflow contract tests: assert dependency graph, runner labels, shard count, service isolation, and stable deploy gate.
- `frontend/vite.config.ts` and `frontend/vite.config.test.ts`: benchmark/choose a bounded CI worker count; retain automatic local worker selection.
- `backend/internal/app/integration_test.go`: add an explicit shard selection hook only where necessary; keep existing per-test reset semantics.
- `backend/internal/testshard/shard.go` and `backend/internal/testshard/shard_test.go`: deterministic, exhaustive, disjoint root-test assignment and validation.
- `backend/cmd/test-shard/main.go` and its tests: list/select root tests for one shard and merge coverage profiles, or adapt the existing historical implementation after review.
- `backend/.golangci.yml`: change only if runner profiling shows a justified lint concurrency/config improvement.
- `docs/agent-workflows/...` or `CONTRIBUTING.md`: update only if CI commands or contributor-facing test behavior change.

## Implementation Plan

### Task 1: Establish comparable runner baselines

**Files:**
- Modify: `.github/workflows/pipeline.yml` only to add temporary or retained diagnostic output if required; remove diagnostics once evidence is captured unless they have ongoing value.
- Test: no production code change in this task.

- [ ] Capture at least three representative run IDs and exact timestamps for setup, frontend install/test/build, Go lint, Go test, queue delays, and job completion. Record cache hit/miss from completed action logs; label cross-revision figures as context, not a controlled comparison.
- [ ] Capture CPU count and available memory for the actual `e2e` and `tests` runners while running the candidate Vitest settings in Task 3; do not infer runner hardware from the user's PC.
- [ ] Benchmark Vitest with 1, 2, and 3 workers on the same runner class and revision in Task 3; record median and available-memory impact. Avoid delaying the workflow graph change for nine extra complete CI runs before implementation.
- [ ] Verify whether Go package tests other than `internal/app` need DB/Redis by inspecting package test setup and a JSON test run; document the exact set to shard versus run once.
- [ ] Review the PR #301 implementation and PR #303 revert diff plus associated CI runs; list any observed correctness or infrastructure issue before carrying code forward.

**Exit:** historical timings/cache status and test-package scope are recorded; actual runner hardware and controlled Vitest timings are captured in Task 3 before selecting a worker count.

### Task 2: Parallelize frontend and backend job eligibility

**Files:**
- Modify: `.github/workflows/pipeline.yml`
- Modify: `.github/workflows/trusted-pr-tests.yml`
- Test: `.github/workflows/pipeline.test.sh` and any existing trusted-PR workflow contract tests.

- [ ] Add/adjust workflow contract assertions proving backend test shards need only change detection and the final `backend-ci` aggregate needs the backend shards (not `frontend-ci`), in both workflows.
- [ ] Run the workflow contract tests and verify the backend condition remains correct when frontend CI is skipped, failed, or cancelled.
- [ ] Remove only the frontend dependency from backend work; preserve filters, `!cancelled()` behavior, security boundaries, `backend-ci` aggregate job ID/name, and deploy dependencies.
- [ ] Inspect an actual run to verify frontend uses `e2e` and backend uses `tests`, and they start concurrently without queueing each other.

**Exit:** frontend/backend parallel start is verified and both existing job conditions still behave as intended.

### Task 3: Tune Vitest worker count

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/vite.config.test.ts`

- [ ] Update the existing test that asserts `maxWorkers === 1` to assert the measured CI worker count; keep the local configuration assertion that worker count is automatic outside CI.
- [ ] Run the focused config test and frontend suite at the selected count on the runner; capture duration, memory, and flakes across the baseline repetitions.
- [ ] Select the fastest stable count among 1, 2, and 3. Start at 2 if all runner RAM values are not known; permit 3 only when measurements support it.
- [ ] Run the full frontend test suite twice at the candidate count to catch concurrency-sensitive flakiness; do not skip tests.

**Exit:** stable CI worker count selected from actual E2E runner results, with before/after median.

### Task 4: Add and prove deterministic Go test sharding

**Files:**
- Create or adapt: `backend/internal/testshard/shard.go`
- Create or adapt: `backend/internal/testshard/shard_test.go`
- Create or adapt: `backend/cmd/test-shard/main.go` and tests
- Modify only if needed: `backend/internal/app/integration_test.go`

- [ ] Write selector tests proving same input yields same assignment, shard assignments are disjoint, their union is the full test list, invalid shard indexes fail, and subtests follow their root test.
- [ ] Run the focused Go package tests and confirm the new selector tests fail before implementation.
- [ ] Implement two-way stable assignment by root test name; use a measured duration-aware mapping only if the simple deterministic hash creates a materially unbalanced pair. Check in the mapping/algorithm so reruns do not reshuffle tests.
- [ ] Preserve per-test runtime reset; do not introduce `t.Parallel()` or change database semantics as part of sharding.
- [ ] Route all `internal/app` root tests through one of two shards; run every non-app Go package once, not once per shard.
- [ ] Add tests for missing tests, duplicate selection, empty shard, and coverage profile merge behavior.

**Exit:** focused selector tests pass and demonstrate exact coverage of the root test list with no overlap.

### Task 5: Integrate two backend runner lanes and coverage aggregation

**Files:**
- Modify: `.github/workflows/pipeline.yml`
- Modify: `.github/workflows/trusted-pr-tests.yml`
- Modify: `.github/workflows/pipeline.test.sh` and workflow test fixtures/contracts.

- [ ] Move work into a new `backend-test-shards` matrix with exactly two shards and `max-parallel: 2` on `[self-hosted, tests, Windows]`. Keep `backend-ci` as the final, short aggregate job with its existing job ID and `Backend CI` name so it remains the branch-protection/deploy check.
- [ ] Give every shard unique PostgreSQL/Redis container and network/project names based on run ID, attempt, and shard index; export that shard's URLs only to its test process.
- [ ] Run non-app packages exactly once. Assign the current lint/static checks to shard 0's runner lane and keep the other lane available for shard 1, avoiding a third queued heavy job. First use sequential lint+shard in lane 0 as the safe baseline; then benchmark background lint with shard 0 only if actual CPU/RAM supports it.
- [ ] Upload atomic coverage profile from each shard with shard-specific artifact names. The repository restricts Actions to an explicit SHA-pinned allowlist that does not include `actions/download-artifact`, so the existing `backend-ci` aggregate uses a job-scoped `actions: read` token to fetch only artifacts from the current run through GitHub's artifact REST API, validates both shard profiles, merges them, produces the current coverage summary, and uploads the existing aggregate artifact name.
- [ ] Ensure failures in either shard, lint, or coverage merge fail the aggregate gate; cleanup each shard's own containers with `if: always()`.
- [ ] Extend workflow contract tests for exactly two shards, unique service identities, coverage requirements, and preserved deploy gating; run these tests before and after workflow edits.
- [ ] Re-run the focused backend selector/coverage tests, all Go tests, lint, migration validation, and full workflow contract test suite.

**Exit:** two backend runner lanes execute without shared mutable services; the existing `backend-ci` / `Backend CI` aggregate remains the backend deploy gate and reports complete test/lint/coverage results.

### Task 6: Optimize Go lint and dependency setup using evidence

**Files:**
- Modify only if justified: `.github/workflows/pipeline.yml`, `.github/workflows/trusted-pr-tests.yml`, `backend/.golangci.yml`.

- [ ] From completed lint logs, establish whether analysis cache is restored/saved; separate cache restore time, analysis time, and post-save time.
- [ ] If analysis cache misses repeatedly, correct only the golangci cache path/key or action setup; key it on runner OS/arch, Go version, golangci version, config and dependency lock/mod files as appropriate.
- [ ] If warm-cache lint remains close to 179 seconds, profile the configured standard linters and actual runner CPU. Adjust `run.concurrency` only after comparing default with a bounded candidate on the same host; keep every configured linter enabled.
- [ ] Measure `npm cache clean --force` and `npm ci` on repeat runs. If cleaning only discards valid reusable cache and disk is healthy, remove the cleanup and let `npm ci` retain deterministic installs; otherwise keep it and document the disk constraint. Do not add a remote dependency cache without measuring restore cost and trust implications.
- [ ] Compare full pipeline medians across at least three comparable successful runs; report critical-path reduction and any new queue time.

**Exit:** each retained lint/cache change has measured benefit, full lint remains enabled, and the end-to-end pipeline is faster than the recorded baseline.

## Verification and Delivery

- Required focused tests: `go test ./internal/testshard ./cmd/test-shard` (using final package paths), frontend Vitest config test, `.github/workflows/pipeline.test.sh`, YAML/workflow parser checks.
- Required full verification: `go test -count=1 -covermode=atomic` across the complete backend suite via the two shards and merged coverage; full `golangci-lint` run; full frontend `npm test` at the chosen worker count; relevant migration and deployment workflow contracts.
- Validate on the PR's current head until all required CI cells settle; ignore only CodeQL as repository instructions specify.
- Keep unrelated working-tree modifications untouched; commit only files in the approved plan, push the task branch, open/update the PR, attach it, and report measured before/after timings. Do not merge or deploy.

## Risks and Rollback

- The suite may not balance evenly into two shards. Use measured per-root-test durations to balance while preserving deterministic assignments.
- A matrix can leave artifacts with missing coverage if one shard fails. Aggregate only after both succeed and fail closed when an expected profile is absent.
- The repository's selected-action policy rejects an unlisted artifact download action before job creation. Preserve that least-privilege policy; fetch same-run artifacts with the GitHub REST API and grant `actions: read` only to the aggregate job.
- Running lint and tests concurrently on one Windows host can increase both durations or exhaust memory. Begin sequentially in one lane and adopt overlap only after controlled measurements.
- Docker Desktop startup and port allocation can be the new bottleneck. Use unique project/container names and dynamic host ports per shard.
- Previous PR #301 was reverted without a recorded cause. Do not assume its three-runner design or reset strategy is valid for today's two-runner pool.
- If two-shard execution is not faster or reliable on actual runners, keep the verified graph/Vitest improvements and revert only the sharding portion.
