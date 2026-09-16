#!/usr/bin/env bash
# Nightly Postgres backup for the docker-compose deployment.
#
#   ./scripts/backup-db.sh                 # run from anywhere
#
# Writes a compressed pg_dump (custom format, restorable with pg_restore) to
# BACKUP_DIR, keeps KEEP_DAYS days of them, and — if RCLONE_REMOTE is set —
# copies each new dump off the server (Google Drive, S3, Backblaze B2, …).
# A backup that only lives on the same server dies with the server.
#
# Settings (environment variables, all optional):
#   BACKUP_DIR     where dumps go                    (default /var/backups/foodincar)
#   KEEP_DAYS      local retention in days           (default 14)
#   DB_NAME        database name                     (default foodincar)
#   DB_USER        database user                     (default postgres)
#   DB_CONTAINER   use this container via `docker exec` instead of `docker compose exec db`
#   RCLONE_REMOTE  e.g. "b2:my-bucket/foodincar" — upload target (needs rclone configured)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/foodincar}"
KEEP_DAYS="${KEEP_DAYS:-14}"
DB_NAME="${DB_NAME:-foodincar}"
DB_USER="${DB_USER:-postgres}"
COMPOSE_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # backend/, where docker-compose.yml lives

stamp="$(date +%Y-%m-%d_%H%M%S)"
file="$BACKUP_DIR/${DB_NAME}_${stamp}.dump"
mkdir -p "$BACKUP_DIR"

dump() {
  if [ -n "${DB_CONTAINER:-}" ]; then
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc
  else
    docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc
  fi
}

echo "[$(date -Is)] backing up $DB_NAME -> $file"
# Write to a temp name first so a failed/partial dump never looks like a good one.
dump > "$file.partial"
if [ ! -s "$file.partial" ]; then
  rm -f "$file.partial"
  echo "[$(date -Is)] ERROR: dump is empty" >&2
  exit 1
fi
mv "$file.partial" "$file"
echo "[$(date -Is)] ok: $(du -h "$file" | cut -f1)"

if [ -n "${RCLONE_REMOTE:-}" ]; then
  rclone copy "$file" "$RCLONE_REMOTE" && echo "[$(date -Is)] uploaded to $RCLONE_REMOTE"
fi

# Local retention — remote copies are managed by the remote's own lifecycle rules.
find "$BACKUP_DIR" -name "${DB_NAME}_*.dump" -type f -mtime +"$KEEP_DAYS" -print -delete
