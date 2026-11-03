#!/bin/sh
# Daily database backup for the Docker setup. Keeps the newest 14 copies in ./backups.
# Schedule it on the server:  crontab -e   →   30 3 * * * cd /opt/affiliate-hq && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."
mkdir -p backups
f="backups/affiliate-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U affiliate -Fc affiliate > "$f"
[ -s "$f" ] || { echo "Backup is empty – failed"; rm -f "$f"; exit 1; }
echo "$(date -Is) saved $f ($(du -h "$f" | cut -f1))"
ls -1t backups/affiliate-*.dump | tail -n +15 | xargs -r rm -f
