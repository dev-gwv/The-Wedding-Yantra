#!/bin/sh
# Postgres backups for Wedding Yantra (runs inside the wedding-yantra-backup container).
#
#   backup.sh          loop: one backup now, then one every day at BACKUP_HOUR_UTC:BACKUP_MINUTE_UTC
#   backup.sh once     a single backup (used by the deploy right before rolling out)
#
# Connection comes from the standard PG* env vars. Files: /backups/wy-<UTC timestamp>.dump
# (pg_dump custom format; restore with pg_restore, see docs/DEPLOYMENT.md).
# Bill photos (mounted read-only at /uploads) are copied into /backups/uploads. They never
# change once uploaded, so only new ones are copied, and deleted ones stay in the copy.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
HOUR="${BACKUP_HOUR_UTC:-20}"     # 20:00 UTC = 01:30 IST
MINUTE="${BACKUP_MINUTE_UTC:-0}"
DIR="${BACKUP_DIR:-/backups}"

umask 077

backup() {
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  final="$DIR/wy-$ts.dump"
  tmp="$DIR/.wy-$ts.dump.partial"
  if pg_dump --format=custom --file="$tmp"; then
    mv "$tmp" "$final"
    echo "[backup] ok: $(basename "$final") ($(du -h "$final" | cut -f1))"
  else
    rm -f "$tmp"
    echo "[backup] FAILED at $ts" >&2
    return 1
  fi
  if [ -d /uploads ]; then
    mkdir -p "$DIR/uploads"
    if cp -a -n /uploads/. "$DIR/uploads/"; then
      echo "[backup] ok: photos copied ($(du -sh "$DIR/uploads" | cut -f1) in all)"
    else
      echo "[backup] photo copy FAILED" >&2
    fi
  fi
  # Retention: always keep the newest 3; of the rest, delete those older than KEEP_DAYS.
  ls -1t "$DIR"/wy-*.dump 2>/dev/null | tail -n +4 | while read -r f; do
    if [ -n "$(find "$f" -mtime +"$KEEP_DAYS")" ]; then
      rm -f -- "$f"
      echo "[backup] pruned $(basename "$f")"
    fi
  done
}

if [ "${1:-}" = "once" ]; then
  backup
  exit $?
fi

echo "[backup] scheduler started: daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE") UTC, keeping $KEEP_DAYS days"
backup || true

while true; do
  now=$(date -u +%s)
  target=$(( HOUR * 3600 + MINUTE * 60 ))
  wait=$(( (target - now % 86400 + 86400) % 86400 ))
  [ "$wait" -eq 0 ] && wait=86400
  sleep "$wait"
  backup || true
done
