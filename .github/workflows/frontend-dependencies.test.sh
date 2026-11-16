#!/usr/bin/env bash
set -euo pipefail

# Exercise the actual restore step with a tiny artifact archive and mocked npm.
root=$(pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/fixture/node_modules/example" "$tmp/work/frontend" "$tmp/runner/frontend-dependencies-123"
printf 'installed\n' > "$tmp/fixture/node_modules/example/index.js"
tar -czf "$tmp/dependencies.tar.gz" -C "$tmp/fixture" node_modules
cat > "$tmp/bin/node" <<'SCRIPT'
#!/usr/bin/env bash
printf 'v22.1.0\n'
SCRIPT
cat > "$tmp/bin/npm" <<'SCRIPT'
#!/usr/bin/env bash
if [ "${1:-}" = --version ]; then printf '10.0.0\n'; exit 0; fi
[ "${1:-}" = ci ] || exit 1
[ -z "${GH_TOKEN:-}" ] || { echo 'GH_TOKEN leaked to npm' >&2; exit 1; }
printf 'npm ci\n' >> "$NPM_CALLS"
SCRIPT
chmod +x "$tmp/bin/node" "$tmp/bin/npm"
cat > "$tmp/bin/cygpath" <<'SCRIPT'
#!/usr/bin/env bash
if [ "${1:-}" = -u ]; then shift; fi
[[ "$1" == C:* ]] || { echo "unexpected Windows path: $1" >&2; exit 1; }
printf '%s/runner/frontend-dependencies-123\n' "$CYGPATH_ROOT"
SCRIPT
chmod +x "$tmp/bin/cygpath"
for workflow in pipeline.yml trusted-pr-tests.yml; do
  if ! awk '
    /^      - name: Download shared frontend dependencies$/ { step=1; next }
    step && /^      - name:/ { exit }
    step && /timeout-minutes: 5/ { bounded=1 }
    step && /continue-on-error: true/ { fallback=1 }
    END { exit !(bounded && fallback) }
  ' "$root/.github/workflows/$workflow"; then
    echo "Frontend dependency artifact downloads must be bounded and fall back to npm ci ($workflow)." >&2
    exit 1
  fi
  awk '
    /^      - name: Restore shared frontend dependencies or install locally$/ { step=1; next }
    step && /^        run: \|$/ { script=1; next }
    script && /^      - name:/ { exit }
    script { sub(/^          /, ""); print }
  ' "$root/.github/workflows/$workflow" > "$tmp/restore.sh"
  test -s "$tmp/restore.sh"
  export PATH="$tmp/bin:$PATH" NPM_CALLS="$tmp/npm-calls" FIXTURE_ARCHIVE="$tmp/dependencies.tar.gz" CYGPATH_ROOT="$tmp"
  export RUNNER_TEMP="$tmp/runner" GITHUB_RUN_ID=123 GITHUB_REPOSITORY=example/repo
  export RUNNER_OS=Linux RUNNER_ARCH=X64 PREP_OS=Linux PREP_ARCH=X64 PREP_NODE=v22.1.0 PREP_NPM=10.0.0
  export PREP_RESULT=success ARTIFACT_READY=true GH_TOKEN=example
  cp "$FIXTURE_ARCHIVE" "$RUNNER_TEMP/frontend-dependencies-$GITHUB_RUN_ID/frontend-dependencies.tar.gz"
  cd "$tmp/work"
  rm -rf frontend/node_modules "$NPM_CALLS"
  bash "$tmp/restore.sh"
  test -f frontend/node_modules/example/index.js
  test ! -e "$NPM_CALLS"
  rm -rf frontend/node_modules
  mkdir -p "$CYGPATH_ROOT/runner/frontend-dependencies-$GITHUB_RUN_ID"
  cp "$FIXTURE_ARCHIVE" "$CYGPATH_ROOT/runner/frontend-dependencies-$GITHUB_RUN_ID/frontend-dependencies.tar.gz"
  RUNNER_OS=Windows PREP_OS=Windows RUNNER_TEMP='C:\runner' bash "$tmp/restore.sh"
  test -f frontend/node_modules/example/index.js
  test ! -e "$NPM_CALLS"
  rm -rf frontend/node_modules
  PREP_NODE=v22.2.0 bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  rm -f "$RUNNER_TEMP/frontend-dependencies-$GITHUB_RUN_ID/frontend-dependencies.tar.gz"
  bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  cp "$FIXTURE_ARCHIVE" "$RUNNER_TEMP/frontend-dependencies-$GITHUB_RUN_ID/frontend-dependencies.tar.gz"
  ARTIFACT_READY=false bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  PREP_RESULT=failure bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  PREP_OS=Windows bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  printf 'invalid archive' > "$RUNNER_TEMP/frontend-dependencies-$GITHUB_RUN_ID/frontend-dependencies.tar.gz"
  bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  cd "$root"
done
printf 'Frontend dependency restore and fallback checks passed.\n'
