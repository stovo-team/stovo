#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <container-name> <network-alias>" >&2
  exit 2
fi

container_name="$1"
network_alias="$2"
network_name='stovo-master-members-proxy-v2'
network_state="$(sudo docker inspect --format '{{json .NetworkSettings.Networks}}' "$container_name")"

if ! grep -Fq "\"$network_name\":" <<< "$network_state"; then
  sudo docker network connect --alias "$network_alias" "$network_name" "$container_name"
fi
