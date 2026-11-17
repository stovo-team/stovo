#!/usr/bin/env bash
set -euo pipefail

if [[ "$(node -p 'process.platform')" != win32 ]]; then
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  project="$tmp/project"
  mkdir -p "$project/frontend" "$project/.github/workflows" "$tmp/bin"
  cp .github/workflows/frontend-dependencies.mjs "$project/.github/workflows/frontend-dependencies.mjs"
  printf '{"name":"fixture","version":"1.0.0"}\n' > "$project/frontend/package.json"
  printf '{"name":"fixture","lockfileVersion":3,"packages":{}}\n' > "$project/frontend/package-lock.json"
  cat > "$tmp/bin/npm" <<'SCRIPT'
#!/usr/bin/env sh
if [ "$1" = --version ]; then
  printf '10.9.8\n'
elif [ "$1" = ci ]; then
  printf '%s\n' "$PWD" >> "$NPM_CALLS"
  mkdir -p node_modules
  printf '{}\n' > node_modules/.package-lock.json
  printf 'installed\n' > node_modules/example.txt
else
  exit 1
fi
SCRIPT
  chmod +x "$tmp/bin/npm"
  export PATH="$tmp/bin:$PATH" NPM_CALLS="$tmp/npm-calls" XDG_CACHE_HOME="$tmp/cache"
  cd "$project"
  FRONTEND_DEPENDENCY_CACHE_WRITE=true node .github/workflows/frontend-dependencies.mjs prepare
  test "$(wc -l < "$NPM_CALLS")" -eq 1
  rm -rf frontend/node_modules
  node .github/workflows/frontend-dependencies.mjs restore
  test -f frontend/node_modules/example.txt
  test "$(realpath frontend/node_modules)" = "$(realpath "$(find "$tmp/cache" -type f -name .package-lock.json -printf '%h\n' | head -1)")"
  test "$(wc -l < "$NPM_CALLS")" -eq 1
  printf '\n' >> frontend/package-lock.json
  node .github/workflows/frontend-dependencies.mjs restore
  test "$(wc -l < "$NPM_CALLS")" -eq 2
  cd - >/dev/null
fi

for workflow in .github/workflows/pipeline.yml .github/workflows/trusted-pr-tests.yml; do
  grep -Fq '.github/workflows/frontend-dependencies.mjs prepare' "$workflow"
  grep -Fq '.github/workflows/frontend-dependencies.mjs restore' "$workflow"
  frontend_jobs=$(sed -n '/^  frontend_dependencies:/,/^  frontend_test_shards:/p' "$workflow")
  if grep -Eq 'actions/(upload|download)-artifact|frontend-dependencies\.tar\.gz' <<< "$frontend_jobs"; then
    echo "Frontend dependencies in $workflow must stay unpacked on the runner and must not be transferred as artifacts." >&2
    exit 1
  fi
done

grep -Fq "FRONTEND_DEPENDENCY_CACHE_WRITE: \${{ github.ref == 'refs/heads/master' }}" .github/workflows/pipeline.yml
grep -Fq "FRONTEND_DEPENDENCY_CACHE_WRITE: 'false'" .github/workflows/trusted-pr-tests.yml
grep -Fq 'github.event.pull_request.head.repo.full_name == github.repository' .github/workflows/trusted-pr-tests.yml

echo 'Frontend runner-local dependency cache contract passed.'
