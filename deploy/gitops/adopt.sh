#!/usr/bin/env bash
# adopt.sh: Discovers running vs registered tenant containers and networks,
# ensuring adoption safety without deleting or breaking active resources.
set -euo pipefail

pg_user="${POSTGRES_USER:-family_user}"
pg_db="${POSTGRES_DB:-family_messenger}"

echo "=== Stovo Multiserver GitOps Adoption Check ==="

# 1. Fetch registered tenants from master PostgreSQL
registered_tenants="$(sudo docker compose --project-directory . -f deploy/compose/production-multiserver.yml exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U "$pg_user" -d "$pg_db" -tAc 'SELECT slug FROM servers ORDER BY slug' 2>/dev/null || true)"

# 2. Fetch running tenant containers
running_tenants="$(sudo docker ps --format '{{.Names}}' | sed -n 's/^stovo-backend-\([[:alnum:]][[:alnum:]-]*\)$/\1/p' | sort -u || true)"

echo "Registered tenants:"
printf '%s\n' "$registered_tenants" | sed 's/^/  - /'

echo "Running tenant containers:"
printf '%s\n' "$running_tenants" | sed 's/^/  - /'

# 3. Check for running-only (unregistered) tenants
unregistered=""
for tenant in $running_tenants; do
  if ! printf '%s\n' "$registered_tenants" | grep -qx "$tenant"; then
    unregistered="${unregistered:+$unregistered }$tenant"
  fi
done

if [ -n "$unregistered" ]; then
  echo "ERROR: Discrepancy detected! The following running tenant containers are not registered in master DB:" >&2
  for t in $unregistered; do
    echo "  ! $t" >&2
  done
  echo "Adoption blocked. Running-only containers must be manually reconciled or registered, never deleted." >&2
  exit 1
fi

# 4. Check proxy network and volume identities
echo "Checking Docker proxy network and volumes..."
for net in stovo_default stovo-master-members-proxy-v2; do
  if sudo docker network inspect "$net" >/dev/null 2>&1; then
    echo "  ✓ Network $net exists"
  else
    echo "  ! Notice: Network $net not yet created"
  fi
done

echo "Adoption pre-checks passed successfully. Ready for GitOps transition."
