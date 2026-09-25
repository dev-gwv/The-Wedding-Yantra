#!/usr/bin/env bash
# Smoke-tests the BUILT API (apps/api/dist) against a real Postgres at $DATABASE_URL:
#   1. first start applies migrations + seeds, /api/health and /api/bookings respond
#   2. second start applies nothing (migrations are idempotent) and data is intact
# Used by CI and by the deploy workflow's verify job. Requires: node, curl, jq.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PORT="${PORT:-4010}"
BASE="http://127.0.0.1:$PORT"
LOG="$(mktemp)"
PID=""
trap 'if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; fi' EXIT

start_api() {
  PORT="$PORT" SEED_DEMO_DATA=true LOG_LEVEL=info node apps/api/dist/index.js >"$LOG" 2>&1 &
  PID=$!
  for _ in $(seq 1 30); do
    if curl -fsS "$BASE/api/health" >/dev/null 2>&1; then return 0; fi
    if ! kill -0 "$PID" 2>/dev/null; then break; fi
    sleep 1
  done
  echo "::error::API failed to start"; cat "$LOG"; exit 1
}

stop_api() {
  kill "$PID"
  wait "$PID" 2>/dev/null || true
  PID=""
}

check() { # <description> <jq expression that must be true> <url path>
  local body
  body="$(curl -fsS "$BASE$3")"
  if echo "$body" | jq -e "$2" >/dev/null; then
    echo "  ok: $1"
  else
    echo "::error::$1 failed. Response: $body"; cat "$LOG"; exit 1
  fi
}

echo "== first start (fresh database)"
start_api
grep -q "applied migration 0001_create_bookings.sql" "$LOG" \
  || { echo "::error::baseline migration was not applied"; cat "$LOG"; exit 1; }
echo "  ok: migrations applied"
check "health is ok with database up" '.success and .data.status == "ok" and .data.database.status == "up"' /api/health
check "bookings returns seeded rows" '.success and (.data | length) == 5' /api/bookings
check "status filter works" '.success and all(.data[]; .status == "confirmed")' '/api/bookings?status=confirmed'
stop_api

echo "== second start (same database)"
start_api
if grep -q "applied migration" "$LOG"; then
  echo "::error::migrations ran twice"; cat "$LOG"; exit 1
fi
echo "  ok: no migrations re-applied"
check "data intact, not re-seeded" '.success and (.data | length) == 5' /api/bookings
stop_api

echo "API smoke test passed"
