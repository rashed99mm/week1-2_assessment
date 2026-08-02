# tickets-backend (Laravel 13)

REST API for a ticket-selling mini-module: events, ticket types, orders and
payments. Payments are delegated to the separate FastAPI `payment-gateway`.

- Base URL: `http://127.0.0.1:8000`
- Stack: PHP 8.4, Laravel 13 (skeleton v13.8.0, framework v13.23.0), SQLite
- Tests: PHPUnit (`php artisan test`) — 41 tests / 106 assertions

---

## Folder structure

```
tickets-backend/
├── app/
│   ├── Exceptions/
│   │   └── PaymentFailedException.php      # raised when gateway declines/unreachable
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── EventController.php
│   │   │   ├── TicketTypeController.php
│   │   │   └── OrderController.php
│   │   ├── Requests/
│   │   │   ├── StoreEventRequest.php
│   │   │   ├── UpdateEventRequest.php
│   │   │   ├── StoreTicketTypeRequest.php
│   │   │   ├── UpdateTicketTypeRequest.php
│   │   │   ├── StoreOrderRequest.php
│   │   │   └── PayOrderRequest.php
│   │   └── Responses/
│   │       └── ApiResponse.php             # Response<T> envelope
│   ├── Models/          # Event, TicketType, Order, Payment
│   ├── Repositories/
│   │   ├── Contracts/   # *RepositoryInterface (Event, TicketType, Order)
│   │   └── Eloquent/    # implementations
│   ├── Services/        # EventService, TicketTypeService, OrderService, PaymentService
│   └── Providers/
│       └── AppServiceProvider.php          # interface -> implementation bindings
├── bootstrap/app.php                        # registers the /api routes
├── config/services.php                      # payment_gateway.url
├── database/
│   ├── migrations/      # events, ticket_types, orders, payments
│   └── seeders/         # DatabaseSeeder
├── routes/api.php
└── tests/
    ├── Unit/            # OrderService, PaymentService, EventService, TicketTypeService
    └── Feature/         # EventApi, TicketTypeApi, OrderApi
```

## Layered architecture

```
Controller  →  FormRequest (validation)  →  Service (business rules)  →  Repository (interface)  →  Eloquent  →  SQLite
```

- **Controllers** are thin: validate, delegate, wrap responses in `ApiResponse`.
- **Services** hold business logic (price computation, stock checks, gateway calls).
- **Repositories** are behind interfaces, bound in `AppServiceProvider`:
  - `EventRepositoryInterface`  → `EloquentEventRepository`
  - `TicketTypeRepositoryInterface` → `EloquentTicketTypeRepository`
  - `OrderRepositoryInterface`  → `EloquentOrderRepository`

## Domain model

| Table | Key fields | Notes |
|---|---|---|
| `events` | title, venue, starts_at, ends_at, total_tickets, status | soft-deletes |
| `ticket_types` | event_id (FK), name, price, quantity | `price` is `decimal:2`; FK `restrictOnDelete` |
| `orders` | event_id, ticket_type_id, customer_name/email, quantity, unit_price, total_amount, status | `unit_price`/`total_amount` are `decimal:2` |
| `payments` | order_id, amount, currency, status, gateway_reference, paid_at | one per charge attempt |

Order statuses: `pending` → `paid` | `failed`. Payment statuses: `success` | `failed`.

> **Note:** a ticket type that already has orders **cannot be deleted** — the
> API returns `409 Conflict` (FK `restrictOnDelete`). Events soft-delete safely.

## API endpoints

All responses use the `ApiResponse<T>` envelope:
`{ success, message, status_code, data, errors }`.

### Events — `Route::apiResource('events', ...)`
| Method | URI | Description |
|---|---|---|
| GET | `/api/events` | List (paginated) |
| POST | `/api/events` | Create — `title`, `venue`, `starts_at` required |
| GET | `/api/events/{id}` | Show one |
| PUT | `/api/events/{id}` | Update (partial) |
| DELETE | `/api/events/{id}` | Soft delete |

### Ticket types — `Route::apiResource('ticket-types', ...)`
| Method | URI | Description |
|---|---|---|
| GET | `/api/ticket-types` | List, optional `?event_id=` filter |
| POST | `/api/ticket-types` | Create — `event_id` must exist |
| GET | `/api/ticket-types/{id}` | Show one |
| PUT | `/api/ticket-types/{id}` | Update (partial, `UpdateTicketTypeRequest`) |
| DELETE | `/api/ticket-types/{id}` | Delete — `409` if it has orders |

### Orders — `Route::apiResource('orders', ...)->only(['index','show','store'])`
| Method | URI | Description |
|---|---|---|
| GET | `/api/orders` | List with relations |
| POST | `/api/orders` | Create — validates stock, computes `unit_price` + `total_amount` |
| GET | `/api/orders/{id}` | Show one |
| POST | `/api/orders/{id}/pay` | Charge via the gateway |

## Paying an order (the integration)

1. `POST /api/orders/{id}/pay` with `{ "card_token": "..." }`.
2. `OrderService::pay()` rejects orders that are already `paid`.
3. `PaymentService::charge()` POSTs to
   `{PAYMENT_GATEWAY_URL}/api/v1/payments/charge` (default `http://127.0.0.1:8001`).
4. Gateway response:
   - `success` → payment persisted, order → `paid`, return `200`.
   - declined → payment persisted, order → `failed`, throw `PaymentFailedException`
     → controller returns `400`.
   - gateway down / HTTP error → `PaymentFailedException` ("unreachable").

## Setup & run

```powershell
cd tickets-backend
composer install
php artisan migrate:fresh --seed        # SQLite database/database.sqlite
php artisan serve --host=127.0.0.1 --port=8000
```

Environment (`.env`):
```
DB_CONNECTION=sqlite
PAYMENT_GATEWAY_URL=http://127.0.0.1:8001
```

## Testing

```powershell
php artisan test
```

- `tests/Unit/*` — service logic with mocked repositories / `Http::fake()`.
- `tests/Feature/*` — full HTTP flows against an in-memory SQLite database:
  CRUD, `422` validations, stock errors, pay approved/declined/already-paid, `404`/`409`.
