#!/usr/bin/env bash
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
#  The suite is self-contained: it creates its own event / ticket type /
#  orders / payments and uses the returned ids, so it runs against any
#  database state.
#
#  Mock gateway rule:
#    approved  -> amount <= 1000 AND card_token starts with "4242"
#    declined  -> anything else
# =====================================================================

API="http://127.0.0.1:8000/api"
GW="http://127.0.0.1:8001/api/v1"

say()  { printf "\n\033[1;36m### %s\033[0m\n" "$*"; }
hr()   { printf "\033[1;34m%s\033[0m\n" "--------------------------------------------------------------------"; }

# Post JSON, print body + status, print "id=..." extraction.
# Usage: post <label> <url> <json>
post() {
  say "$1"
  resp=$(curl -s -w "\nHTTP %{http_code}" -X POST "$2" -H "Content-Type: application/json" -d "$3")
  echo "$resp"
  echo "$resp" | grep -oP '"id":\s*\K\d+' | head -1
}

# Generic call without body (GET / DELETE / PUT with body via json()).
# Usage: run <label> <method> <url> [json]
run() {
  say "$1"
  if [ -n "$4" ]; then
    curl -s -w "\nHTTP %{http_code}\n" -X "$2" "$3" -H "Content-Type: application/json" -d "$4"
  else
    curl -s -w "\nHTTP %{http_code}\n" -X "$2" "$3"
  fi
}

hr

# ---------------------------------------------------------------------
# SETUP : create a fresh event + ticket type (used by every section)
# ---------------------------------------------------------------------
stamp=$(date +%Y%m%d%H%M%S)

event_id=$(post "0.1 POST /api/events -> create fresh event (expect 201)" "$API/events" \
  "{\"title\":\"Curl Test $stamp\",\"description\":\"created by curl suite\",\"venue\":\"Test Hall\",\"starts_at\":\"2026-10-01T18:00:00\",\"total_tickets\":100,\"status\":\"published\"}")

ticket_id=$(post "0.2 POST /api/ticket-types -> create fresh ticket type (expect 201)" "$API/ticket-types" \
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
# 3. ORDERS  (Laravel)
# ---------------------------------------------------------------------
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
# 6. REFERENTIAL INTEGRITY  (Laravel)
# ---------------------------------------------------------------------
run "6.1 DELETE /api/ticket-types/$ticket_id -> ticket type has orders (expect 409)" DELETE "$API/ticket-types/$ticket_id"
run "6.2 DELETE /api/events/$event_id -> soft delete event (expect 200)" DELETE "$API/events/$event_id"

hr
printf "\033[1;32mAll curl test cases executed.\033[0m\n"
