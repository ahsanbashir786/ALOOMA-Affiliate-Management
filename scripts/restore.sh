#!/bin/sh
# Restore a backup into the Docker database:  ./scripts/restore.sh backups/affiliate-YYYYMMDD-HHMMSS.dump
# This REPLACES the current data. Take a fresh backup first (./scripts/backup.sh).
set -eu
cd "$(dirname "$0")/.."
[ -f "${1:-}" ] || { echo "Usage: ./scripts/restore.sh <backup file>"; exit 1; }
printf "This replaces ALL current data with %s. Type YES to continue: " "$1"
read -r a; [ "$a" = "YES" ] || { echo "Cancelled."; exit 1; }
docker compose stop app
docker compose exec -T db pg_restore -U affiliate -d affiliate --clean --if-exists --no-owner < "$1"
docker compose start app
echo "Restored."
