#!/bin/sh
set -eu

case "${DB_HOST:-}" in
  ''|*[!A-Za-z0-9.-]*) echo 'invalid PGBOUNCER_UPSTREAM_HOST' >&2; exit 1 ;;
esac
case "${DB_PORT:-}" in
  ''|*[!0-9]*) echo 'invalid PGBOUNCER_UPSTREAM_PORT' >&2; exit 1 ;;
esac
if [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; then
  echo 'PGBOUNCER_UPSTREAM_PORT must be between 1 and 65535' >&2
  exit 1
fi
case "${PGBOUNCER_SERVER_TLS_SSLMODE:-}" in
  disable|allow|prefer|require|verify-ca|verify-full) ;;
  *) echo 'invalid PGBOUNCER_SERVER_TLS_SSLMODE' >&2; exit 1 ;;
esac
case "${DB_PASSWORD:-}" in
  ''|*[!A-Fa-f0-9]*) echo 'PGBOUNCER_ADMIN_PASSWORD must be hexadecimal' >&2; exit 1 ;;
esac
if [ "${#DB_PASSWORD}" -lt 32 ]; then
  echo 'PGBOUNCER_ADMIN_PASSWORD must be at least 32 hexadecimal characters' >&2
  exit 1
fi

for value in "$MAX_CLIENT_CONN" "$DEFAULT_POOL_SIZE" "$MAX_DB_CONNECTIONS" "$MAX_PREPARED_STATEMENTS"; do
  case "$value" in
    ''|*[!0-9]*) echo 'invalid PgBouncer pool setting' >&2; exit 1 ;;
  esac
done
if [ "$MAX_CLIENT_CONN" -lt 1 ] || [ "$DEFAULT_POOL_SIZE" -lt 1 ] || [ "$MAX_DB_CONNECTIONS" -lt 1 ]; then
  echo 'PgBouncer client and pool limits must be positive' >&2
  exit 1
fi

sed \
  -e "s|@DB_HOST@|${DB_HOST}|g" \
  -e "s|@DB_PORT@|${DB_PORT}|g" \
  -e "s|@SERVER_TLS_SSLMODE@|${PGBOUNCER_SERVER_TLS_SSLMODE}|g" \
  -e "s|@MAX_CLIENT_CONN@|${MAX_CLIENT_CONN}|g" \
  -e "s|@DEFAULT_POOL_SIZE@|${DEFAULT_POOL_SIZE}|g" \
  -e "s|@MAX_DB_CONNECTIONS@|${MAX_DB_CONNECTIONS}|g" \
  -e "s|@MAX_PREPARED_STATEMENTS@|${MAX_PREPARED_STATEMENTS}|g" \
  /etc/pgbouncer/pgbouncer.ini.template > /tmp/pgbouncer.ini

exec /usr/bin/pgbouncer /tmp/pgbouncer.ini
