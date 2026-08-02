# tickets-backend (Laravel 13)

REST API for a ticket-selling mini-module: events, ticket types, orders and
payments. Payments are delegated to the separate FastAPI `payment-gateway`.
Every resource route is protected by stateless JWT authentication.

- Base URL: `http://127.0.0.1:8000`
- Stack: PHP 8.4, Laravel 13 (skeleton v13.8.0, framework v13.23.0), SQLite
- Auth: real JWT via `php-open-source-saver/jwt-auth` (HS256, `JWT_TTL=60`,
  blacklist enabled for logout/refresh)
- Tests: PHPUnit (`php artisan test`) — 53 tests / 149 assertions

---

## Folder structure

```
tickets-backend/
├── app/
│   ├── Exceptions/
│   │   ├── PaymentFailedException.php      # raised when gateway declines/unreachable
│   │   └── InvalidCredentialsException.php # raised on failed login
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── AuthController.php          # register / login / logout / refresh / me
│   │   │   ├── EventController.php
│   │   │   ├── TicketTypeController.php
│   │   │   └── OrderController.php
│   │   ├── Requests/
│   │   │   ├── RegisterRequest.php         # email normalize + strong password
│   │   │   ├── LoginRequest.php
│   │   │   ├── StoreEventRequest.php
│   │   │   ├── UpdateEventRequest.php
│   │   │   ├── StoreTicketTypeRequest.php
│   │   │   ├── UpdateTicketTypeRequest.php
│   │   │   ├── StoreOrderRequest.php
│   │   │   └── PayOrderRequest.php
│   │   └── Responses/
│   │       └── ApiResponse.php             # Response<T> envelope
│   ├── Models/          # User, Event, TicketType, Order, Payment
│   ├── Repositories/
│   │   ├── Contracts/   # *RepositoryInterface (Event, TicketType, Order, User)
│   │   └── Eloquent/    # implementations
│   ├── Services/        # AuthService, EventService, TicketTypeService, OrderService, PaymentService
│   └── Providers/
│       └── AppServiceProvider.php          # interface -> implementation bindings
├── bootstrap/app.php                        # registers /api routes + 401 envelope rendering
├── config/auth.php                          # jwt guard (`api`)
├── config/jwt.php                           # published jwt-auth config (ttl, blacklist)
├── config/services.php                      # payment_gateway.url
├── database/
│   ├── migrations/      # users, events, ticket_types, orders, payments
│   └── seeders/         # DatabaseSeeder (+ demo admin@example.com)
├── routes/api.php
└── tests/
    ├── Concerns/        # AuthenticatesApi trait (real JWT in feature tests)
    ├── Unit/            # OrderService, PaymentService, EventService, TicketTypeService
    └── Feature/         # AuthApi, EventApi, TicketTypeApi, OrderApi
```

## Layered architecture

```
Controller  →  FormRequest (validation)  →  Service (business rules)  →  Repository (interface)  →  Eloquent  →  SQLite
```

- **Controllers** are thin: validate, delegate, wrap responses in `ApiResponse`.
- **Services** hold business logic (price computation, stock checks, gateway calls,
  token lifecycle via `auth('api')`).
- **Repositories** are behind interfaces, bound in `AppServiceProvider`:
  - `EventRepositoryInterface`  → `EloquentEventRepository`
  - `TicketTypeRepositoryInterface` → `EloquentTicketTypeRepository`
  - `OrderRepositoryInterface`  → `EloquentOrderRepository`
  - `UserRepositoryInterface`  → `EloquentUserRepository`

## Domain model

| Table | Key fields | Notes |
|---|---|---|
| `users` | name, email (unique), password | `hashed` cast; `User implements JWTSubject` |
| `events` | title, venue, starts_at, ends_at, total_tickets, status | soft-deletes |
| `ticket_types` | event_id (FK), name, price, quantity | `price` is `decimal:2`; FK `restrictOnDelete` |
| `orders` | event_id, ticket_type_id, customer_name/email, quantity, unit_price, total_amount, status | `unit_price`/`total_amount` are `decimal:2` |
| `payments` | order_id, amount, currency, status, gateway_reference, paid_at | one per charge attempt |

Order statuses: `pending` → `paid` | `failed`. Payment statuses: `success` | `failed`.

> **Note:** a ticket type that already has orders **cannot be deleted** — the
> API returns `409 Conflict` (FK `restrictOnDelete`). Events soft-delete safely.

## Authentication (JWT)

Stateless HS256 tokens via `php-open-source-saver/jwt-auth`. The `User` model
implements `JWTSubject` and the `api` guard uses the `jwt` driver. Logout and
refresh blacklist the previous token server-side.

### Auth endpoints (public or token-based)
| Method | URI | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | public | Create account → `{ user, token }` (`201`) |
| POST | `/api/auth/login` | public, `throttle:5,1` | Validate credentials → `{ user, token }` |
| POST | `/api/auth/logout` | Bearer | Blacklist the current token |
| POST | `/api/auth/refresh` | Bearer | Issue a fresh token (old one is blacklisted) |
| GET | `/api/auth/me` | Bearer | Return the authenticated user |

All other `/api/*` routes require `Authorization: Bearer <token>` and return
`401` (clean `ApiResponse` envelope) without one.

### Register / login payloads
```json
// POST /api/auth/register
{ "name": "Jane Doe", "email": "jane@example.com",
  "password": "Secret123", "password_confirmation": "Secret123" }

// POST /api/auth/login
{ "email": "jane@example.com", "password": "Secret123" }
```

### Security rules
- `email` is lowercased in `RegisterRequest::prepareForValidation()` and must be unique.
- `password` must be `min:8`, contain at least one letter and one digit, and match `password_confirmation`.
- Passwords are hashed automatically by the `hashed` cast on `User` (bcrypt).
- Login failures return a generic `401 "Invalid email or password."`
  (`InvalidCredentialsException`) — no user enumeration.
- Login is rate-limited to 5 attempts per minute per IP (`throttle:5,1`).

## API endpoints

All responses use the `ApiResponse<T>` envelope:
`{ success, message, status_code, data, errors }`.

> **All endpoints below require a Bearer token** (`Authorization: Bearer <token>`).

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
php artisan jwt:secret                        # writes JWT_SECRET to .env
php artisan migrate:fresh --seed              # SQLite database/database.sqlite
php artisan serve --host=127.0.0.1 --port=8000
```

Environment (`.env`):
```
DB_CONNECTION=sqlite
PAYMENT_GATEWAY_URL=http://127.0.0.1:8001
AUTH_GUARD=api
JWT_SECRET=<generated>
JWT_TTL=60
```

Seed data creates the demo account `admin@example.com` / `password`.

## Testing

```powershell
php artisan test
```

- `tests/Unit/*` — service logic with mocked repositories / `Http::fake()`.
- `tests/Feature/*` — full HTTP flows against an in-memory SQLite database:
  register/login/logout/refresh/me, `401` on missing/invalid/blacklisted tokens,
  CRUD, `422` validations, stock errors, pay approved/declined/already-paid, `404`/`409`.
- `tests/Concerns/AuthenticatesApi.php` — signs a real JWT per test and attaches it
  as the `Authorization` header so `jwt.auth` middleware runs exactly as in production.
