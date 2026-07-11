#!/usr/bin/env bash
#
# sfms-restore.sh — restore the School Fee & ERP database from a backup archive.
#
# Usage:
#   ./sfms-restore.sh <archive.gz> [mongo-uri]
#
# Examples:
#   # Restore into a SCRATCH database first to verify the backup is good:
#   ./sfms-restore.sh sfms-2026-07-11_020001.archive.gz "mongodb://localhost:27017/sfms_restore_test"
#
#   # Real restore into the live database (DANGER: overwrites current data):
#   ./sfms-restore.sh sfms-2026-07-11_020001.archive.gz
#
# Tips:
#   - Download an archive from cloud storage first, e.g.:
#       rclone copy ocibackup:sfms-backups/daily/sfms-2026-07-11_020001.archive.gz .
#   - ALWAYS test-restore into a scratch DB before trusting a backup.

set -euo pipefail

ARCHIVE="${1:-}"
TARGET_URI="${2:-mongodb://localhost:27017/sfms}"

if [[ -z "$ARCHIVE" ]]; then
  echo "Usage: $0 <archive.gz> [mongo-uri]" >&2
  exit 1
fi
[[ -f "$ARCHIVE" ]] || { echo "File not found: $ARCHIVE" >&2; exit 1; }
command -v mongorestore >/dev/null 2>&1 || { echo "mongorestore not found. Install mongodb-database-tools." >&2; exit 1; }

echo "About to restore:"
echo "  from : $ARCHIVE"
echo "  into : $TARGET_URI"
echo
read -r -p "This can OVERWRITE existing data. Type 'yes' to continue: " CONFIRM
[[ "$CONFIRM" == "yes" ]] || { echo "Aborted."; exit 1; }

# --drop replaces each collection being restored (so it matches the backup).
mongorestore --uri="$TARGET_URI" --gzip --archive="$ARCHIVE" --drop

echo "Restore complete ✔"
