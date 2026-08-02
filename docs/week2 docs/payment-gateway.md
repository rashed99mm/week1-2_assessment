# payment-gateway (FastAPI)

Standalone mock payment gateway that powers `tickets-backend`. It exposes a
small REST API for charging, retrieving and refunding payments, and applies a
Stripe-like **test-card approval rule** so no real payment provider is needed.

- Base URL: `http://127.0.0.1:8001`
- Swagger UI: [http://127.0.0.1:8001/docs](http://127.0.0.1:8001/docs)
- ReDoc: [http://127.0.0.1:8001/redoc](http://127.0.0.1:8001/redoc)
- Health: [http://127.0.0.1:8001/health](http://127.0.0.1:8001/health)
- Stack: Python 3.10, FastAPI 0.141.1, SQLAlchemy 2.0.51, Pydantic 2.13.4, SQLite
- Tests: pytest 9.1.1 + httpx (TestClient) — 23 tests

---

## Folder structure

```
payment-gateway/
├── .venv/                          # virtual environment
├── requirements.txt                # runtime deps (fastapi, uvicorn, sqlalchemy, pydantic)
├── requirements-dev.txt            # pytest, httpx
├── app/
│   ├── main.py                     # app factory, CORS, /health, mounts router
│   ├── api/
│   │   └── routes/payments.py      # charge / get / refund endpoints
│   ├── core/config.py              # Pydantic settings (app name, DB url)
│   ├── db/
│   │   ├── base.py                 # Base metadata
│   │   └── session.py              # engine, SessionLocal, get_db dependency
│   ├── models/payment.py           # Payment ORM model
│   ├── schemas/
│   │   ├── payment.py              # ChargeRequest, RefundRequest, PaymentOut
│   │   └── response.py             # ApiResponse[T] envelope
│   └── services/payment_service.py # approval rule + charge/get/refund logic
└── tests/
    ├── conftest.py                 # in-memory SQLite + TestClient fixtures
    ├── test_schemas.py             # ChargeRequest validation
    ├── test_response.py            # ApiResponse envelope shape
    ├── test_payment_service.py     # charge/get/refund logic
    └── test_api.py                 # end-to-end endpoint tests
```

## Architecture

```
Request  →  Router (FastAPI)  →  Pydantic schema (validation)  →  PaymentService  →  ORM  →  SQLite
```

- **Pydantic schemas** validate every request and serialize every response.
- **`PaymentService`** is the single source of business logic.
- **`get_db`** dependency provides a request-scoped SQLAlchemy session.
- Tables are created automatically on startup (`Base.metadata.create_all`).

## Approval rule (the "mock")

```python
approved = amount <= 1000.0 and card_token.startswith("4242")
```

| Card token | Amount | Result |
|---|---|---|
| `4242...` (anything starting with 4242) | ≤ 1000.00 | `success` |
| `4242...` | > 1000.00 | `failed` |
| anything else | any | `failed` |

## Database model — `payments`

| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `order_id` | int | the ticket order being charged |
| `amount` | float | |
| `currency` | str(3) | defaults to `USD` |
| `status` | str | `success` \| `failed` \| `refunded` |
| `gateway_reference` | str | e.g. `TXN-1D33536E9B7E4184` (uuid hex) |
| `created_at` / `updated_at` | datetime | |

## API endpoints

All responses use the `ApiResponse<T>` envelope:
`{ success, message, status_code, data, errors }`.

### `POST /api/v1/payments/charge`
Body (`ChargeRequest`):
```json
{
  "order_id": 1,
  "amount": 100.00,
  "currency": "USD",
  "card_token": "4242424242424242"
}
```
- **200** `success: true` — payment approved.
- **200** `success: false`, `status_code: 400` — payment declined (still persisted).
- **422** — validation error (e.g. `amount <= 0`, short `card_token`, bad currency).

### `GET /api/v1/payments/{payment_id}`
- **200** — the stored payment.
- **404** — unknown id.

### `POST /api/v1/payments/{payment_id}/refund`
Body (`RefundRequest`): `{ "reason": "customer changed mind" }`
- **200** — payment status becomes `refunded`.
- **400** — payment missing **or** not in `success` state (raises `PaymentGatewayError`).

### `GET /health`
- **200** — `{ "status": "ok" }`

## Setup & run

```powershell
cd payment-gateway
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Configuration (`app/core/config.py`) is env-driven:
```
GATEWAY_DB_URL=sqlite:///./payment_gateway.sqlite3
```

## Testing

```powershell
.venv\Scripts\python -m pytest tests -v
```

- `tests/conftest.py` swaps in an in-memory SQLite database (`sqlite://`,
  `StaticPool`) with a `get_db` dependency override, so tests never touch disk.
- 23 tests cover schema validation, the response envelope, service logic and
  the full HTTP flow (approved, declined, over-limit, 404, refunds).
