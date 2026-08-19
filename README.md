# tic-ets

A six-service event ticketing platform. Browse events, pick a seat from a map
that adapts to the venue, walk the room in first person before you commit, and
check out through a mock payment gateway — all behind a single nginx edge
proxy with real-time admin notifications and an analytics dashboard.

```
                        ┌─────────────────────────────────────────────┐
   Browser ────────────►│            frontend (React 19 + Vite)       │
                        │   seat maps · 3D venue · checkout            │
                        └──────────────────────┬──────────────────────┘
                                               │  /api  (JWT Bearer)
                                               ▼
                        ┌─────────────────────────────────────────────┐
                        │          tickets-backend (Laravel 13)        │
                        │   Controllers → Services → Repositories      │──► PostgreSQL
                        │   events / ticket-types / orders / payments  │
                        │   └── publishes domain events ───────────────┤──► RabbitMQ
                        │        └── PaymentService ── HTTP ───────────┤
                        └──────────────────────┬──────────────────────┘
                                               │  /api/v1/payments/charge
                                               ▼
                        ┌─────────────────────────────────────────────┐
                        │          payment-gateway (FastAPI)           │
                        │   charge / get / refund ──► PaymentService   │──► PostgreSQL
                        └─────────────────────────────────────────────┘

   RabbitMQ ──────────►┌─────────────────────────────────────────────┐
                       │       notification-service (Node.js)         │
                       │   email (MJML) · Socket.IO · in-app notifs   │──► MongoDB
                       └─────────────────────────────────────────────┘

   RabbitMQ ──────────►┌─────────────────────────────────────────────┐
                       │       analytics-service (.NET 9)             │
                       │   KPIs · revenue · sales projections         │──► MongoDB
                       └──────────────────────┬──────────────────────┘
                                               │  /analytics/api
                                               ▼
                        ┌─────────────────────────────────────────────┐
                        │            admin-cms (Angular 20)            │
                        │   dashboard · events · orders · users        │
                        │   notifications (real-time via Socket.IO)    │
                        └─────────────────────────────────────────────┘
```

## Services

| Service | Path | Stack | URL |
|---|---|---|---|
| `frontend` | `frontend/` | React 19, TypeScript, Vite 8, Tailwind v4, three.js | `http://localhost:5173` |
| `admin-cms` | `admin-cms/` | Angular 20, TypeScript | `http://localhost:4200` |
| `tickets-backend` | `tickets-backend/` | Laravel 13, PHP 8.4, PostgreSQL, JWT (RS256) | `http://127.0.0.1:8000` |
| `payment-gateway` | `payment-gateway/` | FastAPI, SQLAlchemy 2.0, Pydantic 2.x | `http://127.0.0.1:8001` |
| `notification-service` | `notification-service/` | Node.js ≥22, Fastify 5, Socket.IO, MJML | `http://127.0.0.1:3000` |
| `analytics-service` | `analytics-service/` | ASP.NET Core 9, C#, MongoDB | `http://127.0.0.1:8080` |
| `nginx` | `deploy/nginx/` | Reverse proxy, static assets | `http://localhost:80` |

---

## Quick start

### Docker Compose (zero install)

The fastest way to run the entire stack. Requires Docker Desktop.

```powershell
docker compose up -d --wait
```

This builds all six services, runs migrations, seeds the database, and blocks
until every healthcheck passes. The app is live at `http://localhost:80`.

- **Storefront:** `http://localhost/`
- **Admin CMS:** `http://localhost/admin/`
- **Mail inbox:** `http://localhost:8025` (Mailpit)
- **Demo account:** `admin@example.com` / `password`

To tear down:

```powershell
docker compose down -v
```

### Manual setup (development)

Run each service separately for hot-reload and debugging.

#### 1. tickets-backend (Laravel)

```powershell
cd tickets-backend
composer install
php artisan jwt:secret          # writes JWT_SECRET into .env
php artisan migrate:fresh --seed
php artisan storage:link        # serves event cover images from /storage
php artisan serve --host=127.0.0.1 --port=8000
```

If `storage:link` fails with `symlink(): error code(1314)` — Windows without
Developer Mode, in a non-elevated shell — create a junction instead, which
needs no extra privileges:

```powershell
cmd /c mklink /J "public\storage" "storage\app\public"
```

Required `.env` values:

```
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=tickets
DB_USERNAME=tickets
DB_PASSWORD=<your password>
APP_URL=http://127.0.0.1:8000
PAYMENT_GATEWAY_URL=http://127.0.0.1:8001
JWT_SECRET=<generated by php artisan jwt:secret>
```

`APP_URL` must carry the port. Cover image URLs are derived from the incoming
request rather than `APP_URL`, so they stay correct behind the dev proxy — but
console and queue contexts have no request and fall back to `APP_URL`.

Seeding creates the demo account **`admin@example.com` / `password`**.

#### 2. payment-gateway (FastAPI)

```powershell
cd payment-gateway
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m alembic upgrade head
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Interactive docs: <http://127.0.0.1:8001/docs>

#### 3. notification-service (Node.js)

```powershell
cd notification-service
npm ci
npm run build
npm start
```

Requires a running RabbitMQ and MongoDB instance. Configure via environment
variables (see `src/core/config.ts`).

#### 4. analytics-service (.NET)

```powershell
cd analytics-service
dotnet restore
dotnet build
dotnet run --project src/Analytics.Api
```

Requires a running RabbitMQ and MongoDB instance.

#### 5. frontend (React)

```powershell
cd frontend
npm install
npm run dev
```

| Script | Purpose |
|---|---|
| `npm run dev` | Vite dev server with `/api` and `/storage` proxies |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | Types only, no emit |

#### 6. admin-cms (Angular)

```powershell
cd admin-cms
npm ci
ng serve
```

Dev server runs on `http://localhost:4200` with a proxy configuration that
forwards `/api`, `/analytics`, and `/notifications` to the backend services.

---

## Frontend

### Routes

| Route | Access | Purpose |
|---|---|---|
| `/` | public | Landing: featured carousel, live hero canvas, categories |
| `/events` | public | Search, type filters, sorting, URL-synced pagination |
| `/events/:id` | public | Event detail with cover art and ticket types |
| `/events/:id/seats` | public | Seat map, 3D venue, first-person seat view |
| `/checkout` | auth | Two-step order and payment |
| `/orders`, `/orders/:id` | auth | Order history |
| `/login`, `/register` | guests only | JWT auth |

### Seat maps

Seats are generated on the client from the event's ticket types and its live
sold counts — the backend stores quantities, not individual seats. The layout is
chosen from the event type's stage mode:

| Stage mode | Event types | Shape |
|---|---|---|
| `proscenium` | concert, conference, theater | Curved rows facing a front stage |
| `thrust` | workshop | Back block plus two inward-facing wings |
| `arena` | sports | Concentric elliptical rings |
| `openfloor` | festival, meetup, webinar | Standing zones with section outlines |

Venues over 600 seats split into **Floor / Mezzanine / Balcony** tiers with
risers, and every row is raked so back rows see over the row in front. "Sold"
seats are picked by a seeded PRNG keyed on the event and ticket-type ids, so the
map is identical across renders and reloads.

### 3D venue and first-person view

A `2D | 3D` toggle switches between the SVG map and a three.js venue. The 3D
scene is lazy-loaded, so three.js never reaches the landing page.

- **Stage** — deck, an LED wall playing the event's cover photo, two angled side
  screens, light beams and a ceiling. Built once; nothing about it changes when
  you move.
- **Seats** — one merged chair geometry drawn as a single instanced mesh, plus a
  second instanced layer of crowd sprites on occupied seats.
- **First person** — "Take a seat" drops the camera into a seat at eye height.
  Drag to look around, arrow keys or the on-screen pad to step to a neighbouring
  seat. Distance, angle and a sightline grade update per seat.

The canvas renders with `flat` tone mapping and patches emissive per instance so
selected seats read as exactly `#c6393f`; react-three-fiber's default ACES
tone mapping would otherwise shift the brand red toward orange.

### Design system

Colours live in one place — the `@theme` block in `src/index.css` — and are
mirrored into `src/lib/tokens.ts` for the SVG and WebGL layers, which cannot
read CSS variables. A development-only guard warns if the two drift apart.

| Token | Value | Use |
|---|---|---|
| `page` | `#161616` | App background |
| `ink` | `#121212` | Navbar, modals, hero, 3D canvas |
| `panel` | `#232323` | Cards, inputs, panels |
| `accent` | `#c6393f` | Primary CTAs and selected seats only |
| `accent-soft` | `#c7675b` | Hover and links |
| `muted` | `#a5a5a5` | Secondary text |
| `surface` | `#bfbfbf` | Accessible-seat markers |
| `line` | `rgba(255,255,255,.1)` | All borders |

Red is deliberately scarce. Motion, the 3D camera and the hero canvas all honour
`prefers-reduced-motion` — the CSS media query alone does not reach WebGL, so
that preference is threaded through a hook.

---

## Admin CMS

The admin dashboard is an Angular 20 SPA served under `/admin/` on the same
origin as the storefront.

### Features

| Feature | Route | Description |
|---|---|---|
| **Login** | `/login` | Guest-only; redirects to dashboard if already authenticated |
| **Dashboard** | `/dashboard` | Overview with KPIs, revenue charts, order funnel |
| **Events** | `/events` | CRUD for events with cover image uploads |
| **Ticket Types** | `/ticket-types` | Manage pricing and capacity per event |
| **Orders** | `/orders` | View and manage all orders |
| **Event Types** | `/event-types` | Manage the eight seeded categories |
| **Users** | `/users` | User administration |
| **Notifications** | `/notifications` | In-app notification inbox with real-time unread badge |

### Architecture

- **Standalone components** with `@OnPush` change detection and signals
- **Route guards** — `adminGuard` protects all authenticated routes;
  `guestGuard` keeps logged-in users off the login page
- **Real-time** — Socket.IO connection pushes new notifications as they arrive
  from the notification service
- **Proxy** — dev server forwards `/api` → Laravel, `/analytics` → .NET,
  `/notifications` → Node.js (with WebSocket support)

---

## Notification Service

A Node.js microservice that consumes domain events and dispatches notifications
through three channels: email, in-app storage, and real-time WebSocket push.

### What it handles

| Event | Action |
|---|---|
| `user.registered` | Welcome email + admin notification |
| `order.created` | Order confirmation email + in-app notification |
| `order.paid` | Payment receipt + e-ticket (QR code) email |
| `order.refunded` | Refund confirmation email |
| `order.cancelled` | Cancellation email |
| `event.published` | Admin notification (no email — "mailing users is a marketing decision") |

### Architecture

- **RabbitMQ consumer** — consumes from `notifications.events` quorum queue with
  exponential-backoff reconnect (1s → 30s)
- **Deduplication** — insert-is-check pattern in MongoDB; duplicate key = skip
- **Email outbox** — emails are queued in MongoDB, then flushed every 10s via
  Nodemailer. Templates are pre-compiled MJML + Handlebars
- **Socket.IO** — JWT-authenticated WebSocket push. Users join `user:<id>` rooms;
  admins join an `admins` broadcast room
- **Delivery limit** — messages that fail 5 times are dead-lettered

### Tech stack

| Component | Library |
|---|---|
| HTTP | Fastify 5 |
| WebSocket | Socket.IO 4 |
| Message broker | amqplib (RabbitMQ) |
| Database | Mongoose 8 (MongoDB) |
| Email | Nodemailer + MJML + Handlebars |
| Auth | jsonwebtoken (RS256 verify-only) |
| Validation | Zod |
| QR codes | qrcode (for e-ticket emails) |

---

## Analytics Service

A CQRS read-side projection service built with ASP.NET Core 9. It consumes
domain events from RabbitMQ and projects them into pre-computed MongoDB
collections optimised for dashboard queries.

### Endpoints

All endpoints require admin JWT authentication.

| Endpoint | Description |
|---|---|
| `GET /api/v1/analytics/kpis` | Revenue, orders, tickets sold, avg order value |
| `GET /api/v1/analytics/revenue-over-time` | Daily revenue buckets with granularity |
| `GET /api/v1/analytics/sales-by-event` | Sales breakdown per event |
| `GET /api/v1/analytics/sales-by-ticket-type` | Sales breakdown per ticket type |
| `GET /api/v1/analytics/order-status-funnel` | Created → paid → refunded/cancelled funnel |
| `GET /api/v1/analytics/top-events` | Ranked events by revenue |
| `GET /health` | `ok` / `degraded` / `unhealthy` |

### Event processing

| Event | Projector | What happens |
|---|---|---|
| `order.created` | OrderProjector | Upserts order fact, increments `orders_created` |
| `order.paid` | OrderProjector | Updates status, increments revenue and tickets sold |
| `order.refunded` | OrderProjector | Updates status, increments `refunded_amount` |
| `order.cancelled` | OrderProjector | Updates status (no revenue movement) |
| `event.published` | DimensionProjector | Upserts event dimension (title, venue, dates) |
| `user.registered` | DimensionProjector | Upserts user dimension (name, email, role) |

### MongoDB collections

| Collection | Purpose |
|---|---|
| `order_facts` | One row per order — the main fact table |
| `revenue_daily` | Pre-aggregated daily revenue buckets per event |
| `event_dims` | Event dimension table |
| `user_dims` | User dimension table |
| `processed_events` | Idempotency / dedup ledger (unique index) |

---

## Architecture

### Domain events

The backend publishes six domain event types through an **outbox pattern** for
reliable at-least-once delivery:

| Event | Published by | Consumed by |
|---|---|---|
| `user.registered` | AuthController | Notifications, Analytics |
| `order.created` | OrderService | Notifications, Analytics |
| `order.paid` | OrderService | Notifications, Analytics |
| `order.refunded` | OrderService | Notifications, Analytics |
| `order.cancelled` | OrderService | Analytics |
| `event.published` | EventService | Notifications, Analytics |

Events are written to a `domain_events` table in the same transaction as the
state change, then relayed by a queue job. This guarantees no events are lost
even if the broker is temporarily unavailable.

### RabbitMQ topology

| Exchange | Type | Purpose |
|---|---|---|
| `tickets.events` | topic | Main event exchange — Laravel publishes here |
| `tickets.events.dlx` | fanout | Dead-letter exchange for failed messages |

| Queue | Routing key | Consumer | Delivery limit |
|---|---|---|---|
| `notifications.events` | `order.*`, `user.registered`, `event.published` | Notification service | 5 |
| `analytics.events` | `#` (all events) | Analytics service | 5 |
| `tickets.events.dead` | — | Terminal sink for poison messages | — |

All queues are **quorum queues** (Raft-replicated). Topology is declared
centrally in `infra/rabbitmq/definitions.json`, not by individual services.

### Authentication

- **JWT RS256** — the Laravel backend signs tokens with a private key; the
  notification and analytics services verify with the public key only
- **Shared envelope** — all services return the same JSON response format:
  `{ success, message, status_code, data, errors }`
- **Service-to-service** — the payment gateway authenticates requests via a
  shared `GATEWAY_API_KEY`

### Order lifecycle

```
Created → Pending → Paid → (Refunded)
                  ↘ Cancelled
```

- Stock is reserved atomically at order creation (`SELECT FOR UPDATE`)
- 15-minute reservation window with automated expiry sweeper
- Payment goes through the FastAPI gateway, then status transitions with
  domain event emission
- Idempotent transitions (calling cancel twice is safe)

---

## Infrastructure

### Docker Compose (14 services)

| Tier | Services |
|---|---|
| **Edge** | nginx (port 80) |
| **Application** | api, queue, scheduler, payments, notifications, analytics |
| **Build** | portal-build, cms-build (one-shot, copy dist/ into volumes) |
| **Backing** | PostgreSQL, Redis, RabbitMQ, MongoDB |
| **Email** | Mailpit (port 8025 UI, 1025 SMTP) |

### Databases

| Database | Engine | Used by | Purpose |
|---|---|---|---|
| `tickets` | PostgreSQL 16 | Laravel API | Core app data (users, events, orders) |
| `payments` | PostgreSQL 16 | FastAPI gateway | Payment records (separate schema) |
| `notifications` | MongoDB 7 | Node service | Notification log, email outbox, dedup |
| `analytics` | MongoDB 7 | .NET service | Read model, aggregations, dedup |

### Ports

| Port | Service | Exposure |
|---|---|---|
| **80** | nginx | Public |
| **8025** | Mailpit UI | Public |
| 9000 | Laravel (FastCGI) | Internal |
| 8001 | FastAPI gateway | Internal |
| 3000 | Notification service | Internal |
| 8080 | Analytics service | Internal |
| 5432 | PostgreSQL | Internal |
| 6379 | Redis | Internal |
| 5672 | RabbitMQ | Internal |
| 27017 | MongoDB | Internal |

Only nginx and Mailpit publish ports to the host.

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`) runs on push to
`master`/`main` and all pull requests:

| Job | What it does |
|---|---|
| **PHP - Pint** | Laravel Pint formatter in `--test` mode |
| **PHP - PHPUnit (SQLite)** | 68 tests / 204 assertions against in-memory SQLite + domain event contract validation |
| **PHP - PHPUnit (PostgreSQL)** | Same suite against a real PostgreSQL 16 container |
| **Python - pytest** | Payment gateway tests + Alembic migration check |
| **Node - Vitest** | Notification service tests, lint, typecheck, build |
| **.NET - xUnit** | Analytics service tests with EphemeralMongo |
| **Portal - build** | React typecheck + Vite production build |
| **CMS - build** | Angular production build + base href check |
| **E2E - compose smoke** | `docker compose up -d --wait` → curl test suites → teardown |

---

## API

Both the Laravel backend and payment gateway return the same envelope:

```json
{
  "success": true,
  "message": "Events fetched successfully.",
  "status_code": 200,
  "data": {},
  "errors": null
}
```

For paginated endpoints `data` is the raw Laravel paginator, so results are at
`data.data[]` alongside `data.total`, `data.current_page` and `data.last_page`.

### tickets-backend — `/api/v1`

**Public**

| Method | URI | Description |
|---|---|---|
| POST | `/auth/register` | Create account → `{ user, token }` |
| POST | `/auth/login` | Sign in → `{ user, token }` (throttled 5/min) |
| GET | `/events` | List — `filters[status]`, `filters[search]`, `filters[event_type_id]`, `sort_by`, `sort_order`, `per_page` |
| GET | `/events/{id}` | Show |
| GET | `/events/{id}/availability` | Per-ticket-type sold counts |
| GET | `/ticket-types` | List, filter with `?event_id=` |
| GET | `/ticket-types/{id}` | Show |
| GET | `/event-types` | List the eight seeded categories |
| GET | `/event-types/{id}` | Show |

**Requires `Authorization: Bearer <token>`**

| Method | URI | Description |
|---|---|---|
| POST | `/auth/logout` | Invalidate the token |
| POST | `/auth/refresh` | Issue a fresh token |
| GET | `/auth/me` | Current user |
| POST | `/events` | Create — accepts multipart with `cover_image` |
| PUT | `/events/{id}` | Update — see the upload note below |
| DELETE | `/events/{id}` | Soft delete |
| POST/PUT/DELETE | `/ticket-types`, `/ticket-types/{id}` | Manage (`409` if a type has orders) |
| GET/POST | `/orders` | List / create (computes totals, checks stock) |
| GET | `/orders/{id}` | Show |
| POST | `/orders/{id}/pay` | Charge through the gateway |

### payment-gateway — `/api/v1`

| Method | URI | Description |
|---|---|---|
| POST | `/payments/charge` | Charge an order |
| GET | `/payments/{id}` | Fetch a payment |
| POST | `/payments/{id}/refund` | Refund a successful payment |
| GET | `/health` | Health check |

**Mock approval rule** — approved when `amount <= 1000.00` **and** `card_token`
starts with `4242`; declined otherwise.

### notification-service — `/api/v1`

| Method | URI | Description |
|---|---|---|
| GET | `/notifications` | List notifications for the current user |
| PATCH | `/notifications/{id}` | Mark as read |
| GET | `/notifications/unread-count` | Unread count |
| GET | `/health` | Health check |

WebSocket endpoint: `/notifications/ws` (Socket.IO, JWT auth required).

### analytics-service — `/api/v1`

| Method | URI | Description |
|---|---|---|
| GET | `/analytics/kpis` | Revenue, orders, tickets, avg order value |
| GET | `/analytics/revenue-over-time` | Daily revenue buckets |
| GET | `/analytics/sales-by-event` | Sales per event |
| GET | `/analytics/sales-by-ticket-type` | Sales per ticket type |
| GET | `/analytics/order-status-funnel` | Order lifecycle funnel |
| GET | `/analytics/top-events` | Ranked events by revenue |
| GET | `/health` | `ok` / `degraded` / `unhealthy` |

All analytics endpoints require admin JWT and accept `from`, `to` date filters.

---

## Event cover images

Covers are stored on the `public` disk under `covers/` and exposed as
`cover_image_url` on every serialized event. Events without one fall back to a
procedurally generated poster in the frontend, so the UI never shows a gap.

**Uploading.** `PUT` cannot carry a file — PHP never populates `$_FILES` on
anything but `POST` — so updates are sent as `POST` with a `_method=PUT` field in
the multipart body. Uploads are capped at 4 MB, which needs
`upload_max_filesize` and `post_max_size` in `php.ini` set to at least that;
`post_max_size` caps the whole body so it must be the larger of the two.

**Seeding.** The seeder downloads a photograph matching each event's type and
falls back to a generated gradient when the machine is offline, so
`migrate:fresh --seed` always succeeds. To fill in covers on an existing
database without reseeding:

```powershell
php artisan db:seed --class=EventCoverSeeder
```

**Deletes.** Events are soft-deleted, so their cover files are deliberately left
on disk — removing them would leave a restored event with a broken image.

---

## Testing

```powershell
# Laravel — unit + feature, SQLite in memory
cd tickets-backend
php artisan test                            # 68 tests / 204 assertions

# FastAPI — schemas, service, API
cd payment-gateway
.venv\Scripts\python -m pytest tests -v

# Notification service — handlers, consumer, templates
cd notification-service
npm test

# Analytics service — projectors, pipeline, auth
cd analytics-service
dotnet test

# Frontend — types and production build
cd frontend
npm run typecheck
npm run build

# Admin CMS — build verification
cd admin-cms
ng build --configuration production
```

### End-to-end curl suites

Self-contained, create their own data, and print the HTTP status for every case,
so they work against any database state:

```powershell
powershell -ExecutionPolicy Bypass -File test-cases.ps1   # Windows
bash test-cases.sh                                        # Linux / CI
```

---

## Notes and known limits

- **Orders have no `user_id`.** They record a customer name and email but are not
  tied to the authenticated account, so order history is not per-user scoped.
- **Admin routes are auth-gated, not role-gated.** There is no role column yet.
- **Checkout state lives in router location state**, so refreshing `/checkout`
  loses the selection and shows an empty-cart notice.
- **Seats are generated, not stored.** Two people can select the same seat; the
  stock check happens at order time against ticket-type quantity.
- **`filters[...]`** falls through to a `LIKE` on any column name supplied, which
  is convenient in development and would want a whitelist before production.
- **Socket.IO is single-instance only.** Scaling out would require the Socket.IO
  Redis adapter.
- **The payment gateway is mock-only.** No real payment processing — card token
  `4242*` is approved, everything else is declined.
