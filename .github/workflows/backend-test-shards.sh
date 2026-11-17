#!/usr/bin/env bash
set -uo pipefail

: "${BACKEND_TEST_SHARD_ZERO_LOAD:?BACKEND_TEST_SHARD_ZERO_LOAD is required}"
: "${BACKEND_TEST_WITH_COVERAGE:?BACKEND_TEST_WITH_COVERAGE is required}"
: "${POSTGRES_PORT:?POSTGRES_PORT is required}"
: "${REDIS_PORT:?REDIS_PORT is required}"

shard_pids=()
shard_logs=()
shard_statuses=()

run_shard() {
  local shard="$1"
  local logfile=".backend-test-shard-${shard}.log"
  local test_regex coverage_args=()
  rm -f "$logfile" "test-events-${shard}.jsonl" "coverage-app-${shard}.out"
  (
    set -euo pipefail
    export TEST_DATABASE_URL="postgres://family_user:family_password@127.0.0.1:${POSTGRES_PORT}/family_messenger_test_shard_${shard}?sslmode=disable"
    export TEST_REDIS_URL="redis://127.0.0.1:${REDIS_PORT}/${shard}"
    test_regex="$(go test -list '^(Test|Example|Fuzz)' ./internal/app | go run ./cmd/test-shard select -shard "$shard" -shards 3 -timings cmd/test-shard/test-durations.json -shard-zero-load "$BACKEND_TEST_SHARD_ZERO_LOAD")"
    if [[ "$BACKEND_TEST_WITH_COVERAGE" == 'true' ]]; then
      coverage_args=(-covermode=atomic -coverprofile="coverage-app-${shard}.out")
    fi
    go test -json -count=1 "${coverage_args[@]}" -run "$test_regex" ./internal/app | tee "test-events-${shard}.jsonl"
    if [[ "$shard" == '0' ]]; then
      mapfile -t packages < <(go list ./... | grep -v '/internal/app$')
      if ((${#packages[@]} > 0)); then
        if [[ "$BACKEND_TEST_WITH_COVERAGE" == 'true' ]]; then
          go test -count=1 -covermode=atomic -coverprofile=coverage-other.out "${packages[@]}"
        else
          go test -count=1 "${packages[@]}"
        fi
      fi
    fi
  ) >"$logfile" 2>&1
}

for shard in 0 1 2; do
  run_shard "$shard" &
  shard_pids+=("$!")
  shard_logs+=(".backend-test-shard-${shard}.log")
done

failed=0
for shard in 0 1 2; do
  if wait "${shard_pids[$shard]}"; then
    shard_statuses+=(0)
  else
    shard_statuses+=(1)
    failed=1
  fi
done

for shard in 0 1 2; do
  printf '\n===== Backend test shard %s (exit %s) =====\n' "$shard" "${shard_statuses[$shard]}"
  cat "${shard_logs[$shard]}"
  rm -f "${shard_logs[$shard]}"
done

exit "$failed"
