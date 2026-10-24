#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat > "$tmp_dir/sudo" <<'SH'
#!/usr/bin/env bash
exec "$@"
SH

cat > "$tmp_dir/docker" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == inspect ]]; then
  printf '%s' "${FAKE_NETWORK_STATE:-{}}"
elif [[ "$1" == network && "$2" == connect ]]; then
  printf '%s\n' "$*" >> "$FAKE_DOCKER_CALLS"
else
  exit 90
fi
SH
chmod +x "$tmp_dir/sudo" "$tmp_dir/docker"

export PATH="$tmp_dir:$PATH"
export FAKE_DOCKER_CALLS="$tmp_dir/calls"
: > "$FAKE_DOCKER_CALLS"

FAKE_NETWORK_STATE='{}' bash "$SCRIPT_DIR/ensure-tenant-proxy-network.sh" stovo-backend-acdcbca1 stovo-backend-acdcbca1-proxy
if ! grep -Fxq 'network connect --alias stovo-backend-acdcbca1-proxy stovo-master-members-proxy-v2 stovo-backend-acdcbca1' "$FAKE_DOCKER_CALLS"; then
  echo "A tenant backend missing the proxy network must be connected with its stable alias." >&2
  exit 1
fi

: > "$FAKE_DOCKER_CALLS"
FAKE_NETWORK_STATE='{"stovo-master-members-proxy-v2":{"Aliases":["stovo-backend-acdcbca1-proxy"]}}' bash "$SCRIPT_DIR/ensure-tenant-proxy-network.sh" stovo-backend-acdcbca1 stovo-backend-acdcbca1-proxy
if [[ -s "$FAKE_DOCKER_CALLS" ]]; then
  echo "A tenant backend already on the proxy network must not be connected twice." >&2
  exit 1
fi

echo "Tenant proxy network checks passed."
