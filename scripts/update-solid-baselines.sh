#!/usr/bin/env bash
set -euo pipefail

readonly limit=400
readonly baseline_file="docs/engineering/size-baseline.tsv"

get_backend_files() {
  find backend/internal -type f -name '*.go' ! -name '*_test.go' \
    ! -path 'backend/internal/ent/*' -print | sort
}

get_frontend_files() {
  find frontend/src -type f \( -name '*.ts' -o -name '*.tsx' \) \
    ! -name '*.test.*' -print | sort
}

mapfile -t backend_files < <(get_backend_files)
mapfile -t frontend_files < <(get_frontend_files)
all_files=("${backend_files[@]}" "${frontend_files[@]}")

declare -A line_counts

if (( ${#all_files[@]} > 0 )); then
  while read -r lines file; do
    [[ -z "$file" || "$file" == "total" ]] && continue
    file="${file%$'\r'}"
    file="${file//\\/\/}"
    if (( lines > limit )); then
      line_counts["$file"]="$lines"
    fi
  done < <(wc -l "${all_files[@]}")
fi

out_file="docs/engineering/size-baseline.tsv.tmp"
: > "$out_file"

for f in $(printf '%s\n' "${!line_counts[@]}" | sort); do
  printf '%s\t%s\n' "$f" "${line_counts[$f]}" >> "$out_file"
done

mv "$out_file" "$baseline_file"
printf 'Successfully updated %s with %d baselines.\n' "$baseline_file" "${#line_counts[@]}"
