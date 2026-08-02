# =====================================================================
#  Test Cases (curl) - week1-2_assessment  [Windows PowerShell]
# =====================================================================
#  Backend   : Laravel tickets API          -> http://127.0.0.1:8000
#  Gateway   : FastAPI payment gateway      -> http://127.0.0.1:8001
#
#  Requirements:
#    - Laravel server running:   php artisan serve --host=127.0.0.1 --port=8000
#    - Gateway server running:   python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
#
#  Run the whole suite:
#    powershell -ExecutionPolicy Bypass -File test-cases.ps1
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

$ErrorActionPreference = 'Continue'
$API = "http://127.0.0.1:8000/api"
$GW  = "http://127.0.0.1:8001/api/v1"

# JWT captured during the AUTH section and attached to every protected call.
$script:AuthToken = $null

function Say([string]$Label) {
    Write-Host ""
    Write-Host "### $Label" -ForegroundColor Cyan
}

# Runs curl.exe with a JSON body passed via a temp file (avoids PowerShell
# 5.1 native-argument quoting bugs). Prints the response body + status and
# returns { status, json }.
# The Bearer token (if captured) is attached automatically unless -SkipAuth.
function Invoke-Curl([string]$Label, [string]$Method, [string]$Url, $Payload = $null, [switch]$SkipAuth, $Headers = @{}) {
    Say $Label
    $args = @("-s", "-X", $Method, $Url)
    if ((-not $SkipAuth) -and $script:AuthToken) {
        $args += @("-H", "Authorization: Bearer $($script:AuthToken)")
    }
    foreach ($h in $Headers.GetEnumerator()) {
        $args += @("-H", "$($h.Key): $($h.Value)")
    }
    $file = $null
    if ($null -ne $Payload) {
        $file = Join-Path $env:TEMP ("curl_" + [guid]::NewGuid().ToString("N") + ".json")
        $json = if ($Payload -is [string]) { $Payload } else { $Payload | ConvertTo-Json -Compress }
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($file, $json, $utf8NoBom)
        $args += @("-H", "Content-Type: application/json", "--data-binary", "@$file")
    }
    try {
        $raw = (& curl.exe @args -w "`nHTTP %{http_code}`n") -join "`n"
    } finally {
        if ($file) { Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue }
    }
    $m = [regex]::Match($raw, "HTTP\s+(\d{3})\s*$")
    $status = if ($m.Success) { $m.Groups[1].Value } else { "?" }
    $body = if ($m.Success) { $raw.Substring(0, $m.Index).TrimEnd() } else { $raw.TrimEnd() }
    Write-Host $body
    Write-Host "HTTP $status"
    $json = $null
    try { $json = $body | ConvertFrom-Json } catch { }
    return [pscustomobject]@{ status = [int]$status; json = $json }
}

Write-Host "--------------------------------------------------------------------" -ForegroundColor Blue

# ---------------------------------------------------------------------
# 0. AUTH  (Laravel JWT)  - must run first; token used by every section
# ---------------------------------------------------------------------
$stamp = Get-Date -Format "yyyyMMddHHmmss"
$email = "curl$stamp@example.com"

$rg = Invoke-Curl "0.1 POST /api/auth/register -> create account (expect 201, token)" "POST" "$API/auth/register" -SkipAuth @{
    name                  = "Curl User"
    email                 = $email
    password              = "Secret123"
    password_confirmation = "Secret123"
}
$script:AuthToken = $rg.json.data.token

Invoke-Curl "0.2 POST /api/auth/register -> duplicate email (expect 422)" "POST" "$API/auth/register" -SkipAuth @{
    name                  = "Curl User"
    email                 = $email
    password              = "Secret123"
    password_confirmation = "Secret123"
} | Out-Null

Invoke-Curl "0.3 GET /api/auth/me -> with token (expect 200)" "GET" "$API/auth/me" | Out-Null

Invoke-Curl "0.4 GET /api/auth/me -> no token (expect 401)" "GET" "$API/auth/me" -SkipAuth | Out-Null

Invoke-Curl "0.5 GET /api/events -> no token (expect 401, protected route)" "GET" "$API/events" -SkipAuth | Out-Null

Invoke-Curl "0.6 POST /api/auth/login -> wrong password (expect 401)" "POST" "$API/auth/login" -SkipAuth @{
    email    = $email
    password = "WrongPass"
} | Out-Null

$lg = Invoke-Curl "0.7 POST /api/auth/login -> valid credentials (expect 200, token)" "POST" "$API/auth/login" -SkipAuth @{
    email    = $email
    password = "Secret123"
}
$script:AuthToken = $lg.json.data.token

$rf = Invoke-Curl "0.8 POST /api/auth/refresh -> issue fresh token (expect 200)" "POST" "$API/auth/refresh"
$script:AuthToken = $rf.json.data.token

$oldToken = $script:AuthToken
Invoke-Curl "0.9 POST /api/auth/logout -> blacklist current token (expect 200)" "POST" "$API/auth/logout"
$script:AuthToken = $null

Invoke-Curl "0.10 GET /api/auth/me -> blacklisted token (expect 401)" "GET" "$API/auth/me" -Headers @{ Authorization = "Bearer $oldToken" } | Out-Null

$lg2 = Invoke-Curl "0.11 POST /api/auth/login -> re-login after logout (expect 200)" "POST" "$API/auth/login" -SkipAuth @{
    email    = $email
    password = "Secret123"
}
$script:AuthToken = $lg2.json.data.token

Write-Host "  -> authenticated as $email with token" -ForegroundColor DarkGray

# ---------------------------------------------------------------------
# SETUP : create a fresh event + ticket type (used by every section)
# ---------------------------------------------------------------------
$ev = Invoke-Curl "0.12 POST /api/events -> create fresh event (expect 201)" "POST" "$API/events" @{
    title       = "Curl Test $stamp"
    description = "created by curl suite"
    venue       = "Test Hall"
    starts_at   = "2026-10-01T18:00:00"
    total_tickets = 100
    status      = "published"
}
$eventId = $ev.json.data.id

$tt = Invoke-Curl "0.13 POST /api/ticket-types -> create fresh ticket type (expect 201)" "POST" "$API/ticket-types" @{
    event_id = $eventId
    name     = "General Admission"
    price    = 50.00
    quantity = 300
}
$ticketId = $tt.json.data.id

Write-Host "  -> using event_id=$eventId ticket_type_id=$ticketId" -ForegroundColor DarkGray

# ---------------------------------------------------------------------
# 1. EVENTS  (Laravel)
# ---------------------------------------------------------------------
Invoke-Curl "1.1 GET /api/events -> list events (paginated envelope)" "GET" "$API/events" | Out-Null
Invoke-Curl "1.2 POST /api/events -> validation error, missing title (expect 422)" "POST" "$API/events" @{ venue = "No Title Hall"; starts_at = "2026-09-01T18:00:00" } | Out-Null
Invoke-Curl "1.3 GET /api/events/$eventId -> show event (expect 200)" "GET" "$API/events/$eventId" | Out-Null
Invoke-Curl "1.4 GET /api/events/999999 -> show missing event (expect 404)" "GET" "$API/events/999999" | Out-Null
Invoke-Curl "1.5 PUT /api/events/$eventId -> update event title (expect 200)" "PUT" "$API/events/$eventId" @{ title = "Curl Test Renamed" } | Out-Null

# ---------------------------------------------------------------------
# 2. TICKET TYPES  (Laravel)
# ---------------------------------------------------------------------
Invoke-Curl "2.1 POST /api/ticket-types -> invalid event_id (expect 422)" "POST" "$API/ticket-types" @{ event_id = 999999; name = "VIP"; price = 150.00; quantity = 20 } | Out-Null
Invoke-Curl "2.2 GET /api/ticket-types?event_id=$eventId -> filter by event (expect 200)" "GET" "$API/ticket-types?event_id=$eventId" | Out-Null
Invoke-Curl "2.3 GET /api/ticket-types/$ticketId -> show ticket type (expect 200)" "GET" "$API/ticket-types/$ticketId" | Out-Null
Invoke-Curl "2.4 PUT /api/ticket-types/$ticketId -> partial update price (expect 200)" "PUT" "$API/ticket-types/$ticketId" @{ price = 55.00 } | Out-Null

# ---------------------------------------------------------------------
# 3. ORDERS  (Laravel)
# ---------------------------------------------------------------------
$o1 = Invoke-Curl "3.1 POST /api/orders -> create order #1 (expect 201, pending)" "POST" "$API/orders" @{
    ticket_type_id = $ticketId
    customer_name  = "Jane Doe"
    customer_email = "jane@example.com"
    quantity       = 2
}
$order1Id = $o1.json.data.id

$o2 = Invoke-Curl "3.2 POST /api/orders -> create order #2 for decline flow (expect 201)" "POST" "$API/orders" @{
    ticket_type_id = $ticketId
    customer_name  = "John Roe"
    customer_email = "john@example.com"
    quantity       = 1
}
$order2Id = $o2.json.data.id

Invoke-Curl "3.3 POST /api/orders -> quantity exceeds stock (expect 422)" "POST" "$API/orders" @{ ticket_type_id = $ticketId; customer_name = "Jane Doe"; customer_email = "jane@example.com"; quantity = 999 } | Out-Null
Invoke-Curl "3.4 POST /api/orders -> missing customer email (expect 422)" "POST" "$API/orders" @{ ticket_type_id = $ticketId; customer_name = "Jane Doe"; quantity = 1 } | Out-Null
Invoke-Curl "3.5 GET /api/orders -> list orders (expect 200)" "GET" "$API/orders" | Out-Null
Invoke-Curl "3.6 GET /api/orders/$order1Id -> show order with relations (expect 200)" "GET" "$API/orders/$order1Id" | Out-Null

# ---------------------------------------------------------------------
# 4. PAYMENTS  (Laravel -> FastAPI gateway)
# ---------------------------------------------------------------------
Invoke-Curl "4.1 POST /api/orders/$order1Id/pay -> approved card 4242... (expect 200, success)" "POST" "$API/orders/$order1Id/pay" @{ card_token = "4242424242424242" } | Out-Null
Invoke-Curl "4.2 POST /api/orders/$order2Id/pay -> declined card (expect 400, failed)" "POST" "$API/orders/$order2Id/pay" @{ card_token = "4000000000000002" } | Out-Null
Invoke-Curl "4.3 POST /api/orders/$order1Id/pay -> paying an already-paid order (expect 422)" "POST" "$API/orders/$order1Id/pay" @{ card_token = "4242424242424242" } | Out-Null
Invoke-Curl "4.4 POST /api/orders/999999/pay -> missing order (expect 404)" "POST" "$API/orders/999999/pay" @{ card_token = "4242424242424242" } | Out-Null

# ---------------------------------------------------------------------
# 5. GATEWAY DIRECT  (FastAPI)
# ---------------------------------------------------------------------
Invoke-Curl "5.1 GET /health -> gateway health (expect 200 ok)" "GET" "http://127.0.0.1:8001/health" | Out-Null

$pa = Invoke-Curl "5.2 POST /api/v1/payments/charge -> approved (expect 200, success true)" "POST" "$GW/payments/charge" @{ order_id = 1; amount = 100.00; currency = "USD"; card_token = "4242424242424242" }
$payId = $pa.json.data.id

$pd = Invoke-Curl "5.3 POST /api/v1/payments/charge -> declined (expect 200, success false)" "POST" "$GW/payments/charge" @{ order_id = 1; amount = 100.00; currency = "USD"; card_token = "4000000000000002" }
$payDeclinedId = $pd.json.data.id

Invoke-Curl "5.4 POST /api/v1/payments/charge -> over limit amount (expect declined)" "POST" "$GW/payments/charge" @{ order_id = 1; amount = 2000.00; currency = "USD"; card_token = "4242424242424242" } | Out-Null
Invoke-Curl "5.5 POST /api/v1/payments/charge -> invalid payload, negative amount (expect 422)" "POST" "$GW/payments/charge" @{ order_id = 1; amount = -5; currency = "USD"; card_token = "4242" } | Out-Null
Invoke-Curl "5.6 GET /api/v1/payments/$payId -> fetch payment (expect 200)" "GET" "$GW/payments/$payId" | Out-Null
Invoke-Curl "5.7 GET /api/v1/payments/999999 -> fetch missing payment (expect 404)" "GET" "$GW/payments/999999" | Out-Null
Invoke-Curl "5.8 POST /api/v1/payments/$payId/refund -> refund approved payment (expect 200, refunded)" "POST" "$GW/payments/$payId/refund" @{ reason = "customer changed mind" } | Out-Null
Invoke-Curl "5.9 POST /api/v1/payments/$payDeclinedId/refund -> refund a failed payment (expect 400)" "POST" "$GW/payments/$payDeclinedId/refund" @{} | Out-Null

# ---------------------------------------------------------------------
# 6. REFERENTIAL INTEGRITY  (Laravel)
# ---------------------------------------------------------------------
Invoke-Curl "6.1 DELETE /api/ticket-types/$ticketId -> ticket type has orders (expect 409)" "DELETE" "$API/ticket-types/$ticketId" | Out-Null
Invoke-Curl "6.2 DELETE /api/events/$eventId -> soft delete event (expect 200)" "DELETE" "$API/events/$eventId" | Out-Null

Write-Host "--------------------------------------------------------------------" -ForegroundColor Blue
Write-Host "All curl test cases executed." -ForegroundColor Green
