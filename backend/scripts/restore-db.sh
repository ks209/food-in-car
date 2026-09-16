#!/usr/bin/env bash
# Restore a dump made by backup-db.sh.
#
#   ./scripts/restore-db.sh /var/backups/foodincar/foodincar_2026-09-16_030000.dump [target_db]
#
# target_db defaults to "foodincar_restore_test" — a SEPARATE database, so the
# default is a safe restore drill that leaves the live data alone. Restoring
# over the live database is deliberate: pass "foodincar" explicitly, and stop
# the backend first (docker compose stop backend) so nothing writes meanwhile.
#
# Same DB_USER / DB_CONTAINER settings as backup-db.sh.
set -euo pipefail

dump_file="${1:?usage: restore-db.sh <dump file> [target_db]}"
target="${2:-foodincar_restore_test}"
DB_USER="${DB_USER:-postgres}"
COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

psql_exec() {
  if [ -n "${DB_CONTAINER:-}" ]; then docker exec -i "$DB_CONTAINER" "$@"
  else docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db "$@"; fi
}

[ -s "$dump_file" ] || { echo "No such dump: $dump_file" >&2; exit 1; }

if [ "$target" = "foodincar" ]; then
  read -r -p "Overwrite the LIVE database 'foodincar'? Type 'restore' to continue: " answer
  [ "$answer" = "restore" ] || { echo "Aborted."; exit 1; }
fi

echo "Creating database $target (if missing)…"
psql_exec psql -U "$DB_USER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$target'" | grep -q 1 \
  || psql_exec psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$target\""

echo "Restoring $dump_file into $target…"
psql_exec pg_restore -U "$DB_USER" -d "$target" --clean --if-exists --no-owner < "$dump_file"

echo "Done. Quick check:"
psql_exec psql -U "$DB_USER" -d "$target" -c 'SELECT (SELECT count(*) FROM "Restaurant") AS restaurants, (SELECT count(*) FROM "Order") AS orders, (SELECT max("createdAt") FROM "Order") AS latest_order'
