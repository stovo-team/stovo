#!/usr/bin/env bash
set -euo pipefail

readonly limit=400
readonly baseline_file=".architecture/size-baseline.tsv"

fail() {
  printf 'SOLID architecture check failed: %s\n' "$*" >&2
  exit 1
}

if ! command -v rg >/dev/null 2>&1; then
  fail "ripgrep (rg) is required to run SOLID architecture boundary checks but was not found in PATH."
fi

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
  mapfile -t files < <("$@")
  if (( ${#files[@]} == 0 )); then
    return
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
  done < <(wc -l "${files[@]}")
}

get_backend_files() {
  rg --files -g '*.go' -g '!*_test.go' backend/internal | rg -v '^backend/internal[\\/]ent[\\/]' | sort
}

get_frontend_files() {
  rg --files -g '*.ts' -g '*.tsx' -g '!*.test.*' frontend/src | sort
}

check_sizes get_backend_files
check_sizes get_frontend_files

# The domain and use-case layers are portable policy. Concrete adapters belong
# in repository/infrastructure packages and are connected by bootstrap.
if rg -n --glob '*.go' --glob '!*_test.go' \
  'stovo-messenger/backend/internal/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)' \
  backend/internal/domain; then
  fail 'internal/domain imports an outer-layer package'
fi

if rg -n --glob '*.go' --glob '!*_test.go' \
  'stovo-messenger/backend/internal/(app|bootstrap|repository|ports|storage|broker|cache|logging|tunnel)|/(ent|redis|socketio)' \
  backend/internal/features; then
  fail 'a feature package imports an adapter or transport package'
fi

# Pages compose feature modules; feature modules may not depend on page-level
# routing or UI ownership.
if rg -n --glob '*.{ts,tsx}' "from ['\"][^'\"]*pages/|from ['\"][^'\"]*../pages" frontend/src/features; then
  fail 'a frontend feature imports a page module'
fi

printf 'SOLID architecture checks passed\n'
