#!/usr/bin/env bash
#
# sfms-backup.sh — automated MongoDB backup for the School Fee & ERP system.
#
# What it does, every time it runs (intended: nightly at 2:00 AM via cron):
#   1. Dumps the whole database to a single compressed archive (mongodump --gzip).
#   2. Uploads that archive OFF the server to cloud object storage (via rclone),
#      into daily/ — plus weekly/ on Sundays and monthly/ on the 1st.
#   3. Optionally mirrors it to a SECOND provider (different account/vendor), so
#      one account problem can't wipe every copy.
#   4. Prunes old copies on a grandfather-father-son schedule.
#   5. Keeps a few of the most recent dumps locally for fast restores.
#
# Secrets (the Mongo URI, cloud keys) live OUTSIDE this repo:
#   - Mongo URI + settings:  /etc/sfms-backup.env   (sourced below if present)
#   - Cloud credentials:     rclone config (~/.config/rclone/rclone.conf)
#
# Nothing sensitive is hard-coded here, so this file is safe to commit.

set -euo pipefail

# ---- Load config (kept off the repo) ---------------------------------------
# Create /etc/sfms-backup.env from the sample in this folder and `chmod 600` it.
if [[ -f /etc/sfms-backup.env ]]; then
  # shellcheck disable=SC1091
  source /etc/sfms-backup.env
fi

# ---- Settings (env overrides win; sane defaults otherwise) ------------------
MONGO_URI="${MONGO_URI:-mongodb://localhost:27017/sfms}"
STAGING_DIR="${STAGING_DIR:-/var/backups/sfms}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"          # e.g. ocibackup:sfms-backups  (REQUIRED for off-box copy)
RCLONE_REMOTE_2="${RCLONE_REMOTE_2:-}"      # e.g. b2backup:sfms-backups   (optional second provider)
KEEP_DAILY_DAYS="${KEEP_DAILY_DAYS:-14}"    # keep daily/ copies this many days
KEEP_WEEKLY_DAYS="${KEEP_WEEKLY_DAYS:-70}"  # keep weekly/ copies this many days (~10 weeks)
KEEP_MONTHLY_DAYS="${KEEP_MONTHLY_DAYS:-400}" # keep monthly/ copies this many days (~13 months)
KEEP_LOCAL="${KEEP_LOCAL:-3}"               # how many recent dumps to keep on this server
LOG_FILE="${LOG_FILE:-/var/log/sfms-backup.log}"

# ---- Helpers ----------------------------------------------------------------
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
die() { log "ERROR: $*"; exit 1; }

command -v mongodump >/dev/null 2>&1 || die "mongodump not found. Install mongodb-database-tools."

STAMP="$(date '+%Y-%m-%d_%H%M%S')"
DOW="$(date '+%u')"   # 1..7 (7 = Sunday)
DOM="$(date '+%d')"   # 01..31
ARCHIVE="sfms-${STAMP}.archive.gz"
LOCAL_PATH="${STAGING_DIR}/${ARCHIVE}"

mkdir -p "$STAGING_DIR"

# ---- 1. Dump ----------------------------------------------------------------
log "Starting backup → ${ARCHIVE}"
mongodump --uri="$MONGO_URI" --gzip --archive="$LOCAL_PATH" \
  || die "mongodump failed"
SIZE="$(du -h "$LOCAL_PATH" | cut -f1)"
log "Dump complete (${SIZE})"

# ---- 2. Upload off-box ------------------------------------------------------
upload_to() {
  local remote="$1"
  command -v rclone >/dev/null 2>&1 || die "rclone not found. Install rclone."
  log "Uploading to ${remote}/daily/"
  rclone copyto "$LOCAL_PATH" "${remote}/daily/${ARCHIVE}" || die "upload to ${remote}/daily failed"

  if [[ "$DOW" == "7" ]]; then
    log "Sunday → also copying to ${remote}/weekly/"
    rclone copyto "$LOCAL_PATH" "${remote}/weekly/${ARCHIVE}" || log "WARN: weekly copy to ${remote} failed"
  fi
  if [[ "$DOM" == "01" ]]; then
    log "1st of month → also copying to ${remote}/monthly/"
    rclone copyto "$LOCAL_PATH" "${remote}/monthly/${ARCHIVE}" || log "WARN: monthly copy to ${remote} failed"
  fi

  # Prune old remote copies (grandfather-father-son).
  log "Pruning old copies on ${remote}"
  rclone delete --min-age "${KEEP_DAILY_DAYS}d"   "${remote}/daily/"   || true
  rclone delete --min-age "${KEEP_WEEKLY_DAYS}d"  "${remote}/weekly/"  || true
  rclone delete --min-age "${KEEP_MONTHLY_DAYS}d" "${remote}/monthly/" || true
}

if [[ -n "$RCLONE_REMOTE" ]]; then
  upload_to "$RCLONE_REMOTE"
else
  log "WARN: RCLONE_REMOTE not set — backup stayed on this server only (NOT safe long-term)."
fi

if [[ -n "$RCLONE_REMOTE_2" ]]; then
  upload_to "$RCLONE_REMOTE_2"
fi

# ---- 3. Prune local staging -------------------------------------------------
# Keep only the newest KEEP_LOCAL dumps on this server (delete the rest).
log "Pruning local staging (keeping newest ${KEEP_LOCAL})"
ls -1t "${STAGING_DIR}"/sfms-*.archive.gz 2>/dev/null | tail -n +"$((KEEP_LOCAL + 1))" | while read -r old; do
  rm -f "$old" && log "  removed local $(basename "$old")"
done

log "Backup finished OK ✔"
