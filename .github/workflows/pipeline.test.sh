#!/usr/bin/env bash
set -euo pipefail

bash .github/workflows/trusted-pr-permissions.test.sh

grep -Fq 'frontend/** text eol=lf' .gitattributes || {
  echo "Frontend sources must keep LF line endings on every runner OS." >&2
  exit 1
}

bash .github/workflows/backend-dockerfiles.test.sh
bash .github/workflows/frontend-dependencies.test.sh
node .github/workflows/multiserver-routing.test.mjs
node --test .github/intelligence-deployment.test.mjs
bash deploy/scripts/ensure-tenant-proxy-network.test.sh

awk '
  function fail(message) {
    print message > "/dev/stderr"
    failed = 1
  }

  /^jobs:$/ {
    in_jobs = 1
    in_global_permissions = 0
    next
  }

  !in_jobs {
    if ($0 == "  pull_request:") fail("Untrusted pull requests must not run on self-hosted pipeline runners.")

    if ($0 == "permissions:") {
      in_global_permissions = 1
      next
    }
    if (in_global_permissions && $0 == "  contents: read") {
      global_contents_read = 1
    }
    next
  }

  /^  [[:alnum:]_-]+:$/ {
    job = $0
    sub(/^  /, "", job)
    sub(/:$/, "", job)
    in_job_permissions = 0
    next
  }

  /^    needs:/ {
    needs = $0
    sub(/^    needs:[[:space:]]*/, "", needs)
    job_needs[job] = needs
  }

  /^    permissions:$/ {
    in_job_permissions = 1
    next
  }
  in_job_permissions && /^    [[:alnum:]_-]+:/ {
    in_job_permissions = 0
  }
  in_job_permissions && job == "changes" && $0 == "      contents: read" {
    changes_contents_read = 1
  }
  in_job_permissions && job == "backend-ci" && $0 == "      actions: read" {
    backend_actions_read = 1
  }
  in_job_permissions && job == "deploy-android" && $0 == "      contents: write" {
    android_contents_write = 1
  }

  /^    if:/ {
    condition = $0
    sub(/^    if:[[:space:]]*/, "", condition)
    job_condition[job] = condition
  }
  /^    runs-on:/ {
    runner = $0
    sub(/^    runs-on:[[:space:]]*/, "", runner)
    job_runner[job] = runner
  }
  job == "changes" && /^      - name: Detect available shell$/ { shell_detection_step = 1 }
  job == "changes" && shell_detection_step && /^        shell: powershell$/ { shell_detection_shell = 1 }
  job == "changes" && shell_detection_step && /Get-Command git/ { git_command_lookup = 1 }
  job == "changes" && shell_detection_step && /bin\\bash\.exe/ { git_bash_path = 1 }
  job == "changes" && shell_detection_step && /Add-Content.*GITHUB_PATH/ { git_bash_added_to_path = 1 }
  job == "changes" && shell_detection_step && /^[[:space:]]+fi[[:space:]]*$/ { shell_uses_bash_fi = 1 }
  job == "backend-ci" && /^      - name: Detect available shell$/ { backend_shell_detection_step = 1 }
  job == "backend-ci" && backend_shell_detection_step && /^        shell: powershell$/ { backend_shell_detection_shell = 1 }
  job == "backend-ci" && backend_shell_detection_step && /Get-Command git/ { backend_git_command_lookup = 1 }
  job == "backend-ci" && backend_shell_detection_step && /bin\\bash\.exe/ { backend_git_bash_path = 1 }
  job == "backend-ci" && backend_shell_detection_step && /Add-Content.*GITHUB_PATH/ { backend_git_bash_added_to_path = 1 }
  job == "changes" && /GIT_CONFIG_COUNT: 2/ { checkout_git_config_count = 1 }
  job == "changes" && /GIT_CONFIG_KEY_0: core\.autocrlf/ { checkout_autocrlf_key = 1 }
  job == "changes" && /GIT_CONFIG_VALUE_0: .false./ { checkout_autocrlf_disabled = 1 }
  job == "changes" && /GIT_CONFIG_KEY_1: http\.version/ { checkout_http_version_key = 1 }
  job == "changes" && /GIT_CONFIG_VALUE_1: HTTP\/1\.1/ { checkout_http_version_http1 = 1 }
  (job == "frontend-ci" || job == "frontend_test_shards") && /GIT_CONFIG_COUNT: 1/ { frontend_git_config_count = 1 }
  (job == "frontend-ci" || job == "frontend_test_shards") && /GIT_CONFIG_KEY_0: core\.autocrlf/ { frontend_autocrlf_key = 1 }
  (job == "frontend-ci" || job == "frontend_test_shards") && /GIT_CONFIG_VALUE_0: .false./ { frontend_autocrlf_disabled = 1 }
  (job == "frontend-ci" || job == "frontend_test_shards") && /npm cache clean --force/ { frontend_npm_cache_cleaned = 1 }
  job == "changes" && /^      - name: Verify pipeline workflow contract$/ { pipeline_contract_step = 1 }
  job == "changes" && pipeline_contract_step && /^        shell: bash$/ { pipeline_contract_shell = 1 }
  job == "backend-ci" && /^[[:space:]]+cache:[[:space:]]+false$/ { go_cache_disabled = 1 }
  job == "changes" && /^[[:space:]]+fetch-depth:[[:space:]]+0[[:space:]]*$/ { changes_fetches_full_history = 1 }
  job == "changes" && /^[[:space:]]+filter:[[:space:]]+blob:none[[:space:]]*$/ { changes_skips_historical_blobs = 1 }
  (job == "frontend-ci" || job == "frontend_test_shards" || job == "deploy-android") && /^[[:space:]]+cache:[[:space:]]+npm$/ { npm_remote_cache_enabled = 1 }
  (job == "frontend-ci" || job == "frontend_test_shards") && /actions\/upload-artifact@v4/ { frontend_artifact_uploaded = 1 }
  job == "deploy-android" && /actions\/download-artifact@v4/ { frontend_artifact_downloaded = 1 }
  job == "deploy-android" && /^      - name: Build frontend for Android release$/ { android_builds_frontend = 1 }
  job == "deploy-android" && /git fetch --tags/ { android_fetches_tags = 1 }
  /dorny\/paths-filter@v4/ || /dorny\/paths-filter@[[:xdigit:]]{40}[[:space:]]+# v4/ { paths_filter_v4 = 1 }
  job == "changes" && /^[[:space:]]+- / && (/pipeline\.yml/ || /pipeline\.test\.sh/) { ci_workflow_triggers_product_jobs = 1 }
  /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/ { insecure_node_override = 1 }

  END {
    if (!global_contents_read) fail("The workflow token must have read-only contents access by default.")
    if (!changes_contents_read) fail("The changes job must retain contents: read permission.")
    if (!backend_actions_read) fail("The backend aggregate must use actions: read only to fetch coverage artifacts from the current run.")
    if (!changes_fetches_full_history) fail("Detect Changes must fetch full history so merge pushes can compare against the previous push commit.")
    if (!changes_skips_historical_blobs) fail("Detect Changes must avoid downloading historical blobs when fetching full history.")
    if (!paths_filter_v4) fail("The pipeline must use the Node.js 24-compatible paths-filter release.")
    if (ci_workflow_triggers_product_jobs) fail("CI workflow-only changes must not trigger product build/deploy jobs.")
    if (insecure_node_override) fail("The pipeline must not enable the insecure Node.js runtime override.")
    if (job_condition["frontend-ci"] != "needs.changes.outputs.frontend == '\''true'\''") {
      fail("Frontend CI must run only when frontend paths changed.")
    }
    if (job_condition["backend_test_shards"] != "${{ !cancelled() && needs.changes.outputs.backend == '\''true'\'' && !inputs.backend_deploy_only }}") {
      fail("Backend test shards must run only when backend paths changed.")
    }
    if (job_needs["frontend_test_shards"] != "[changes, frontend_dependencies]" || job_needs["frontend-ci"] != "[changes, frontend_test_shards]") {
      fail("Frontend shards must depend on dependency preparation and Frontend CI must aggregate the shards.")
    }
    if (job_needs["backend_test_shards"] != "changes" || job_needs["backend-ci"] != "[changes, backend_test_shards, backend_lint]") {
      fail("Backend shards must run independently of Frontend CI and Backend CI must aggregate the shards.")
    }
    if (job_runner["frontend_test_shards"] != "[self-hosted, e2e]" || job_runner["frontend-ci"] != "[self-hosted, e2e]") {
      fail("Frontend shards and aggregate must stay on the frontend runner labeled e2e.")
    }
    if (job_runner["changes"] != "[self-hosted, Windows, tests]") {
      fail("The changes job must use the Windows self-hosted tests runner instead of GitHub-hosted Windows.")
    }
    if (job_runner["backend_test_shards"] != "[self-hosted, tests, Windows]" || job_runner["backend-ci"] != "[self-hosted, tests, Windows]") {
      fail("Backend shards and aggregate must use the Windows tests runner.")
    }
    if (!shell_detection_step || !shell_detection_shell || !git_command_lookup || !git_bash_path || !git_bash_added_to_path) {
      fail("The changes job must use built-in Windows PowerShell and put Git for Windows Bash ahead of the broken WSL bash shim.")
    }
    if (!backend_shell_detection_step || !backend_shell_detection_shell || !backend_git_command_lookup || !backend_git_bash_path || !backend_git_bash_added_to_path) {
      fail("The backend aggregate must put Git for Windows Bash ahead of the broken WSL bash shim before running bash steps.")
    }
    if (shell_uses_bash_fi) fail("The PowerShell shell bootstrap must not contain Bash control syntax.")
    if (!checkout_git_config_count || !checkout_autocrlf_key || !checkout_autocrlf_disabled || !checkout_http_version_key || !checkout_http_version_http1) {
      fail("The Windows checkout must preserve LF line endings and use HTTP/1.1 for reliable GitHub fetches.")
    }
    if (!frontend_git_config_count || !frontend_autocrlf_key || !frontend_autocrlf_disabled) {
      fail("Frontend CI must disable the Windows autocrlf conversion before checkout.")
    }
    if (frontend_npm_cache_cleaned) {
      fail("Frontend CI must not clear the shared runner-local npm cache before installing dependencies.")
    }
    if (!pipeline_contract_step || !pipeline_contract_shell) {
      fail("The pipeline workflow contract must run with the bash shell on every runner OS.")
    }
    if (job_runner["deploy-android"] != "[self-hosted, e2e, Windows]") {
      fail("Android release must target the Windows frontend runner labeled e2e.")
    }
    if (!go_cache_disabled) fail("Backend CI must avoid the oversized remote Go cache on persistent self-hosted runners.")
    if (npm_remote_cache_enabled) fail("Frontend and Android jobs must use the runner-local npm cache, not restore the oversized remote archive.")
    if (frontend_artifact_uploaded || frontend_artifact_downloaded || !android_builds_frontend) {
      fail("Android release must build frontend assets locally instead of transferring a workflow artifact.")
    }
    if (android_fetches_tags) {
      fail("Android release must use tags already fetched by checkout instead of fetching them again.")
    }

    expected_frontend = "github.ref == '\''refs/heads/master'\'' && github.event_name != '\''pull_request'\'' && needs.changes.outputs.frontend == '\''true'\'' && needs.solid-boundaries.result == '\''success'\''"
    expected_backend = "${{ !cancelled() && github.ref == '\''refs/heads/master'\'' && needs.changes.result == '\''success'\'' && needs.changes.outputs.backend == '\''true'\'' && needs.publish-ghcr-images.result == '\''success'\'' && (needs.solid-boundaries.result == '\''success'\'' || (github.event_name == '\''workflow_dispatch'\'' && inputs.backend_deploy_only)) && (needs.backend-ci.result == '\''success'\'' || (github.event_name == '\''workflow_dispatch'\'' && inputs.backend_deploy_only)) }}"
    if (job_condition["deploy-frontend-web"] != expected_frontend) {
      fail("Frontend deploy must require a master push and the frontend path filter.")
    }
    if (job_condition["deploy-backend-web"] != expected_backend) {
      fail("Backend deploy must require a master push, backend path filter, and successful GHCR image publish.")
    }
    if (job_condition["deploy-android"] != expected_frontend) {
      fail("Android release must require a master push and the frontend path filter.")
    }
    if (!android_contents_write) fail("Android release must retain permission to push its release tag.")

    if (failed) exit 1
  }
' .github/workflows/pipeline.yml

notes_retry_contract=$(sed -n '/      - name: Generate release notes/,/      - name: Publish Android release to Telegram/p' .github/workflows/pipeline.yml)
if grep -Fq 'jq ' <<< "$notes_retry_contract"; then
  echo "Android release notes must not depend on jq, which is unavailable on the Windows release runner." >&2
  exit 1
fi
for required in 'MAX_ATTEMPTS=3' '-le "$MAX_ATTEMPTS"' 'BASE_DELAY=$((1 << (attempt - 1)))' 'RANDOM' 'sleep "$DELAY"' 'curl -fsSL https://api.openai.com/v1/chat/completions'; do
  if ! grep -Fq -- "$required" <<< "$notes_retry_contract"; then
    echo "Android release notes must retry the OpenAI request up to three times with exponential jittered delays ($required)." >&2
    exit 1
  fi
done

for workflow in .github/workflows/pipeline.yml .github/workflows/trusted-pr-tests.yml; do
  shard_contract=$(sed -n '/^  backend_test_shards:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$workflow")
  for required in 'max-parallel: 3' 'shard: [0, 1, 2]' 'matrix.shard' 'select -shard "$BACKEND_TEST_SHARD" -shards 3 -timings cmd/test-shard/test-durations.json' '-shard-zero-load' '-run "$testRegex"' './internal/app' 'set -o pipefail' 'go test -json' 'backend-test-events-${{ matrix.shard }}'; do
    if ! grep -Fq -- "$required" <<< "$shard_contract"; then
      echo "Backend workflow $workflow must run three isolated Go integration shards ($required)." >&2
      exit 1
    fi
  done
  expected_shard_zero_load=20
  if [[ "$workflow" == .github/workflows/pipeline.yml ]]; then
    expected_shard_zero_load=90
  fi
  if ! grep -Fq -- "-shard-zero-load $expected_shard_zero_load" <<< "$shard_contract"; then
    echo "Backend workflow $workflow must use the measured shard 0 overhead ($expected_shard_zero_load seconds)." >&2
    exit 1
  fi
  aggregate_contract=$(sed -n '/^  backend-ci:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$workflow")
  if ! grep -Fq 'needs: [changes, backend_test_shards, backend_lint]' <<< "$aggregate_contract"; then
    echo "Backend workflow $workflow must retain Backend CI as an aggregate check for the three shards." >&2
    exit 1
  fi
  if ! grep -Fq 'BACKEND_SHARD_RESULT: ${{ needs.backend_test_shards.result }}' <<< "$aggregate_contract" || \
     ! grep -Fq 'BACKEND_LINT_RESULT: ${{ needs.backend_lint.result }}' <<< "$aggregate_contract" || \
     ! grep -Fq 'did not succeed:' <<< "$aggregate_contract"; then
    echo "Backend workflow $workflow must fail its aggregate when a test shard fails or is skipped." >&2
    exit 1
  fi
done


for workflow in .github/workflows/pipeline.yml .github/workflows/trusted-pr-tests.yml; do
  preparation=$(sed -n '/^  frontend_dependencies:/,/^  frontend_test_shards:/p' "$workflow")
  shards=$(sed -n '/^  frontend_test_shards:/,/^  frontend-ci:/p' "$workflow")
  for required in '(cd frontend && npm ci)' 'tar -cf frontend-dependencies.tar' 'name: frontend-dependencies' 'id: upload' 'overwrite: true'; do
    if ! grep -Fq -- "$required" <<< "$preparation"; then
      echo "Frontend preparation in $workflow must build and share the installed tree ($required)." >&2
      exit 1
    fi
  done
  for required in 'needs: [changes, frontend_dependencies]' "VITEST_MAX_WORKERS: '2'" 'PREP_OS' 'PREP_ARCH' 'PREP_NODE' 'PREP_NPM' 'uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4' 'name: frontend-dependencies' 'timeout-minutes: 5' 'tar -xf' '(cd frontend && npm ci)' 'run: npm test -- --shard='; do
    if ! grep -Fq -- "$required" <<< "$shards"; then
      echo "Frontend shards in $workflow must restore compatible dependencies or install them and run with two workers ($required)." >&2
      exit 1
    fi
  done
  if grep -Fq 'gh run download' <<< "$shards"; then
    echo "Frontend shards in $workflow must use the official current-run artifact download action." >&2
    exit 1
  fi
done
master_preparation=$(sed -n '/^  frontend_dependencies:/,/^  frontend_test_shards:/p' .github/workflows/pipeline.yml)
master_key=$(grep -F 'key: frontend-deps-v1-' <<< "$master_preparation")
pr_key=$(sed -n '/^  frontend_dependencies:/,/^  frontend_test_shards:/p' .github/workflows/trusted-pr-tests.yml | grep -F 'key: frontend-deps-v1-')
if [[ -z "$master_key" || "$master_key" != "$pr_key" ]] || ! grep -Fq "if: github.ref == 'refs/heads/master'" <<< "$master_preparation"; then
  echo "Only master may populate the exact frontend cache key shared with PRs." >&2
  exit 1
fi
pr_preparation=$(sed -n '/^  frontend_dependencies:/,/^  frontend_test_shards:/p' .github/workflows/trusted-pr-tests.yml)
if ! grep -Fq 'uses: actions/cache/restore@0057852bfaa89a56745cba8c7296529d2fc39830' <<< "$pr_preparation" || grep -Eq '^    cache-mode:' <<< "$pr_preparation" || ! grep -Fq "if: steps.dependencies-cache.outputs.cache-hit != 'true'" <<< "$pr_preparation"; then
  echo "PR dependency preparation must use read-only cache access and install on a cache miss." >&2
  exit 1
fi

master_coverage_contract=$(sed -n '/^  backend-ci:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/pipeline.yml)
for required in 'backend-coverage-shard' 'Merge backend coverage profiles' 'go run ./cmd/test-shard merge' 'coverage-app-2.out' 'name: backend-coverage'; do
  if ! grep -Fq "$required" <<< "$master_coverage_contract"; then
    echo "Backend CI must merge and publish coverage from all shards ($required)." >&2
    exit 1
  fi
done
if ! grep -Fq 'name: Download backend coverage shard artifacts' <<< "$master_coverage_contract" || \
   ! grep -Fq 'archive_download_url' <<< "$master_coverage_contract" || \
   ! grep -Fq 'actions/runs/$env:GITHUB_RUN_ID/artifacts?per_page=100' <<< "$master_coverage_contract" || \
   grep -Fq 'actions/download-artifact@' <<< "$master_coverage_contract"; then
  echo "Backend coverage artifacts must be fetched through the GitHub REST API without an unapproved action." >&2
  exit 1
fi
if ! grep -Fq 'SUMMARY=$(printf '\''Что нового:\n%s'\'' "$COMMITS")' <<< "$notes_retry_contract"; then
  echo "Android release notes must retain the commit-list fallback after retries are exhausted." >&2
  exit 1
fi

grep -Fq 'RUN --mount=type=cache,target=/root/.npm \' frontend/Dockerfile || {
  echo "The frontend npm dependency install must retain its BuildKit cache mount." >&2
  exit 1
}
if [ "$(grep -Fc 'bash deploy/scripts/ensure-docker-buildx.sh' .github/workflows/pipeline.yml)" -lt 2 ]; then
  echo "Both production deployment jobs must ensure Docker Buildx before building images." >&2
  exit 1
fi
buildx_deploy_contract=$(sed -n '/- name: Build and publish multi-arch container images/,/^      - name:/p' .github/workflows/pipeline.yml | sed '$d')
if ! grep -Fq 'builder_name="ghcr-builder-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"' <<< "$buildx_deploy_contract" || \
  ! grep -Fq 'trap cleanup_builder EXIT' <<< "$buildx_deploy_contract" || \
  ! grep -Fq 'docker buildx rm --force "$builder_name"' <<< "$buildx_deploy_contract" || \
  grep -Fq 'docker buildx prune' <<< "$buildx_deploy_contract" || \
  grep -Fq 'docker container prune' <<< "$buildx_deploy_contract"; then
  echo "Production Buildx must use and remove a run-scoped builder rather than pruning shared Docker resources." >&2
  exit 1
fi
bash deploy/scripts/ensure-docker-buildx.test.sh

awk '
  /docker_with_space_recovery\(\)/ { in_recovery = 1; in_command = 0; in_failure_branch = 0 }
  in_recovery && /if "\$@" >"\$deploy_log" 2>&1; then/ { in_command = 1 }
  in_command && /else/ { in_failure_branch = 1; next }
  in_command && in_failure_branch && /deploy_status=\$\?/ { status_captured++ }
  in_recovery && /^            }$/ { in_recovery = 0 }
  END {
    if (status_captured < 2) {
      print "Every Docker deployment wrapper must capture command failures inside its failed-command branch." > "/dev/stderr"
      exit 1
    }
  }
' .github/workflows/pipeline.yml

trusted_pr_workflow=".github/workflows/trusted-pr-tests.yml"
for workflow in .github/workflows/pipeline.yml "$trusted_pr_workflow"; do
  if [[ "$workflow" == .github/workflows/pipeline.yml ]]; then
    change_contract=$(sed -n '/^  changes:/,/^  frontend_test_shards:/p' "$workflow")
  else
    change_contract=$(sed -n '/^  changes:/,/^  pipeline-contract:/p' "$workflow")
  fi

  if ! grep -Fq 'size_baseline: ${{ steps.filter.outputs.size_baseline }}' <<< "$change_contract"; then
    echo "Workflow $workflow must expose size-baseline changes separately from product code." >&2
    exit 1
  fi

  frontend_filter=$(awk '
    /^            frontend:$/ { capture = 1; next }
    /^            [[:alnum:]_-]+:$/ && capture { exit }
    capture { print }
  ' <<< "$change_contract")
  backend_filter=$(awk '
    /^            backend:$/ { capture = 1; next }
    /^            [[:alnum:]_-]+:$/ && capture { exit }
    capture { print }
  ' <<< "$change_contract")
  size_baseline_filter=$(awk '
    /^            size_baseline:$/ { capture = 1; next }
    /^            [[:alnum:]_-]+:$/ && capture { exit }
    capture { print }
  ' <<< "$change_contract")

  if grep -Fq 'docs/engineering/size-baseline.tsv' <<< "$frontend_filter" ||
     grep -Fq 'docs/engineering/size-baseline.tsv' <<< "$backend_filter" ||
     ! grep -Fq 'docs/engineering/size-baseline.tsv' <<< "$size_baseline_filter"; then
    echo "Workflow $workflow must run the SOLID check for size-baseline updates without scheduling frontend/backend test shards." >&2
    exit 1
  fi

  for product_filter in "$frontend_filter" "$backend_filter"; do
    if grep -Fq '.github/workflows/pipeline.yml' <<< "$product_filter" ||
       grep -Fq '.github/workflows/trusted-pr-tests.yml' <<< "$product_filter"; then
      echo "Workflow-only changes in $workflow must not schedule product test shards." >&2
      exit 1
    fi
  done

  solid_contract=$(sed -n '/^  solid-boundaries:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$workflow")
  if ! grep -Fq "needs.changes.outputs.size_baseline == 'true'" <<< "$solid_contract"; then
    echo "Workflow $workflow must run SOLID boundaries when the size baseline changes." >&2
    exit 1
  fi
done

if [[ ! -f scripts/check-solid-boundaries.sh ]]; then
  echo "Trusted PR SOLID boundaries require scripts/check-solid-boundaries.sh." >&2
  exit 1
fi
solid_workflow_contract=$(sed -n '/^  solid-boundaries:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$trusted_pr_workflow")
for required in 'shell: bash' 'run: bash scripts/check-solid-boundaries.sh all'; do
  if ! grep -Fq "$required" <<< "$solid_workflow_contract"; then
    echo "Trusted PR SOLID boundaries must run with Bash ($required)." >&2
    exit 1
  fi
done
if grep -Fq 'check-solid-boundaries.ps1' "$trusted_pr_workflow"; then
  echo "Trusted PR SOLID boundaries must use the cross-platform Bash checker." >&2
  exit 1
fi
if [[ $(grep -Fc "'scripts/check-solid-boundaries.sh'" "$trusted_pr_workflow") -ne 2 ]]; then
  echo "Frontend and backend path filters must trigger the Linux SOLID boundary job for checker changes." >&2
  exit 1
fi
grep -Fq '  pull_request_target:' "$trusted_pr_workflow" || {
  echo "Trusted PR runner selection must come from the base-branch pull_request_target workflow." >&2
  exit 1
}
if grep -Fq '  pull_request:' "$trusted_pr_workflow"; then
  echo "Trusted PR runner selection must not use a PR-controlled pull_request workflow." >&2
  exit 1
fi
grep -Fq 'persist-credentials: false' "$trusted_pr_workflow" || {
  echo "PR checkout must not persist a write-capable GitHub token." >&2
  exit 1
}
trusted_pr_job_runner() {
  awk -v target="$1" '
    /^  [[:alnum:]_-]+:$/ {
      job = $0
      sub(/^  /, "", job)
      sub(/:$/, "", job)
    }
    job == target && /^    runs-on:/ {
      sub(/^    runs-on:[[:space:]]*/, "")
      print
      exit
    }
  ' "$trusted_pr_workflow"
}

require_trusted_pr_runner() {
  job="$1"
  expected_labels="$2"
  runner=$(trusted_pr_job_runner "$job")

  if [[ "$runner" != *'github.event.pull_request.head.repo.full_name == github.repository'* ||
        "$runner" != *'ubuntu-24.04'* ||
        "$runner" == *'author_association'* ]]; then
    echo "Trusted PR $job must route fork code to GitHub-hosted Ubuntu based on repository identity." >&2
    exit 1
  fi
  for label in $expected_labels; do
    if [[ "$runner" != *"$label"* ]]; then
      echo "Trusted PR $job must retain the $label self-hosted runner label for same-repository PRs." >&2
      exit 1
    fi
  done
}

require_trusted_pr_runner changes 'self-hosted Windows tests'
require_trusted_pr_runner pipeline-contract 'self-hosted Windows tests'
require_trusted_pr_runner solid-boundaries 'self-hosted tests Windows'
require_trusted_pr_runner frontend_dependencies 'self-hosted e2e'
require_trusted_pr_runner frontend_test_shards 'self-hosted e2e'
require_trusted_pr_runner frontend-ci 'self-hosted e2e'
require_trusted_pr_runner backend_test_shards 'self-hosted tests Windows'
require_trusted_pr_runner backend_lint 'self-hosted tests Windows'
require_trusted_pr_runner backend-ci 'self-hosted tests Windows'
if grep -Fq 'author_association' "$trusted_pr_workflow"; then
  echo "Trusted PR runner selection must not trust the author's association; fork code stays on hosted runners." >&2
  exit 1
fi
backend_ci_contract=$(sed -n '/^  backend_test_shards:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$trusted_pr_workflow")
for required in 'name: Start Docker Desktop for backend test services' "if: runner.os == 'Windows'" 'docker info' 'postgres:16' 'redis:7' 'if: always()' 'docker rm -f'; do
  if ! grep -Fq "$required" <<< "$backend_ci_contract"; then
    echo "Trusted PR backend CI must initialize and clean up Docker services on the Windows runner when needed ($required)." >&2
    exit 1
  fi
done
if ! grep -Fq "\$ErrorActionPreference = 'Continue'" <<< "$backend_ci_contract"; then
  echo "Trusted PR backend CI must tolerate Docker CLI stderr while probing Windows engine startup." >&2
  exit 1
fi
if grep -Fq '    services:' <<< "$backend_ci_contract"; then
  echo "Trusted PR backend CI must not use GitHub's Linux-only service-container feature on Windows." >&2
  exit 1
fi

grep -Fq 'run: bash .github/workflows/pipeline.test.sh' "$trusted_pr_workflow" || {
  echo "Trusted PR checks must run pipeline.test.sh before merge." >&2
  exit 1
}

frontend_ci_contract=$(sed -n '/^  frontend_test_shards:/,/^  backend_test_shards:/p' "$trusted_pr_workflow")
for required in "Ensure Git Bash is available on Windows" "if: runner.os == 'Windows'" 'shell: bash' '(cd frontend && npm ci)' 'run: npm test' 'run: npm run build'; do
  if ! grep -Fq "$required" <<< "$frontend_ci_contract"; then
    echo "Trusted PR frontend checks must support both hosted Linux and the self-hosted Windows e2e runner ($required)." >&2
    exit 1
  fi
done
if grep -Fq 'npm cache clean --force' <<< "$frontend_ci_contract"; then
  echo "Trusted PR frontend CI must not clear the shared runner-local npm cache before installing dependencies." >&2
  exit 1
fi

if ! grep -Fq 'needs: changes' <<< "$backend_ci_contract"; then
  echo "Trusted PR backend CI must be eligible independently of Frontend CI because it uses a separate runner pool." >&2
  exit 1
fi
if ! grep -Fq '!cancelled()' <<< "$backend_ci_contract"; then
  echo "Trusted PR backend CI must still run when Frontend CI is skipped for backend-only changes." >&2
  exit 1
fi

trusted_pr_backend_shards=$(sed -n '/^  backend_test_shards:/,/^  backend-ci:/p' "$trusted_pr_workflow")
for required in 'Ensure Git Bash is available on Windows' 'shell: bash'; do
  if ! grep -Fq "$required" <<< "$trusted_pr_backend_shards"; then
    echo "Trusted PR backend CI test shards must run with Git Bash on Windows ($required)." >&2
    exit 1
  fi
done

lint_config="backend/.golangci.yml"
if [[ ! -f "$lint_config" ]]; then
  echo "Missing pinned golangci-lint configuration at $lint_config" >&2
  exit 1
fi

grep -Eq '^version:[[:space:]]+"2"$' "$lint_config" || {
  echo "golangci-lint configuration must use the v2 schema." >&2
  exit 1
}
grep -Eq 'generated:[[:space:]]+strict' "$lint_config" || {
  echo "Generated Ent code must be excluded using generated-file detection." >&2
  exit 1
}
if grep -Eq '^[[:space:]]*-[[:space:]]+ent/' "$lint_config"; then
  echo "The full ent/ tree must stay linted so handwritten Ent schemas remain covered." >&2
  exit 1
fi
if [[ ! -d backend/ent/schema ]]; then
  echo "Expected handwritten Ent schemas to remain part of the backend source tree." >&2
  exit 1
fi
grep -Eq '^// Code generated .* DO NOT EDIT\.$' backend/ent/user.go || {
  echo "Generated Ent output must retain the marker recognized by strict generated-file detection." >&2
  exit 1
}
grep -Eq 'golangci-lint-action@v9|golangci-lint-action@[[:xdigit:]]{40}[[:space:]]+# v9' .github/workflows/pipeline.yml || {
  echo "Backend CI must use golangci-lint action v9." >&2
  exit 1
}
backend_workflow_contract=$(sed -n '/^  backend_lint:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/pipeline.yml)
for required in 'version: v2.14.0' 'install-mode: none' 'skip-cache: true' 'GOLANGCI_LINT_CACHE'; do
  if ! grep -Fq "$required" <<< "$backend_workflow_contract"; then
    echo "Backend CI must run the pinned golangci-lint binary with lint caching enabled ($required)." >&2
    exit 1
  fi
done
for workflow in .github/workflows/pipeline.yml .github/workflows/trusted-pr-tests.yml; do
  workflow_backend_contract=$(sed -n '/^  backend_lint:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$workflow")
  for required in 'uses: actions/cache@0057852bfaa89a56745cba8c7296529d2fc39830' 'golangci-lint-${{ runner.os }}-${{ runner.arch }}-v2.14.0' 'golangci-lint-$version-windows-amd64.zip' 'Expand-Archive -LiteralPath $archivePath' 'golangci-lint.exe' 'Add-Content -Path $env:GITHUB_PATH' 'install-mode: none' 'skip-cache: true' 'GOLANGCI_LINT_CACHE'; do
    if ! grep -Fq "$required" <<< "$workflow_backend_contract"; then
      echo "Backend CI in $workflow must download and cache a named Windows golangci-lint archive before invoking the action ($required)." >&2
      exit 1
    fi
  done
  if grep -Fq 'install-mode: binary' <<< "$workflow_backend_contract"; then
    echo "Backend CI in $workflow must not use the action's extensionless Windows ZIP extraction path." >&2
    exit 1
  fi
  if [[ "$workflow" == .github/workflows/trusted-pr-tests.yml ]]; then
    for required in "Install golangci-lint binary on Linux" "if: runner.os == 'Linux'" 'linux-amd64.tar.gz' 'GITHUB_PATH' 'Configure Linux golangci-lint cache'; do
      if ! grep -Fq "$required" <<< "$workflow_backend_contract"; then
        echo "Fork PR backend lint must install the pinned Linux golangci-lint binary ($required)." >&2
        exit 1
      fi
    done
  fi
done
grep -Fq 'GOLANGCI_LINT_VERSION := v2.14.0' backend/Makefile || {
  echo "The local installation instructions must use the CI golangci-lint version." >&2
  exit 1
}
grep -Fq 'verify: true' .github/workflows/pipeline.yml || {
  echo "Backend CI must verify the golangci-lint configuration." >&2
  exit 1
}
grep -Fq 'golangci-lint run --config .golangci.yml ./...' backend/Makefile || {
  echo "The backend Makefile must provide the documented local lint command." >&2
  exit 1
}
grep -Fq 'golangci-lint config verify --config .golangci.yml' backend/Makefile || {
  echo "The backend Makefile must provide config validation locally." >&2
  exit 1
}

solid_workflow_contract=$(sed -n '/^  solid-boundaries:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/pipeline.yml)
for required in 'runs-on: [self-hosted, tests, Windows]' 'shell: powershell' 'Get-Command git.exe' 'bin\bash.exe' 'Add-Content -Path $env:GITHUB_PATH -Value (Split-Path $gitBash -Parent)' 'shell: bash' 'run: bash scripts/check-solid-boundaries.sh all'; do
  if ! grep -Fq "$required" <<< "$solid_workflow_contract"; then
    echo "Master SOLID boundaries must run on the self-hosted tests runner and bootstrap Git Bash on Windows ($required)." >&2
    exit 1
  fi
done

caddy_watchdog_contract=$(cat .github/workflows/caddy-watchdog.yml)
for required in 'runs-on: [self-hosted, Windows]' 'name: Prefer Git for Windows Bash over the WSL shim' 'shell: powershell' 'Get-Command git.exe' 'bin\bash.exe' 'Add-Content -Path $env:GITHUB_PATH'; do
  if ! grep -Fq "$required" <<< "$caddy_watchdog_contract"; then
    echo "The Caddy watchdog must select Git for Windows Bash before running its SSH action ($required)." >&2
    exit 1
  fi
done
if ! awk '/name: Prefer Git for Windows Bash over the WSL shim/ { setup = NR } /uses: appleboy\/ssh-action@/ { ssh = NR } END { exit !(setup > 0 && ssh > setup) }' <<< "$caddy_watchdog_contract"; then
  echo "The Caddy watchdog must prepare Git Bash before the SSH action." >&2
  exit 1
fi

backend_workflow_contract=$(sed -n '/^  backend_test_shards:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/pipeline.yml)
for workflow in .github/workflows/pipeline.yml .github/workflows/trusted-pr-tests.yml; do
  cleanup=$(sed -n '/^      - name: Stop backend test containers/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$workflow")
  if grep -Eq 'docker (container|buildx|system|builder) prune' <<< "$cleanup" ||
     ! grep -Fq 'docker rm -f -v "stovo-test-postgres-$suffix" "stovo-test-redis-$suffix"' <<< "$cleanup"; then
    echo "Backend cleanup in $workflow must remove only its own test containers and anonymous volumes." >&2
    exit 1
  fi
done
for required in 'runs-on: [self-hosted, tests, Windows]' 'shell: bash' 'name: Detect available shell' 'shell: powershell' 'Get-Command git.exe' 'name: Start Docker Desktop for backend test services' 'name: Start PostgreSQL and Redis test containers' 'name: Stop backend test containers' 'if: always()'; do
  if ! grep -Fq "$required" <<< "$backend_workflow_contract"; then
    echo "Master backend CI must run its Docker services on the Windows tests runner and use Bash for backend commands ($required)." >&2
    exit 1
  fi
done
trusted_backend_aggregate=$(sed -n '/^  backend-ci:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/trusted-pr-tests.yml)
for required in 'name: Require successful backend test shards' 'shell: powershell' '$env:BACKEND_SHARD_RESULT' '$env:BACKEND_LINT_RESULT' 'name: Aggregate successful backend shards'; do
  if ! grep -Fq "$required" <<< "$trusted_backend_aggregate"; then
    echo "Trusted PR Backend CI must aggregate Windows runner results with PowerShell ($required)." >&2
    exit 1
  fi
done
if ! grep -Fq "\$ErrorActionPreference = 'Continue'" <<< "$backend_workflow_contract"; then
  echo "Master backend CI must tolerate Docker CLI stderr while probing engine startup." >&2
  exit 1
fi
if grep -Fq '    services:' <<< "$backend_workflow_contract"; then
  echo "Master backend CI must not use GitHub's Linux-only service-container feature on Windows." >&2
  exit 1
fi
for workflow in .github/workflows/pipeline.yml .github/workflows/trusted-pr-tests.yml; do
  cleanup_contract=$(sed -n '/- name: Stop backend test containers/,/^[[:space:]]*backend-ci:/p' "$workflow")
  if ! grep -Fq 'docker rm -f -v "stovo-test-postgres-$suffix" "stovo-test-redis-$suffix"' <<< "$cleanup_contract" || \
    grep -Fq 'docker container prune' <<< "$cleanup_contract" || \
    grep -Fq 'docker buildx prune' <<< "$cleanup_contract"; then
    echo "Backend shard cleanup must remove only its own containers and anonymous volumes ($workflow)." >&2
    exit 1
  fi
done

docs_workflow_contract=$(sed -n '/^  docs-and-deployment:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/docs-validation.yml)
docs_runner=$(grep 'runs-on:' <<< "$docs_workflow_contract")
if [[ "$docs_runner" != '    runs-on: ubuntu-24.04' ]]; then
  echo "Docs pull_request validation must use a static GitHub-hosted runner because forks can edit this workflow." >&2
  exit 1
fi

# Every platform bootstrap must be guarded so community PRs can run on hosted Linux.
for step in 'Detect available shell' 'Install Helm on Windows runner' 'Install kubeconform on Windows runner' 'Ensure Docker Compose CLI plugin is available'; do
  if ! awk -v step="$step" '$0 == "      - name: " step {getline; if ($0 == "        if: runner.os == \047Windows\047") found=1} END {exit !found}' <<< "$docs_workflow_contract"; then
    echo "Docs Windows setup must be guarded by runner.os ($step)." >&2
    exit 1
  fi
done
for required in 'Get-Command git.exe' 'bin\bash.exe' 'helm-$version-windows-amd64.zip' 'kubeconform-windows-amd64.zip' 'kubeconform-$version-linux-amd64.tar.gz' 'api.github.com/repos/yannh/kubeconform/releases/assets/$asset_id' 'sha256sum --check' 'docker-compose-windows-x86_64.exe' "if: runner.os == 'Linux'" 'docker-compose-linux-x86_64' 'run: node --test .github/docs-validation.test.mjs' '-strict -summary -kubernetes-version 1.30.0 -'; do
  if ! grep -Fq -- "$required" <<< "$docs_workflow_contract"; then
    echo "Docs validation must preserve both platform setup and real checks ($required)." >&2
    exit 1
  fi
done

codeql_workflow_contract=$(sed -n '/^  analyze:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/codeql.yml)
for required in 'runs-on: ubuntu-24.04' 'max-parallel: 1'; do
  if ! grep -Fq "$required" <<< "$codeql_workflow_contract"; then
    echo "CodeQL must run serially on the Windows tests runner ($required)." >&2
    exit 1
  fi
done
if grep -Fq 'author_association' <<< "$codeql_workflow_contract"; then
  echo "CodeQL fork routing must use repository identity, not author association." >&2
  exit 1
fi

if ! grep -Fq "needs.changes.outputs.frontend == 'true'" <<< "$solid_workflow_contract" ||
   ! grep -Fq "needs.changes.outputs.backend == 'true'" <<< "$solid_workflow_contract"; then
  echo "Master SOLID boundaries must run when either frontend or backend files change." >&2
  exit 1
fi
frontend_workflow_contract=$(sed -n '/^  frontend-ci:/,/^  solid-boundaries:/p' .github/workflows/pipeline.yml)
if grep -Fq 'check-solid-boundaries.sh' <<< "$frontend_workflow_contract"; then
  echo "Frontend CI must not invoke the separate SOLID boundary phase." >&2
  exit 1
fi
for deployment in deploy-frontend-web deploy-backend-web deploy-android; do
  deployment_contract=$(sed -n "/^  ${deployment}:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p" .github/workflows/pipeline.yml)
  if ! grep -Fq 'solid-boundaries' <<< "$deployment_contract"; then
    echo "$deployment must depend on the master SOLID boundary phase." >&2
    exit 1
  fi
  for required in 'shell: powershell' 'Get-Command git.exe' 'bin\bash.exe' 'Add-Content -Path $env:GITHUB_PATH -Value (Split-Path $gitBash -Parent)'; do
    if ! grep -Fq "$required" <<< "$deployment_contract"; then
      echo "$deployment must put Git for Windows Bash ahead of the WSL shim before running deployment steps ($required)." >&2
      exit 1
    fi
  done
done

for deployment in deploy-frontend-web deploy-backend-web; do
  deployment_contract=$(sed -n "/^  ${deployment}:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p" .github/workflows/pipeline.yml)
  if ! grep -Fq 'runs-on: [self-hosted, tests, Windows]' <<< "$deployment_contract"; then
    echo "$deployment must target the Windows tests runners." >&2
    exit 1
  fi
  if grep -Fq 'uses: appleboy/ssh-action@' <<< "$deployment_contract"; then
    echo "$deployment must not use the SSH action that requests a nonexistent extensionless Windows binary." >&2
    exit 1
  fi
  if ! grep -Fq 'ssh -i "$key_file"' <<< "$deployment_contract" ||
     ! grep -Fq "'bash -s'" <<< "$deployment_contract" ||
     ! grep -Fq 'StrictHostKeyChecking=accept-new' <<< "$deployment_contract" ||
     ! grep -Fq 'chmod 600 "$key_file"' <<< "$deployment_contract" ||
     ! grep -Fq "Join-Path \$gitRoot 'usr\\bin\\ssh.exe'" <<< "$deployment_contract" ||
     ! grep -Fq 'Add-Content -Path $env:GITHUB_PATH -Value (Split-Path $ssh -Parent)' <<< "$deployment_contract" ||
     ! grep -Fq 'shell: bash' <<< "$deployment_contract"; then
    echo "$deployment must use Git for Windows OpenSSH to stream its remote Bash script with a protected key file and host-key checking." >&2
    exit 1
  fi
  if ! awk '/^    env:$/ { getline; if ($0 == "      SSH_CLIENT_OS: windows") found = 1 } END { exit !found }' <<< "$deployment_contract"; then
    echo "$deployment must expose the Windows SSH platform override at job scope." >&2
    exit 1
  fi
done
android_deploy_contract=$(sed -n '/^  deploy-android:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/pipeline.yml)
for required in 'runs-on: [self-hosted, e2e, Windows]' 'defaults:' 'shell: bash'; do
  if ! grep -Fq "$required" <<< "$android_deploy_contract"; then
    echo "Android release must run with Git Bash on a Windows e2e runner ($required)." >&2
    exit 1
  fi
done
android_pwsh_setup_contract=$(sed -n '/      - name: Ensure PowerShell Core is available for Android SDK setup/,/      - name: Setup Android SDK/p' .github/workflows/pipeline.yml)
for required in 'PowerShell-$version-win-x64.zip' 'Get-FileHash' '02FE458BE20493FBDF43F61EA20610B811EE6C738AB1676C61B9CFCD1A33C860' 'pwsh.exe' 'GITHUB_PATH'; do
  if ! grep -Fq "$required" <<< "$android_pwsh_setup_contract"; then
    echo "Android release must make a verified PowerShell Core executable available before setup-android ($required)." >&2
    exit 1
  fi
done
if [[ "$android_pwsh_setup_contract" != *"GITHUB_PATH"* || "$android_pwsh_setup_contract" != *"Setup Android SDK"* ]]; then
  echo "Android release must add PowerShell Core to PATH before setup-android." >&2
  exit 1
fi

for workflow in .github/workflows/pipeline.yml .github/workflows/trusted-pr-tests.yml; do
  backend_ci_contract=$(sed -n '/^  backend_test_shards:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$workflow")
  for required in 'docker run --detach --name $postgresContainer --publish 127.0.0.1::5432' 'docker run --detach --name $redisContainer --publish 127.0.0.1::6379' 'docker port $postgresContainer 5432/tcp' 'docker port $redisContainer 6379/tcp' 'Add-Content -Path $env:GITHUB_ENV'; do
    if ! grep -Fq -- "$required" <<< "$backend_ci_contract"; then
      echo "Backend CI in $workflow must dynamically publish Docker test service ports and export them for later steps ($required)." >&2
      exit 1
    fi
  done
  for required in 'TEST_DATABASE_URL=postgres://family_user:family_password@127.0.0.1:$postgresPort/' 'TEST_REDIS_URL=redis://127.0.0.1:$redisPort/'; do
    if ! grep -Fq -- "$required" <<< "$backend_ci_contract"; then
      echo "Backend CI in $workflow must use the dynamically allocated test service ports ($required)." >&2
      exit 1
    fi
  done
  if grep -Fq -- '--publish 5432:5432' <<< "$backend_ci_contract" || grep -Fq -- '--publish 6379:6379' <<< "$backend_ci_contract"; then
    echo "Backend CI in $workflow must not bind fixed host ports for test services." >&2
    exit 1
  fi
done

backend_ci_contract=$(sed -n '/^  backend_test_shards:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/pipeline.yml)
for required in 'POSTGRES_TEST_CONTAINER=$postgresContainer' '--network "container:$POSTGRES_TEST_CONTAINER"' 'ATLAS_DATABASE_URL=postgres://family_user:family_password@127.0.0.1:5432/'; do
  if ! grep -Fq -- "$required" <<< "$backend_ci_contract"; then
    echo "Master backend CI must run Atlas in the PostgreSQL container network namespace ($required)." >&2
    exit 1
  fi
done
for required in 'migration_dir="$(cygpath -w "$PWD/migrations")"' 'source=$migration_dir,target=/migrations,readonly' '--mount "$migration_mount"'; do
  if ! grep -Fq -- "$required" <<< "$backend_ci_contract"; then
    echo "Master backend CI must mount migrations using a Windows-native Docker source path ($required)." >&2
    exit 1
  fi
done
