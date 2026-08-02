# week1-2_assessment — Project Documentation

Two self-contained services built for the tickets mini-module assessment:

| Project | Path | Stack | Port | Docs |
|---|---|---|---|---|
| `tickets-backend` | `tickets-backend/` | Laravel 13 (PHP 8.4) | `:8000` | [tickets-backend.md](tickets-backend.md) |
| `payment-gateway` | `payment-gateway/` | FastAPI (Python 3.10) | `:8001` | [payment-gateway.md](payment-gateway.md) |

---

## How the two projects work together

```
                 ┌──────────────────────────────────────────┐
                 │            tickets-backend (Laravel)      │
                 │                                          │
 Client ───────► │  Controllers  ──► Services  ──► Repositories  ──► SQLite
 (curl/HTTP)     │                                          │       (events,
                 │        └── PaymentService ── HTTP POST ──┤  ticket_types,
                 └───────────────────────┬──────────────────┘   orders, payments)
                                         │  /api/v1/payments/charge
                                         ▼
                 ┌──────────────────────────────────────────┐
                 │            payment-gateway (FastAPI)      │
                 │  charge / refund / get  ──► PaymentService ──► SQLite
                 │                                           │       (payments)
                 └──────────────────────────────────────────┘
```

1. The client talks **only** to `tickets-backend` on `http://127.0.0.1:8000`.
2. When an order is paid, Laravel's `PaymentService` calls the FastAPI gateway
   at `http://127.0.0.1:8001/api/v1/payments/charge` (URL configured via
   `PAYMENT_GATEWAY_URL`).
3. The gateway applies its **mock approval rule** and returns a payment record.
4. Laravel persists the payment and flips the order to `paid` (success) or
   `failed` (declined).
5. The **gateway can also be tested directly** on `:8001` (Swagger UI at
   [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)).

### Mock approval rule (identical in both codebases)
- **Approved** when `amount <= 1000.00` **and** `card_token` starts with `"4242"`
- **Declined** otherwise

### Shared response envelope (`Response<T>` / `ApiResponse<T>`)
Every endpoint from both services returns the same shape:

```json
{
  "success": true,
  "message": "Events fetched successfully.",
  "status_code": 200,
  "data": { "...": "..." },
  "errors": null
}
```

---

## Quick start

```powershell
# 1. Backend (from tickets-backend/)
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000

# 2. Gateway (from payment-gateway/, inside the .venv)
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

### Run the test suites
```powershell
# PHP (tickets-backend) — unit + feature, SQLite in-memory
php artisan test

# Python (payment-gateway) — schema / service / API tests
.venv\Scripts\python -m pytest tests -v
```

### Run the curl test cases
```powershell
# Windows / PowerShell
powershell -ExecutionPolicy Bypass -File test-cases.ps1

# Linux / CI (bash + curl + GNU grep)
bash test-cases.sh
```

Both suites are **self-contained**: they create their own event, ticket type,
orders and payments and use the returned ids, so they run against any database
state. See `test-cases.ps1` / `test-cases.sh` in the project root.

---

## Project details

- [tickets-backend.md](tickets-backend.md) — architecture, models, endpoints, setup
- [payment-gateway.md](payment-gateway.md) — architecture, models, endpoints, setup
