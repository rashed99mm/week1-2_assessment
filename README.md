# Nupco Tickets — week1-2 Assessment

A two-service mini-module for selling event tickets: a **Laravel REST API**
(`tickets-backend`) that handles events, ticket types and orders, and a
separate **FastAPI mock payment gateway** (`payment-gateway`) that processes
charges and refunds.

```
                 ┌──────────────────────────────────────────┐
                 │          tickets-backend (Laravel 13)     │
                 │                                          │
 Client ───────► │  Controllers → Services → Repositories   │──► SQLite
 (curl/HTTP)     │  events / ticket-types / orders / payments│
                 │        └── PaymentService ── HTTP ────────┤
                 └─────────────────────────┬────────────────┘
                                           │  /api/v1/payments/charge
                                           ▼
                 ┌──────────────────────────────────────────┐
                 │         payment-gateway (FastAPI)         │
                 │   charge / get / refund ──► PaymentService │──► SQLite
                 └──────────────────────────────────────────┘
```

## Services

| Service | Path | Stack | Port |
|---|---|---|---|
| `tickets-backend` | `tickets-backend/` | Laravel 13, PHP 8.4, SQLite | `http://127.0.0.1:8000` |
| `payment-gateway` | `payment-gateway/` | FastAPI, SQLAlchemy 2.0, Pydantic 2.x | `http://127.0.0.1:8001` |

### Mock approval rule
- **Approved** when `amount <= 1000.00` **and** `card_token` starts with `"4242"`
- **Declined** otherwise

### Shared response envelope
Every endpoint returns the same shape:

```json
{
  "success": true,
  "message": "Events fetched successfully.",
  "status_code": 200,
  "data": {},
  "errors": null
}
```

## Quick start

### 1. tickets-backend (Laravel)

```powershell
cd tickets-backend
composer install
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000
```

`.env`: `DB_CONNECTION=sqlite`, `PAYMENT_GATEWAY_URL=http://127.0.0.1:8001`

### 2. payment-gateway (FastAPI)

```powershell
cd payment-gateway
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Interactive docs: http://127.0.0.1:8001/docs

## API overview

### tickets-backend — `/api`
| Method | URI | Description |
|---|---|---|
| GET/POST | `/events` | List / create |
| GET/PUT/DELETE | `/events/{id}` | Show / update / soft delete |
| GET/POST | `/ticket-types` | List (filter `?event_id=`) / create |
| GET/PUT/DELETE | `/ticket-types/{id}` | Show / update / delete (`409` if it has orders) |
| GET/POST | `/orders` | List / create (computes totals, checks stock) |
| GET | `/orders/{id}` | Show |
| POST | `/orders/{id}/pay` | Charge via the gateway |

### payment-gateway — `/api/v1`
| Method | URI | Description |
|---|---|---|
| POST | `/payments/charge` | Charge an order (approved / declined) |
| GET | `/payments/{id}` | Fetch a payment |
| POST | `/payments/{id}/refund` | Refund a successful payment |
| GET | `/health` | Health check |

## Testing

```powershell
# PHP — unit + feature (SQLite in-memory)
php artisan test          # 41 tests / 106 assertions

# Python — schema / service / API
.venv\Scripts\python -m pytest tests -v   # 23 tests
```

## Curl test suite

Self-contained suites that create their own data and print HTTP status for
every case (work against any database state):

```powershell
powershell -ExecutionPolicy Bypass -File test-cases.ps1   # Windows
bash test-cases.sh                                         # Linux / CI
```

## Docs

- [Project overview](docs/README.md)
- [tickets-backend](docs/tickets-backend.md)
- [payment-gateway](docs/payment-gateway.md)
- [Code equivalents: .NET vs PHP vs Python](docs/dotnet-equivalents.md)
