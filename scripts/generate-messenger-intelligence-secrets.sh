#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
  cat >&2 <<'EOF'
Usage:
  generate-messenger-intelligence-secrets.sh <MESSENGER_OIDC_ISSUER> <INTELLIGENCE_ORIGIN>

Example:
  generate-messenger-intelligence-secrets.sh \
    https://messenger.example.com https://intelligence.example.com

Both values must be canonical HTTPS origins without a path or trailing slash.
Set OUT_DIR to choose where generated secret files are stored.
EOF
}

if [[ $# -ne 2 ]]; then
  usage
  exit 2
fi

issuer="$1"
intelligence_origin="$2"
origin_pattern='^https://([A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(:[0-9]{1,5})?$'

validate_origin() {
  local value="$1"
  local authority
  local port

  [[ "$value" =~ $origin_pattern ]] || return 1
  authority="${value#https://}"
  [[ "$authority" == "${authority,,}" ]] || return 1

  if [[ "$authority" =~ :([0-9]{1,5})$ ]]; then
    port="$((10#${BASH_REMATCH[1]}))"
    (( port > 0 && port <= 65535 && port != 443 )) || return 1
  fi
}

if ! validate_origin "$issuer"; then
  echo "Invalid Messenger issuer: expected a canonical HTTPS origin without a path or trailing slash." >&2
  exit 2
fi

if ! validate_origin "$intelligence_origin"; then
  echo "Invalid Intelligence origin: expected an HTTPS origin without a path or trailing slash." >&2
  exit 2
fi

command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required." >&2
  exit 1
}

config_root="${XDG_CONFIG_HOME:-${HOME:?HOME must be set}/.config}"
out_dir="${OUT_DIR:-$config_root/stovo/messenger-intelligence}"

if [[ -e "$out_dir" ]]; then
  echo "Output directory already exists: $out_dir" >&2
  echo "Choose another path with OUT_DIR; existing files were not changed." >&2
  exit 1
fi

mkdir -p -- "$out_dir"
chmod 700 -- "$out_dir"

client_id="intelligence-$(openssl rand -hex 12)"
client_secret="$(openssl rand -hex 32)"
key_id="messenger-$(date -u +%Y%m%d)-$(openssl rand -hex 4)"
private_key="$out_dir/oidc-signing-private.pem"
env_file="$out_dir/messenger.env"

if ! openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:3072 \
  -out "$private_key" 2>/dev/null; then
  echo "Failed to generate the RSA signing key." >&2
  exit 1
fi
chmod 600 -- "$private_key"

cat > "$env_file" <<EOF
# Keep both gates disabled until the integration contract and rollout are approved.
INTELLIGENCE_OIDC_ENABLED=false
INTELLIGENCE_SOURCE_ENABLED=false
INTELLIGENCE_OIDC_ISSUER=$issuer
INTELLIGENCE_OIDC_CLIENT_ID=$client_id
INTELLIGENCE_OIDC_CLIENT_SECRET=$client_secret
INTELLIGENCE_OIDC_REDIRECT_URIS=$intelligence_origin/mcp/oidc/callback,$intelligence_origin/v1/messenger/callback
INTELLIGENCE_OIDC_SIGNING_KEY_ID=$key_id
# Set INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM from oidc-signing-private.pem.
EOF
chmod 600 -- "$env_file"

printf 'Secret files created in: %s\n' "$(cd -- "$out_dir" && pwd -P)"
printf 'Add messenger.env to the Messenger deployment secret manager.\n'
printf 'Set the contents of oidc-signing-private.pem as INTELLIGENCE_OIDC_SIGNING_PRIVATE_KEY_PEM.\n'
printf 'The generated credentials were not printed.\n'
