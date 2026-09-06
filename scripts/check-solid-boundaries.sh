#!/usr/bin/env bash
set -euo pipefail

readonly limit=400
readonly baseline_file=".architecture/size-baseline.tsv"

fail() {
  printf 'SOLID architecture check failed: %s\n' "$*" >&2
  exit 1
}

declare -A baseline_map
if [[ -f "$baseline_file" ]]; then
  while IFS=$'\t' read -r path allowed _; do
    path="${path%$'\r'}"
    allowed="${allowed%$'\r'}"
    [[ -n "$path" ]] && baseline_map["$path"]="$allowed"
  done < "$baseline_file"
fi

check_sizes() {
  local files=()
  local counts
  mapfile -t files < <("$@")
  if (( ${#files[@]} == 0 )); then
    return
  fi

  # Capture all counts before evaluating them. This avoids a broken-pipe error
  # from wc when a failing boundary check exits the loop early.
  if ! counts="$(wc -l "${files[@]}")"; then
    fail 'could not count production source-file lines'
  fi

  while read -r lines file; do
    [[ -z "$file" || "$file" == "total" ]] && continue
    file="${file%$'\r'}"
    file="${file//\\/\/}"
    if (( lines > limit )); then
      local allowed="${baseline_map[$file]:-}"
      if [[ -z "$allowed" ]]; then
        fail "$file is ${lines} lines; new production files must be at most ${limit} lines"
      fi
      if (( lines > allowed )); then
        fail "$file grew from its ${allowed}-line migration baseline to ${lines} lines"
      fi
    fi
  done <<< "$counts"
}

get_backend_files() {
  find backend/internal -type f -name '*.go' ! -name '*_test.go' \
    ! -path 'backend/internal/ent/*' -print | sort
}

get_frontend_files() {
  find frontend/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.*' -print | sort
}

check_sizes get_backend_files
check_sizes get_frontend_files

# The domain and use-case layers are portable policy. Concrete adapters belong
# in repository/infrastructure packages and are connected by bootstrap.
if grep -REn --include='*.go' --exclude='*_test.go' \
  'stovo-messenger/backend/internal/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)' \
  backend/internal/domain; then
  fail 'internal/domain imports an outer-layer package'
fi

if grep -REn --include='*.go' --exclude='*_test.go' \
  'stovo-messenger/backend/internal/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)|/(ent|redis|socketio)' \
  backend/internal/features; then
  fail 'a feature package imports an adapter or transport package'
fi

# Pages compose feature modules; feature modules may not depend on page-level
# routing or UI ownership.
if grep -REn --include='*.ts' --include='*.tsx' \
  "from ['\"][^'\"]*pages/|from ['\"][^'\"]*../pages" frontend/src/features; then
  fail 'a frontend feature imports a page module'
fi

printf 'SOLID architecture checks passed\n'
