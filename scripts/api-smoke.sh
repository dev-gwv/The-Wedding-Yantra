#!/usr/bin/env bash
# Smoke-tests the BUILT API (apps/api/dist) against a real Postgres at $DATABASE_URL:
#   1. first start applies every migration; health, business types and the full
#      sign-in -> create business -> Home -> lead -> quote -> client accepts -> booked
#      -> bill -> payment -> bill photo -> expense -> monthly report -> checklist and tasks
#      -> scores, activity log and daily summary flow work over real HTTP
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
for m in 0001_create_bookings 0002_workspaces_and_team 0003_seed_business_types 0004_leads_and_clients \
  0005_catalogue_quotes_events 0006_bills_and_payments 0007_expenses \
  0008_tasks_and_team 0009_team_review 0010_time_off; do
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
LEAD="$(api POST "/api/v1/workspaces/$WS_ID/leads" '{"name":"Smoke Lead","phone":"9811100000","budget":50000}' "$TOKEN")"
expect "a lead can be added to the first stage" '.success and .data.stageName == "New enquiry" and .data.budget == 50000' "$LEAD"
expect "the pipeline counts it" '.success and .data.stages[0].leadCount == 1' \
  "$(api GET "/api/v1/workspaces/$WS_ID/leads" "" "$TOKEN")"
LEAD_ID="$(echo "$LEAD" | jq -r '.data.id')"
expect "the trade's starter price list is installed" '.success and (.data | length) >= 3' \
  "$(api GET "/api/v1/workspaces/$WS_ID/catalogue" "" "$TOKEN")"
QUOTE="$(api POST "/api/v1/workspaces/$WS_ID/quotes" \
  "{\"leadId\":\"$LEAD_ID\",\"title\":\"Bridal package\",\"items\":[{\"name\":\"Bridal makeup\",\"unit\":\"event\",\"quantity\":1,\"rate\":25000,\"taxRate\":18}]}" \
  "$TOKEN")"
expect "a quote is numbered and totalled by the server" \
  '.success and .data.number == "Q-0001" and .data.subtotal == 25000 and .data.tax == 4500 and .data.total == 29500' "$QUOTE"
QUOTE_ID="$(echo "$QUOTE" | jq -r '.data.id')"
SHARE="$(echo "$QUOTE" | jq -r '.data.shareToken')"
expect "the quote can be marked sent" '.success and .data.status == "sent"' \
  "$(api POST "/api/v1/workspaces/$WS_ID/quotes/$QUOTE_ID/send" "" "$TOKEN")"
expect "the client can open the shared link without signing in" \
  '.success and .data.quote.number == "Q-0001" and (.data.quote | has("shareToken") | not)' "$(api GET "/api/v1/public/quotes/$SHARE")"
expect "the client can accept it" '.success and .data.quote.status == "accepted"' \
  "$(api POST "/api/v1/public/quotes/$SHARE/accept" '{"name":"Smoke Lead"}')"
expect "accepting books the lead and creates the event" '.success and .data.stageKind == "won" and .data.eventId != null' \
  "$(api GET "/api/v1/workspaces/$WS_ID/leads/$LEAD_ID" "" "$TOKEN")"
EVENT_ID="$(api GET "/api/v1/workspaces/$WS_ID/leads/$LEAD_ID" "" "$TOKEN" | jq -r '.data.eventId')"
DRAFT="$(api GET "/api/v1/workspaces/$WS_ID/bill-draft?eventId=$EVENT_ID" "" "$TOKEN")"
expect "a bill starts from the accepted quote" '.success and (.data.items | length) == 1 and .data.billTo.name == "Smoke Lead"' "$DRAFT"
BILL="$(api POST "/api/v1/workspaces/$WS_ID/bills" \
  "$(echo "$DRAFT" | jq -c '.data | {eventId, quoteId, billTo, issueDate, dueDate, items, discount}')" "$TOKEN")"
expect "the bill is numbered for the financial year and rounded to the rupee" \
  '.success and (.data.number | test("^INV/[0-9]{2}-[0-9]{2}/0001$")) and .data.total == 25000 and .data.due == 25000' "$BILL"
BILL_ID="$(echo "$BILL" | jq -r '.data.id')"
expect "money received is recorded against the bill" '.success and .data.number == "R-0001"' \
  "$(api POST "/api/v1/workspaces/$WS_ID/payments" "{\"billId\":\"$BILL_ID\",\"amount\":25000,\"paidOn\":\"2026-09-25\",\"method\":\"upi\"}" "$TOKEN")"
expect "a fully paid bill leaves nothing to collect" '.success and .data.toCollect == 0' \
  "$(api GET "/api/v1/workspaces/$WS_ID/money" "" "$TOKEN")"
# A tiny JPEG: the upload folder must be writable and files must come back byte for byte.
PHOTO_B64="$(printf '\xff\xd8\xff\xe0smoke-bill-photo' | base64 | tr -d '\n')"
PHOTO="$(api POST "/api/v1/workspaces/$WS_ID/files" "{\"contentType\":\"image/jpeg\",\"data\":\"$PHOTO_B64\"}" "$TOKEN")"
expect "a bill photo can be uploaded" '.success and .data.contentType == "image/jpeg"' "$PHOTO"
PHOTO_PATH="$(echo "$PHOTO" | jq -r '.data.path')"
[ "$(curl -fsS "$BASE$PHOTO_PATH" | base64 | tr -d '\n')" = "$PHOTO_B64" ] || die "the uploaded photo did not come back intact"
echo "  ok: the photo is served back through its signed link"
EXPENSE="$(api POST "/api/v1/workspaces/$WS_ID/expenses" \
  "{\"eventId\":\"$EVENT_ID\",\"category\":\"materials\",\"amount\":5000,\"spentOn\":\"2026-09-25\",\"receiptFileId\":\"$(echo "$PHOTO" | jq -r '.data.id')\"}" "$TOKEN")"
expect "an owner's expense counts straight away" '.success and .data.status == "approved" and .data.receipt != null' "$EXPENSE"
expect "profit on the event is revenue before GST minus expenses" '.success and .data.spent == 5000 and .data.profit == 20000' \
  "$(api GET "/api/v1/workspaces/$WS_ID/events/$EVENT_ID/money" "" "$TOKEN")"
MONTH="$(echo "$BILL" | jq -r '.data.issueDate[0:7]')"
expect "the monthly report adds up the bill and the payment" '.success and .data.sales.bills == 1 and .data.sales.taxable == 25000 and .data.cash.received == 25000' \
  "$(api GET "/api/v1/workspaces/$WS_ID/reports/month?month=$MONTH" "" "$TOKEN")"
expect "the bills spreadsheet for the CA is ready" '.success and .data.rows == 1 and (.data.content | startswith("\ufeffBill date,Bill number"))' \
  "$(api GET "/api/v1/workspaces/$WS_ID/exports?kind=bills&month=$MONTH" "" "$TOKEN")"
expect "the trade's checklist is installed" '.success and (.data | length) >= 3' \
  "$(api GET "/api/v1/workspaces/$WS_ID/checklist" "" "$TOKEN")"
expect "the checklist becomes tasks on the event" '.success and (.data | length) >= 3 and (.data | all(.fromChecklist))' \
  "$(api POST "/api/v1/workspaces/$WS_ID/events/$EVENT_ID/checklist" "" "$TOKEN")"
TASK="$(api POST "/api/v1/workspaces/$WS_ID/tasks" '{"title":"Smoke task","priority":"high"}' "$TOKEN")"
expect "a task can be added" '.success and .data.done == false' "$TASK"
expect "and ticked off" '.success and .data.done == true' \
  "$(api POST "/api/v1/workspaces/$WS_ID/tasks/$(echo "$TASK" | jq -r '.data.id')/done" '{"done":true}' "$TOKEN")"
expect "My Day answers" '.success and (.data.today | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))' \
  "$(api GET "/api/v1/workspaces/$WS_ID/my-day" "" "$TOKEN")"
expect "the month's scores are worked out" ".success and (.data.people | length) >= 1 and .data.business != null" \
  "$(api GET "/api/v1/workspaces/$WS_ID/scores?month=$MONTH" "" "$TOKEN")"
expect "the activity log tells who did what" '.success and (.data.items | map(.action) | index("payment.recorded")) != null' \
  "$(api GET "/api/v1/workspaces/$WS_ID/activity" "" "$TOKEN")"
expect "the daily summary adds up the day" '.success and (.data.tomorrow.date | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}$"))' \
  "$(api GET "/api/v1/workspaces/$WS_ID/daily-summary" "" "$TOKEN")"
expect "days off can be marked" '.success and .data.startDate == "2026-12-24" and .data.endDate == "2026-12-26"' \
  "$(api POST "/api/v1/workspaces/$WS_ID/time-off" '{"startDate":"2026-12-24","endDate":"2026-12-26","note":"Smoke holiday"}' "$TOKEN")"
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
