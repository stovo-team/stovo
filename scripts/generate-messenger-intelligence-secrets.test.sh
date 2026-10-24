#!/usr/bin/env bash
set -Eeuo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
generator="$script_dir/generate-messenger-intelligence-secrets.sh"
temporary_root="$(mktemp -d)"
trap 'rm -rf -- "$temporary_root"' EXIT

output_dir="$temporary_root/secrets"
stdout_file="$temporary_root/stdout"

OUT_DIR="$output_dir" "$generator" \
  https://messenger.example.com \
  https://intelligence.example.com >"$stdout_file"

[[ "$(stat -c '%a' "$output_dir")" == "700" ]]
[[ "$(stat -c '%a' "$output_dir/messenger.env")" == "600" ]]
[[ "$(stat -c '%a' "$output_dir/oidc-signing-private.pem")" == "600" ]]
grep -q '^INTELLIGENCE_OIDC_ENABLED=false$' "$output_dir/messenger.env"
grep -q '^INTELLIGENCE_SOURCE_ENABLED=false$' "$output_dir/messenger.env"
grep -Eq '^INTELLIGENCE_OIDC_CLIENT_ID=intelligence-[0-9a-f]{24}$' "$output_dir/messenger.env"
grep -Eq '^INTELLIGENCE_OIDC_CLIENT_SECRET=[0-9a-f]{64}$' "$output_dir/messenger.env"
grep -q '^INTELLIGENCE_OIDC_REDIRECT_URIS=https://intelligence.example.com/mcp/oidc/callback,https://intelligence.example.com/v1/messenger/callback$' "$output_dir/messenger.env"
grep -q '^-----BEGIN PRIVATE KEY-----$' "$output_dir/oidc-signing-private.pem"
grep -q 'credentials were not printed' "$stdout_file"
client_secret="$(sed -n 's/^INTELLIGENCE_OIDC_CLIENT_SECRET=//p' "$output_dir/messenger.env")"
if grep -Fq "$client_secret" "$stdout_file"; then
  echo "The generator printed the client secret." >&2
  exit 1
fi

if OUT_DIR="$temporary_root/invalid" "$generator" \
  https://messenger.example.com/path \
  https://intelligence.example.com >/dev/null 2>&1; then
  echo "The generator accepted an issuer with a path." >&2
  exit 1
fi

echo "Messenger Intelligence secret generator checks passed."
