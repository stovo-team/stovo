#!/usr/bin/env bash
set -euo pipefail

grep -Fq 'frontend/** text eol=lf' .gitattributes || {
  echo "Frontend sources must keep LF line endings on every runner OS." >&2
  exit 1
}

bash .github/workflows/backend-dockerfiles.test.sh
node .github/workflows/multiserver-routing.test.mjs
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
  job == "changes" && /GIT_CONFIG_COUNT: 2/ { checkout_git_config_count = 1 }
  job == "changes" && /GIT_CONFIG_KEY_0: core\.autocrlf/ { checkout_autocrlf_key = 1 }
  job == "changes" && /GIT_CONFIG_VALUE_0: .false./ { checkout_autocrlf_disabled = 1 }
  job == "changes" && /GIT_CONFIG_KEY_1: http\.version/ { checkout_http_version_key = 1 }
  job == "changes" && /GIT_CONFIG_VALUE_1: HTTP\/1\.1/ { checkout_http_version_http1 = 1 }
  job == "changes" && /^      - name: Verify pipeline workflow contract$/ { pipeline_contract_step = 1 }
  job == "changes" && pipeline_contract_step && /^        shell: bash$/ { pipeline_contract_shell = 1 }
  job == "backend-ci" && /^[[:space:]]+cache:[[:space:]]+false$/ { go_cache_disabled = 1 }
  job == "changes" && /^[[:space:]]+fetch-depth:[[:space:]]+0[[:space:]]*$/ { changes_fetches_full_history = 1 }
  job == "changes" && /^[[:space:]]+filter:[[:space:]]+blob:none[[:space:]]*$/ { changes_skips_historical_blobs = 1 }
  (job == "frontend-ci" || job == "deploy-android") && /^[[:space:]]+cache:[[:space:]]+npm$/ { npm_remote_cache_enabled = 1 }
  job == "frontend-ci" && /actions\/upload-artifact@v4/ { frontend_artifact_uploaded = 1 }
  job == "deploy-android" && /actions\/download-artifact@v4/ { frontend_artifact_downloaded = 1 }
  job == "deploy-android" && /^      - name: Build frontend for Android release$/ { android_builds_frontend = 1 }
  job == "deploy-android" && /git fetch --tags/ { android_fetches_tags = 1 }
  /dorny\/paths-filter@v4/ || /dorny\/paths-filter@[[:xdigit:]]{40}[[:space:]]+# v4/ { paths_filter_v4 = 1 }
  /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/ { insecure_node_override = 1 }

  END {
    if (!global_contents_read) fail("The workflow token must have read-only contents access by default.")
    if (!changes_contents_read) fail("The changes job must retain contents: read permission.")
    if (!changes_fetches_full_history) fail("Detect Changes must fetch full history so merge pushes can compare against the previous push commit.")
    if (!changes_skips_historical_blobs) fail("Detect Changes must avoid downloading historical blobs when fetching full history.")
    if (!paths_filter_v4) fail("The pipeline must use the Node.js 24-compatible paths-filter release.")
    if (insecure_node_override) fail("The pipeline must not enable the insecure Node.js runtime override.")
    if (job_condition["frontend-ci"] != "needs.changes.outputs.frontend == '\''true'\''") {
      fail("Frontend CI must run only when frontend paths changed.")
    }
    if (job_condition["backend-ci"] != "needs.changes.outputs.backend == '\''true'\'' && !inputs.backend_deploy_only") {
      fail("Backend CI must run only when backend paths changed.")
    }
    if (job_runner["frontend-ci"] != "[self-hosted, e2e]") {
      fail("Frontend CI must stay on the frontend runner labeled e2e.")
    }
    if (job_runner["changes"] != "[self-hosted, Windows]") {
      fail("The changes job must use the Windows self-hosted runner because its shell bootstrap starts in PowerShell.")
    }
    if (job_runner["backend-ci"] != "[self-hosted, tests]") {
      fail("Backend CI must stay on the backend CI runner labeled tests.")
    }
    if (!shell_detection_step || !shell_detection_shell || !git_command_lookup || !git_bash_path || !git_bash_added_to_path) {
      fail("The changes job must use built-in Windows PowerShell and put Git for Windows Bash ahead of the broken WSL bash shim.")
    }
    if (shell_uses_bash_fi) fail("The PowerShell shell bootstrap must not contain Bash control syntax.")
    if (!checkout_git_config_count || !checkout_autocrlf_key || !checkout_autocrlf_disabled || !checkout_http_version_key || !checkout_http_version_http1) {
      fail("The Windows checkout must preserve LF line endings and use HTTP/1.1 for reliable GitHub fetches.")
    }
    if (!pipeline_contract_step || !pipeline_contract_shell) {
      fail("The pipeline workflow contract must run with the bash shell on every runner OS.")
    }
    if (job_runner["deploy-android"] != "[self-hosted, e2e]") {
      fail("Android release must stay on the frontend runner labeled e2e.")
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
    expected_backend = "${{ !cancelled() && github.ref == '\''refs/heads/master'\'' && needs.changes.result == '\''success'\'' && needs.changes.outputs.backend == '\''true'\'' && (needs.solid-boundaries.result == '\''success'\'' || (github.event_name == '\''workflow_dispatch'\'' && inputs.backend_deploy_only)) && (needs.backend-ci.result == '\''success'\'' || (github.event_name == '\''workflow_dispatch'\'' && inputs.backend_deploy_only)) }}"
    if (job_condition["deploy-frontend-web"] != expected_frontend) {
      fail("Frontend deploy must require a master push and the frontend path filter.")
    }
    if (job_condition["deploy-backend-web"] != expected_backend) {
      fail("Backend deploy must require a master push and the backend path filter.")
    }
    if (job_condition["deploy-android"] != expected_frontend) {
      fail("Android release must require a master push and the frontend path filter.")
    }
    if (!android_contents_write) fail("Android release must retain permission to push its release tag.")

    if (failed) exit 1
  }
' .github/workflows/pipeline.yml

notes_retry_contract=$(sed -n '/      - name: Generate release notes/,/      - name: Publish Android release to Telegram/p' .github/workflows/pipeline.yml)
for required in 'MAX_ATTEMPTS=3' '-le "$MAX_ATTEMPTS"' 'BASE_DELAY=$((1 << (attempt - 1)))' 'RANDOM' 'sleep "$DELAY"' 'curl -fsSL https://api.openai.com/v1/chat/completions'; do
  if ! grep -Fq -- "$required" <<< "$notes_retry_contract"; then
    echo "Android release notes must retry the OpenAI request up to three times with exponential jittered delays ($required)." >&2
    exit 1
  fi
done
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
if [[ ! -f scripts/check-solid-boundaries.ps1 ]]; then
  echo "Trusted PR SOLID boundaries require scripts/check-solid-boundaries.ps1." >&2
  exit 1
fi
if grep -Fq '[System.IO.Path]::GetRelativePath' scripts/check-solid-boundaries.ps1; then
  echo "The SOLID boundary script must support Windows PowerShell 5.1 on the self-hosted Windows runners." >&2
  exit 1
fi
solid_workflow_contract=$(sed -n '/^  solid-boundaries:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' "$trusted_pr_workflow")
for required in 'shell: powershell' 'scripts/check-solid-boundaries.ps1 all'; do
  if ! grep -Fq "$required" <<< "$solid_workflow_contract"; then
    echo "Trusted PR SOLID boundaries must run on Windows with PowerShell ($required)." >&2
    exit 1
  fi
done
if grep -Fq 'bash scripts/check-solid-boundaries.sh' "$trusted_pr_workflow"; then
  echo "Trusted PR SOLID boundary checks must not invoke the Bash checker." >&2
  exit 1
fi
if [[ $(grep -Fc "'scripts/check-solid-boundaries.ps1'" "$trusted_pr_workflow") -ne 2 ]]; then
  echo "Frontend and backend path filters must trigger the Windows SOLID boundary job for checker changes." >&2
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
  self_hosted_label="$2"
  hosted_label="$3"
  runner=$(trusted_pr_job_runner "$job")
  expected_runner="\${{ contains(fromJSON('[\"OWNER\",\"MEMBER\",\"COLLABORATOR\"]'), github.event.pull_request.author_association) && fromJSON('[\"self-hosted\",\"$self_hosted_label\"]') || fromJSON('[\"$hosted_label\"]') }}"

  if [[ "$runner" != "$expected_runner" ]]; then
    echo "Trusted PR $job must use the $self_hosted_label self-hosted runner for collaborators and $hosted_label for community PRs." >&2
    exit 1
  fi
}

require_trusted_pr_runner changes Windows ubuntu-latest
require_trusted_pr_runner pipeline-contract Windows ubuntu-latest
require_trusted_pr_runner frontend-ci e2e ubuntu-latest
require_trusted_pr_runner backend-ci tests ubuntu-latest
require_trusted_pr_runner solid-boundaries Windows windows-latest

grep -Fq 'run: bash .github/workflows/pipeline.test.sh' "$trusted_pr_workflow" || {
  echo "Trusted PR checks must run pipeline.test.sh before merge." >&2
  exit 1
}

grep -Fq "github.event.pull_request.author_association" "$trusted_pr_workflow" || {
  echo "PR workflow must route based on the pull request author's repository association." >&2
  exit 1
}

frontend_ci_contract=$(sed -n '/^  frontend-ci:/,/^  backend-ci:/p' "$trusted_pr_workflow")
for required in "Ensure Git Bash is available on Windows" "if: runner.os == 'Windows'" 'shell: bash' 'run: npm ci' 'run: npm test' 'run: npm run build'; do
  if ! grep -Fq "$required" <<< "$frontend_ci_contract"; then
    echo "Trusted PR frontend checks must run on Linux and Windows e2e runners with a working Bash shell ($required)." >&2
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
grep -Fq 'install-mode: none' .github/workflows/pipeline.yml || {
  echo "Backend CI must use the golangci-lint binary preinstalled on its persistent runner." >&2
  exit 1
}
grep -Fq 'echo "$HOME/.local/bin" >> "$GITHUB_PATH"' .github/workflows/pipeline.yml || {
  echo "Backend CI must add the runner-local golangci-lint installation directory to PATH." >&2
  exit 1
}
grep -Fq 'GOLANGCI_LINT_VERSION: 2.14.0' .github/workflows/pipeline.yml || {
  echo "Backend CI must pin and verify the preinstalled golangci-lint version." >&2
  exit 1
}
grep -Fq 'version="$(golangci-lint --version)"' .github/workflows/pipeline.yml || {
  echo "Backend CI must check the preinstalled golangci-lint version before running it." >&2
  exit 1
}
grep -Fq 'if [[ "$version" != *"version ${GOLANGCI_LINT_VERSION}"* ]]; then' .github/workflows/pipeline.yml || {
  echo "Backend CI must fail when the preinstalled golangci-lint version does not match its pin." >&2
  exit 1
}
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
for required in 'runs-on: [self-hosted, Windows, e2e]' 'shell: powershell' 'scripts/check-solid-boundaries.ps1 all'; do
  if ! grep -Fq "$required" <<< "$solid_workflow_contract"; then
    echo "Master SOLID boundaries must run once in a dedicated Windows job ($required)." >&2
    exit 1
  fi
done

docs_workflow_contract=$(sed -n '/^  docs-and-deployment:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/docs-validation.yml)
for required in 'github.event.pull_request.author_association' 'OWNER' 'MEMBER' 'COLLABORATOR' 'self-hosted' 'Linux' 'tests' 'ubuntu-latest'; do
  if ! grep -Fq "$required" <<< "$docs_workflow_contract"; then
    echo "Docs validation must use the tests runner for collaborator PRs and GitHub-hosted Ubuntu for community PRs ($required)." >&2
    exit 1
  fi
done

codeql_workflow_contract=$(sed -n '/^  analyze:/,/^  [[:alnum:]_-][[:alnum:]_-]*:/p' .github/workflows/codeql.yml)
for required in 'github.event.pull_request.author_association' 'OWNER' 'MEMBER' 'COLLABORATOR' 'self-hosted' 'Linux' 'tests' 'ubuntu-latest' 'max-parallel: 1'; do
  if ! grep -Fq "$required" <<< "$codeql_workflow_contract"; then
    echo "CodeQL must run serially on the tests runner for collaborators; community PRs stay on hosted Ubuntu ($required)." >&2
    exit 1
  fi
done

if ! grep -Fq "needs.changes.outputs.frontend == 'true'" <<< "$solid_workflow_contract" ||
   ! grep -Fq "needs.changes.outputs.backend == 'true'" <<< "$solid_workflow_contract"; then
  echo "Master SOLID boundaries must run when either frontend or backend files change." >&2
  exit 1
fi
frontend_workflow_contract=$(sed -n '/^  frontend-ci:/,/^  backend-ci:/p' .github/workflows/pipeline.yml)
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
done
