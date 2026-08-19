#!/usr/bin/env bash
#
# Deliberately not `set -e`. The suite exercises 4xx paths on purpose, and a
# curl returning a body with a non-2xx status must not abort the run.
set -uo pipefail
#
# =====================================================================
#  Test Cases (curl) — week1-2_assessment  [bash / Linux / CI]
# =====================================================================
#  Backend   : Laravel tickets API          -> http://127.0.0.1:8000
#  Gateway   : FastAPI payment gateway      -> http://127.0.0.1:8001
#
#  Requirements:
#    - Laravel server running:   php artisan serve --host=127.0.0.1 --port=8000
#    - Gateway server running:   python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
#    - curl + bash + grep (GNU)
#
#  Run the whole suite:
#    bash test-cases.sh
#
#  The suite is self-contained: it registers a fresh user, creates its own
#  event / ticket type / orders / payments and uses the returned ids, so it
#  runs against any database state.
#
#  Auth: all Laravel resource routes require a JWT. The suite registers a
#  user, captures the token and sends it automatically on every call.
#  Login is rate limited (throttle:5,1) - wait a minute before re-running.
#
#  Mock gateway rule:
#    approved  -> amount <= 1000 AND card_token starts with "4242"
#    declined  -> anything else
# =====================================================================

# Targets the versioned API. Override to point at a deployed environment:
#   API_BASE=http://localhost/api/v1 ./test-cases.sh
API="${API_BASE:-http://127.0.0.1:8000/api/v1}"

# The gateway is not routed through nginx in a deployment — it is reachable
# only from the API container — so section 5 is skipped unless GATEWAY_BASE
# points somewhere it can be reached from.
GW="${GATEWAY_BASE:-http://127.0.0.1:8001/api/v1}"
TOKEN=""

say()  { printf "\n\033[1;36m### %s\033[0m\n" "$*"; }
hr()   { printf "\033[1;34m%s\033[0m\n" "--------------------------------------------------------------------"; }

# Every case label already states its expected status — "(expect 409)". Rather
# than editing forty call sites to repeat it, the value is read back out of the
# label, so the labels stay the single source of truth.
PASSED=0
FAILED=0
FAILURES=""

# Pull the trailing "HTTP 200" that curl -w appends to the body.
status_of() { printf '%s' "$1" | grep -oE 'HTTP [0-9]{3}' | tail -1 | grep -oE '[0-9]{3}'; }

# Read the first occurrence of a JSON scalar.
#
# Deliberately avoids `grep -oP`: PCRE mode is unavailable in several common
# environments (Git Bash reports "-P supports only unibyte and UTF-8 locales"),
# where it silently yields an empty token and every later case fails with 401
# for no visible reason.
json_str() { printf '%s' "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | sed "s/.*\"$2\":\"//; s/\"$//"; }
json_num() { printf '%s' "$1" | grep -oE "\"$2\":[[:space:]]*[0-9]+" | head -1 | grep -oE '[0-9]+'; }

# Run one case with no Authorization header.
#
# `VAR=value func` leaks the assignment into the calling shell for functions,
# unlike external commands, so `TOKEN="" run ...` would clear the token for the
# whole remainder of the suite.
no_auth() { local saved="$TOKEN"; TOKEN=""; "$@"; TOKEN="$saved"; }

# Run one case as a specific token, then restore. Same reasoning as no_auth.
with_token() { local saved="$TOKEN"; TOKEN="$1"; shift; "$@"; TOKEN="$saved"; }

check() {
  local label="$1" actual="$2" expected
  expected=$(printf '%s' "$label" | grep -oE 'expect [0-9]{3}' | grep -oE '[0-9]{3}' | head -1)

  # A label with no stated expectation is informational; nothing to assert.
  [ -z "$expected" ] && return 0

  if [ "$actual" = "$expected" ]; then
    PASSED=$((PASSED + 1))
    printf "\033[1;32m  PASS\033[0m (%s)\n" "$actual"
  else
    FAILED=$((FAILED + 1))
    FAILURES="${FAILURES}
  - ${label}
      expected ${expected}, got ${actual}"
    printf "\033[1;31m  FAIL\033[0m expected %s, got %s\n" "$expected" "$actual"
  fi
}

# Post JSON, print body + status, print "id=..." extraction.
# The Bearer token is attached automatically when TOKEN is set.
# Usage: post <label> <url> <json>
post() {
  # Callers capture this function's stdout to read the new record's id, so
  # everything human-readable goes to stderr. Printing the body on stdout puts
  # the whole JSON response into `event_id`, and every URL built from it is
  # then malformed — which surfaces as a 404 that looks like a missing record
  # rather than a broken variable.
  say "$1" >&2
  local hdr=()
  [ -n "$TOKEN" ] && hdr=(-H "Authorization: Bearer $TOKEN")
  local resp
  resp=$(curl -s -w "\nHTTP %{http_code}" -X POST "$2" "${hdr[@]}" -H "Content-Type: application/json" -d "$3")
  echo "$resp" >&2
  check "$1" "$(status_of "$resp")" >&2
  json_num "$resp" id
}

# Generic call without body (GET / DELETE / PUT with body via json()).
# Usage: run <label> <method> <url> [json]
run() {
  say "$1"
  local hdr=()
  [ -n "$TOKEN" ] && hdr=(-H "Authorization: Bearer $TOKEN")
  local resp
  if [ -n "${4:-}" ]; then
    resp=$(curl -s -w "\nHTTP %{http_code}" -X "$2" "$3" "${hdr[@]}" -H "Content-Type: application/json" -d "$4")
  else
    resp=$(curl -s -w "\nHTTP %{http_code}" -X "$2" "$3" "${hdr[@]}")
  fi
  echo "$resp"
  check "$1" "$(status_of "$resp")"
}

hr

# ---------------------------------------------------------------------
# 0. AUTH  (Laravel JWT)  - must run first; token used by every section
# ---------------------------------------------------------------------
stamp=$(date +%Y%m%d%H%M%S)
email="curl${stamp}@example.com"

resp=$(curl -s -X POST "$API/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Curl User\",\"email\":\"$email\",\"password\":\"Secret123\",\"password_confirmation\":\"Secret123\"}")
echo "$resp"
TOKEN=$(json_str "$resp" token)
echo ""
say "0.1 POST /api/auth/register -> create account (expect 201, token)"

run "0.2 POST /api/auth/register -> duplicate email (expect 422)" POST "$API/auth/register" \
  "{\"name\":\"Curl User\",\"email\":\"$email\",\"password\":\"Secret123\",\"password_confirmation\":\"Secret123\"}"
run "0.3 GET /api/auth/me -> with token (expect 200)" GET "$API/auth/me"
no_auth run "0.4 GET /api/auth/me -> no token (expect 401)" GET "$API/auth/me"
no_auth run "0.5 GET /api/events -> no token (expect 200, public browsing)" GET "$API/events"
no_auth run "0.6 POST /api/auth/login -> wrong password (expect 401)" POST "$API/auth/login" \
  "{\"email\":\"$email\",\"password\":\"WrongPass\"}"

resp=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$email\",\"password\":\"Secret123\"}")
echo "$resp"
TOKEN=$(json_str "$resp" token)
echo ""
say "0.7 POST /api/auth/login -> valid credentials (expect 200, token)"

resp=$(curl -s -X POST "$API/auth/refresh" -H "Authorization: Bearer $TOKEN")
echo "$resp"
TOKEN=$(json_str "$resp" token)
echo ""
say "0.8 POST /api/auth/refresh -> issue fresh token (expect 200)"

old_token="$TOKEN"
run "0.9 POST /api/auth/logout -> blacklist current token (expect 200)" POST "$API/auth/logout"
with_token "$old_token" run "0.10 GET /api/auth/me -> blacklisted token (expect 401)" GET "$API/auth/me"

resp=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\":\"$email\",\"password\":\"Secret123\"}")
echo "$resp"
TOKEN=$(json_str "$resp" token)
echo ""
say "0.11 POST /api/auth/login -> re-login after logout (expect 200)"

CUSTOMER_TOKEN="$TOKEN"

# The catalogue is administrator-only now, so the suite needs two identities:
# the fresh customer above for the buying flow, and the seeded administrator
# for creating and deleting events and ticket types.
admin_resp=$(curl -s -X POST "$API/auth/login" -H "Content-Type: application/json"   -d '{"email":"admin@example.com","password":"password"}')
ADMIN_TOKEN=$(json_str "$admin_resp" token)

if [ -z "$ADMIN_TOKEN" ]; then
  printf "[1;31mCannot sign in as admin@example.com. Run: php artisan migrate --seed[0m
"
  exit 1
fi

# The privilege boundary itself is worth a case: a customer must not be able to
# edit the catalogue.
run "0.11b POST /api/events -> as a customer (expect 403, admin only)" POST "$API/events"   '{"title":"Should Not Exist","starts_at":"2026-10-01T18:00:00","total_tickets":10,"status":"draft"}'

# Everything from here to section 3 is editorial work.
TOKEN="$ADMIN_TOKEN"

# ---------------------------------------------------------------------
# SETUP : create a fresh event + ticket type (used by every section)
# ---------------------------------------------------------------------
event_id=$(post "0.12 POST /api/events -> create fresh event (expect 201)" "$API/events" \
  "{\"title\":\"Curl Test $stamp\",\"description\":\"created by curl suite\",\"venue\":\"Test Hall\",\"starts_at\":\"2026-10-01T18:00:00\",\"total_tickets\":100,\"status\":\"published\"}")

ticket_id=$(post "0.13 POST /api/ticket-types -> create fresh ticket type (expect 201)" "$API/ticket-types" \
  "{\"event_id\":$event_id,\"name\":\"General Admission\",\"price\":50.00,\"quantity\":300}")

printf "\n  -> using event_id=%s ticket_type_id=%s\n" "$event_id" "$ticket_id"

# ---------------------------------------------------------------------
# 1. EVENTS  (Laravel)
# ---------------------------------------------------------------------
run "1.1 GET /api/events -> list events (paginated envelope)" GET "$API/events"
run "1.2 POST /api/events -> validation error, missing title (expect 422)" POST "$API/events" \
  '{"venue":"No Title Hall","starts_at":"2026-09-01T18:00:00"}'
run "1.3 GET /api/events/$event_id -> show event (expect 200)" GET "$API/events/$event_id"
run "1.4 GET /api/events/999999 -> show missing event (expect 404)" GET "$API/events/999999"
run "1.5 PUT /api/events/$event_id -> update event title (expect 200)" PUT "$API/events/$event_id" \
  '{"title":"Curl Test Renamed"}'

# ---------------------------------------------------------------------
# 2. TICKET TYPES  (Laravel)
# ---------------------------------------------------------------------
run "2.1 POST /api/ticket-types -> invalid event_id (expect 422)" POST "$API/ticket-types" \
  '{"event_id":999999,"name":"VIP","price":150.00,"quantity":20}'
run "2.2 GET /api/ticket-types?event_id=$event_id -> filter by event (expect 200)" GET "$API/ticket-types?event_id=$event_id"
run "2.3 GET /api/ticket-types/$ticket_id -> show ticket type (expect 200)" GET "$API/ticket-types/$ticket_id"
run "2.4 PUT /api/ticket-types/$ticket_id -> partial update price (expect 200)" PUT "$API/ticket-types/$ticket_id" \
  '{"price":55.00}'

# ---------------------------------------------------------------------
# 3. ORDERS  (Laravel)  - back to the customer: buying is not an admin action
# ---------------------------------------------------------------------
TOKEN="$CUSTOMER_TOKEN"

order1_id=$(post "3.1 POST /api/orders -> create order #1 (expect 201, pending)" "$API/orders" \
  "{\"ticket_type_id\":$ticket_id,\"customer_name\":\"Jane Doe\",\"customer_email\":\"jane@example.com\",\"quantity\":2}")
order2_id=$(post "3.2 POST /api/orders -> create order #2 for decline flow (expect 201)" "$API/orders" \
  "{\"ticket_type_id\":$ticket_id,\"customer_name\":\"John Roe\",\"customer_email\":\"john@example.com\",\"quantity\":1}")

run "3.3 POST /api/orders -> quantity exceeds stock (expect 422)" POST "$API/orders" \
  "{\"ticket_type_id\":$ticket_id,\"customer_name\":\"Jane Doe\",\"customer_email\":\"jane@example.com\",\"quantity\":999}"
run "3.4 POST /api/orders -> missing customer email (expect 422)" POST "$API/orders" \
  "{\"ticket_type_id\":$ticket_id,\"customer_name\":\"Jane Doe\",\"quantity\":1}"
run "3.5 GET /api/orders -> list orders (expect 200)" GET "$API/orders"
run "3.6 GET /api/orders/$order1_id -> show order with relations (expect 200)" GET "$API/orders/$order1_id"

# ---------------------------------------------------------------------
# 4. PAYMENTS  (Laravel -> FastAPI gateway)
# ---------------------------------------------------------------------
run "4.1 POST /api/orders/$order1_id/pay -> approved card 4242... (expect 200, success)" POST "$API/orders/$order1_id/pay" \
  '{"card_token":"4242424242424242"}'
run "4.2 POST /api/orders/$order2_id/pay -> declined card (expect 400, failed)" POST "$API/orders/$order2_id/pay" \
  '{"card_token":"4000000000000002"}'
run "4.3 POST /api/orders/$order1_id/pay -> paying an already-paid order (expect 422)" POST "$API/orders/$order1_id/pay" \
  '{"card_token":"4242424242424242"}'
run "4.4 POST /api/orders/999999/pay -> missing order (expect 404)" POST "$API/orders/999999/pay" \
  '{"card_token":"4242424242424242"}'

# ---------------------------------------------------------------------
# 5. GATEWAY DIRECT  (FastAPI)
# ---------------------------------------------------------------------
run "5.1 GET /health -> gateway health (expect 200 ok)" GET "http://127.0.0.1:8001/health"

pay_id=$(post "5.2 POST /api/v1/payments/charge -> approved (expect 200, success true)" "$GW/payments/charge" \
  '{"order_id":1,"amount":100.00,"currency":"USD","card_token":"4242424242424242"}')
pay_declined_id=$(post "5.3 POST /api/v1/payments/charge -> declined (expect 200, success false)" "$GW/payments/charge" \
  '{"order_id":1,"amount":100.00,"currency":"USD","card_token":"4000000000000002"}')

run "5.4 POST /api/v1/payments/charge -> over limit amount (expect declined)" POST "$GW/payments/charge" \
  '{"order_id":1,"amount":2000.00,"currency":"USD","card_token":"4242424242424242"}'
run "5.5 POST /api/v1/payments/charge -> invalid payload, negative amount (expect 422)" POST "$GW/payments/charge" \
  '{"order_id":1,"amount":-5,"currency":"USD","card_token":"4242"}'
run "5.6 GET /api/v1/payments/$pay_id -> fetch payment (expect 200)" GET "$GW/payments/$pay_id"
run "5.7 GET /api/v1/payments/999999 -> fetch missing payment (expect 404)" GET "$GW/payments/999999"
run "5.8 POST /api/v1/payments/$pay_id/refund -> refund approved payment (expect 200, refunded)" POST "$GW/payments/$pay_id/refund" \
  '{"reason":"customer changed mind"}'
run "5.9 POST /api/v1/payments/$pay_declined_id/refund -> refund a failed payment (expect 400)" POST "$GW/payments/$pay_declined_id/refund" \
  '{}'

# ---------------------------------------------------------------------
# 6. REFERENTIAL INTEGRITY  (Laravel)  - editorial, so back to the admin
# ---------------------------------------------------------------------
TOKEN="$ADMIN_TOKEN"

run "6.1 DELETE /api/ticket-types/$ticket_id -> ticket type has orders (expect 409)" DELETE "$API/ticket-types/$ticket_id"
run "6.2 DELETE /api/events/$event_id -> soft delete event (expect 200)" DELETE "$API/events/$event_id"

hr
printf "\033[1mSummary:\033[0m \033[1;32m%s passed\033[0m, \033[1;31m%s failed\033[0m\n" "$PASSED" "$FAILED"

if [ "$FAILED" -gt 0 ]; then
  printf "\033[1;31mFailures:\033[0m%s\n" "$FAILURES"
  exit 1
fi

printf "\033[1;32mAll curl test cases passed.\033[0m\n"
