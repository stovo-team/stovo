#!/usr/bin/env bash
set -euo pipefail

# Exercise the actual restore step with a tiny archive and mocked GitHub/npm.
root=$(pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/fixture/node_modules/example" "$tmp/work/frontend" "$tmp/runner"
printf 'installed\n' > "$tmp/fixture/node_modules/example/index.js"
tar -cf "$tmp/dependencies.tar" -C "$tmp/fixture" node_modules
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
cat > "$tmp/bin/gh" <<'SCRIPT'
#!/usr/bin/env bash
[ "${GH_FAIL:-false}" != true ] || exit 1
while [ "$#" -gt 0 ]; do
  if [ "$1" = --dir ]; then shift; mkdir -p "$1"; cp "$FIXTURE_ARCHIVE" "$1/frontend-dependencies.tar"; exit 0; fi
  shift
done
exit 1
SCRIPT
chmod +x "$tmp/bin/node" "$tmp/bin/npm" "$tmp/bin/gh"
for workflow in pipeline.yml trusted-pr-tests.yml; do
  awk '
    /^      - name: Restore shared frontend dependencies or install locally$/ { step=1; next }
    step && /^        run: \|$/ { script=1; next }
    script && /^      - name:/ { exit }
    script { sub(/^          /, ""); print }
  ' "$root/.github/workflows/$workflow" > "$tmp/restore.sh"
  test -s "$tmp/restore.sh"
  export PATH="$tmp/bin:$PATH" NPM_CALLS="$tmp/npm-calls" FIXTURE_ARCHIVE="$tmp/dependencies.tar"
  export RUNNER_TEMP="$tmp/runner" GITHUB_RUN_ID=123 GITHUB_REPOSITORY=example/repo
  export RUNNER_OS=Linux RUNNER_ARCH=X64 PREP_OS=Linux PREP_ARCH=X64 PREP_NODE=v22.1.0 PREP_NPM=10.0.0
  export PREP_RESULT=success ARTIFACT_READY=true GH_TOKEN=example
  cd "$tmp/work"
  rm -rf frontend/node_modules "$NPM_CALLS"
  bash "$tmp/restore.sh"
  test -f frontend/node_modules/example/index.js
  test ! -e "$NPM_CALLS"
  rm -rf frontend/node_modules
  PREP_NODE=v22.2.0 bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  GH_FAIL=true bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  ARTIFACT_READY=false bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  PREP_RESULT=failure bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  PREP_OS=Windows bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  rm -f "$NPM_CALLS"
  printf 'invalid archive' > "$tmp/bad.tar"
  FIXTURE_ARCHIVE="$tmp/bad.tar" bash "$tmp/restore.sh"
  test -f "$NPM_CALLS"
  cd "$root"
done
printf 'Frontend dependency restore and fallback checks passed.\n'
