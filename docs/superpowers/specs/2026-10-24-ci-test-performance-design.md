# CI Test Performance Design

## Intent

Reduce frontend and backend test time while preserving the full test suite, coverage reporting, and the current CI gates. Do not change deployment behavior.

## Current evidence

- GitHub Actions run 40063860845: frontend tests took 7m11s; dependency install took 1m03s; frontend build took about 30s. Backend test step took 9m00s.
- GitHub Actions run 40062443740: backend test step took 9m26s. Its `internal/app` package took 518.884s, while other packages finished much earlier.
- The `internal/app` test helper is called by 34 tests. Each call drops and recreates the PostgreSQL schema, applies the schema snapshot and all 45 migrations, and flushes Redis. The package currently has no `t.Parallel` calls; concurrent tests would race against the shared schema reset.

## Goals

- Run frontend CI tests with three Vitest workers.
- Avoid replaying the PostgreSQL schema and migrations before every integration test.
- Run backend tests across three independently scheduled CI shards with isolated PostgreSQL/Redis services.
- Preserve all test functions and produce one merged backend coverage profile/report.
- Keep test execution deterministic and prevent shard service-port collisions.

## Non-goals

- Optimize deployment jobs or deployment commands.
- Remove tests, reduce test coverage, or make database-backed tests optional.
- Add `t.Parallel` to tests that share mutable integration state.

## Approaches considered

1. **Increase Vitest workers and change `go test -parallel`:** small change, but Go's test-function parallelism is opt-in and `internal/app` has no `t.Parallel`; it does not address the measured backend bottleneck.
2. **Shard Go tests across runners only:** addresses the long package, but each test still rebuilds the schema, and the workflow must isolate database services and merge coverage. This spends runner capacity on repeated setup.
3. **Combined approach (chosen):** set Vitest CI workers to three; initialize the backend schema once per test process, truncate data/reset identities and flush Redis between integration tests; distribute backend test names deterministically across three CI shards, each with its own service containers and ports, then merge coverage profiles. This reduces repeated work and uses parallel runners without racing tests inside a shard.

## Design decisions

- Vitest keeps automatic worker selection outside CI and uses exactly three workers in CI.
- Backend integration tests remain sequential inside each Go test process. A shared helper will initialize the current schema once and reset table data, identities, and Redis before each server-backed test. The helper will retain a fresh database state for every test.
- A deterministic shard selector will assign top-level Go test names to three shards. The union of shard selections must include every test exactly once. CI shards run on the existing Windows `tests` runner label.
- Each shard gets distinct PostgreSQL and Redis container names. Preserve the workflow’s existing dynamically allocated loopback host ports, and pass the host ports to `TEST_DATABASE_URL` and `TEST_REDIS_URL`. Keep `ATLAS_DATABASE_URL` on container port 5432 because Atlas runs in the PostgreSQL container network namespace.
- Each shard uploads a uniquely named Go coverage profile. A small merge step combines statement counters and retains the existing coverage artifact and summary.
- Existing deploy jobs continue to gate on successful backend CI; no deployment commands or rollout logic change.

## Test plan

- Update the frontend config contract test to require three CI workers and retain automatic local worker selection.
- Add a database-backed regression test proving fixture reset retains the schema, clears inserted rows, restarts identities, and flushes Redis.
- Unit-test deterministic backend sharding for complete, non-overlapping assignment and coverage-profile merging for mode/header handling and summed counters.
- Update both `pipeline.yml` and `trusted-pr-tests.yml` plus their workflow contract checks for three shards, unique service/coverage names, and merged coverage. Keep the aggregate backend CI gate in place for deployment.
- Run the focused frontend test, backend helper and sharding tests, workflow contract checks, and the repository-required frontend/backend checks available in this environment.

## Constraints and risks

- The test fixture optimization must account for tests that create schema objects or leave asynchronous work behind; current test sources show no application integration test issuing DDL, and cleanup closes the test server before the next test.
- Three parallel backend jobs require three available runner slots to reduce wall time. With fewer slots, GitHub will queue shards and the wall-time benefit will be smaller. The three shards must be applied consistently to both production and trusted PR validation workflows.
- Backend shards need separate PostgreSQL/Redis services; fixed ports would collide if multiple runner agents share one host, so ports must be selected per shard/job.
- Coverage merging must preserve `atomic` mode and sum counts for matching source blocks; tests will validate this before the workflow uses it.
