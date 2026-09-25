#!/usr/bin/env bash
# Smoke-tests the BUILT API (apps/api/dist) against a real Postgres at $DATABASE_URL:
#   1. first start applies every migration; health, business types and the full
#      sign-in -> create business -> Home flow work over real HTTP
#   2. second start applies nothing (migrations are idempotent) and data is intact
# Used by CI and by the deploy workflow's verify job. Requires: node, curl, jq.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
PORT="${PORT:-4010}"
BASE="http://127.0.0.1:$PORT"
LOG="$(mktemp)"
PID=""
PHONE="+919812345678"
trap 'if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; fi' EXIT

start_api() {
  PORT="$PORT" AUTH_OTP_DEV_ECHO=true LOG_LEVEL=info node apps/api/dist/index.js >"$LOG" 2>&1 &
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

die() { echo "::error::$1"; cat "$LOG"; exit 1; }

# api <METHOD> <path> [json body] [token] -> prints the response body
api() {
  local args=(-sS -X "$1" "$BASE$2" -H "Accept: application/json")
  [ -n "${3:-}" ] && args+=(-H "Content-Type: application/json" -d "$3")
  [ -n "${4:-}" ] && args+=(-H "Authorization: Bearer $4")
  curl "${args[@]}"
}

expect() { # <description> <jq expression that must be true> <json>
  if echo "$3" | jq -e "$2" >/dev/null; then echo "  ok: $1"; else die "$1 failed. Response: $3"; fi
}

sign_in() {
  local code
  code="$(api POST /api/v1/auth/otp/request "{\"phone\":\"$PHONE\"}" | jq -r '.data.devCode')"
  [[ "$code" =~ ^[0-9]{6}$ ]] || die "no sign-in code returned"
  api POST /api/v1/auth/otp/verify "{\"phone\":\"$PHONE\",\"code\":\"$code\"}" | jq -r '.data.token'
}

echo "== first start (fresh database)"
start_api
for m in 0001_create_bookings 0002_workspaces_and_team 0003_seed_business_types; do
  grep -q "applied migration $m.sql" "$LOG" || die "migration $m was not applied"
done
echo "  ok: migrations applied"
expect "health is ok with database up" '.success and .data.status == "ok" and .data.database.status == "up"' "$(api GET /api/health)"
expect "business types are seeded" '.success and (.data | length) >= 12' "$(api GET /api/v1/business-types)"
expect "protected routes need a token" '.success == false and .error.code == "UNAUTHORIZED"' "$(api GET /api/v1/auth/me)"

TOKEN="$(sign_in)"
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || die "sign-in failed"
echo "  ok: signed in with a phone code"
WS="$(api POST /api/v1/workspaces '{"name":"Smoke Test Studio","businessTypeId":"makeup_artist","city":"Jaipur"}' "$TOKEN")"
expect "business created with the owner role" '.success and .data.role == "owner"' "$WS"
WS_ID="$(echo "$WS" | jq -r '.data.id')"
expect "Home summary is worked out by the server" '.success and .data.setupTotal == 3 and .data.setupDone == 1' \
  "$(api GET "/api/v1/workspaces/$WS_ID/home" "" "$TOKEN")"
stop_api

echo "== second start (same database)"
start_api
if grep -q "applied migration" "$LOG"; then die "migrations ran twice"; fi
echo "  ok: no migrations re-applied"
TOKEN="$(sign_in)"
expect "data intact after restart" ".success and (.data.workspaces | map(.id) | index(\"$WS_ID\")) != null" \
  "$(api GET /api/v1/auth/me "" "$TOKEN")"
stop_api

echo "API smoke test passed"
