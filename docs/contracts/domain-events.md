# Domain events

`tickets-backend` publishes; `notification-service` and `analytics-service` consume. No service
calls another over HTTP for these facts — an order being paid is announced once and consumed
independently by both.

Machine-readable form: [`domain-events.schema.json`](./domain-events.schema.json). Validate against
it in your consumer's tests; a contract nobody checks is a comment.

## Envelope

Every message on the broker has exactly this shape.

```jsonc
{
  "id":            "0198c4f2-7a31-7c8e-9f01-3b2a4c5d6e7f",
  "type":          "order.paid",
  "version":       1,
  "occurredAt":    "2026-08-16T12:34:56.789Z",
  "source":        "tickets-backend",
  "correlationId": "0198c4f2-7a31-7c8e-9f01-000000000001",
  "actor":         { "userId": 12, "role": "user" },
  "payload":       { }
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | UUID v7. Unique per event. **This is the idempotency key** — consumers dedupe on it and may use it as a document `_id`. Time-ordered, so it also sorts. |
| `type` | yes | Dot-namespaced. Identical to the AMQP routing key. |
| `version` | yes | Integer, per `type`. See the compatibility rules below. |
| `occurredAt` | yes | RFC 3339, UTC, `Z`, millisecond precision. When the fact happened — not when it was published. |
| `source` | yes | Emitting service id. Always `tickets-backend` today. |
| `correlationId` | no | Propagated request id, for tracing a user action across services. May be `null`. |
| `actor` | no | Who caused it: `{ userId, role }`. **`null` for system-originated events** — the expiry sweeper cancelling an abandoned order has no actor. |
| `payload` | yes | Type-specific object. Never `null`; an event with nothing to say is an event that should not exist. |

### Casing

Envelope and payload fields are **`camelCase`**. This differs from the `snake_case` used in HTTP
responses, and that is intentional: HTTP responses are Laravel's Eloquent attributes serialised
directly, while events are a hand-authored contract whose primary consumers are TypeScript and C#.
Do not "fix" one to match the other — you would break every consumer to gain nothing.

### Types on the wire

- **Money is a decimal string**: `"150.00"`. Never a JSON number. Laravel's `decimal:2` cast already
  serialises this way; `JSON.parse` would otherwise hand Node a float and .NET a `double`, and
  cent-level drift then surfaces weeks later in a revenue tile that nobody can reconcile. Parse to
  `Decimal128` (Mongo), `decimal` (C#), or a decimal library (Node) — and in C# always pass
  `CultureInfo.InvariantCulture`, or a machine with a comma decimal separator parses `"150.00"` as
  fifteen thousand.
- **Timestamps** are RFC 3339 UTC with `Z`.
- **IDs** are JSON integers.
- **Currency** is a 3-letter uppercase ISO 4217 code.

## Delivery guarantees

**At-least-once.** Duplicates will happen — the outbox relay can crash between publishing and
marking a row published, and the broker redelivers anything unacknowledged.

**Consumers must be idempotent on `id`.** The pattern both services use:

1. Insert `{_id: envelope.id}` into a `processed_events` collection.
2. Duplicate-key error → already handled → acknowledge and stop.
3. Otherwise run the handler, then acknowledge.

Insert *before* handling, not after. A crash mid-handle then costs one lost event instead of an
infinite duplicate storm, and a second idempotency layer on the written document covers the gap.
This ordering matters most where a projection uses `$inc` — an increment applied twice is silently
wrong forever, with nothing to compare against.

**Ordering is not guaranteed.** `order.paid` genuinely can arrive before `order.created` after a
redelivery. Projectors must upsert rather than update, and gate status transitions on `occurredAt`
rather than arrival order. Do not build anything that assumes a sequence.

## Compatibility rules

- Adding an **optional** payload field does **not** bump `version`. Consumers must ignore fields they
  do not recognise.
- Removing a field, renaming one, or changing its type **does** bump `version`.
- A consumer receiving an unrecognised `version` for a known `type` must **dead-letter the message**.
  Guessing produces silently wrong data, which is worse than a message in a queue somebody has to
  look at.
- A consumer receiving an unrecognised `type` acknowledges and ignores it. New event types must not
  break existing consumers.
- A message that fails envelope validation is **poison**: dead-letter it immediately, without
  requeueing. Requeueing a malformed message produces an infinite redelivery loop that looks like
  the broker is under load.

## Event types

All are `version: 1`.

### `user.registered`

Emitted by `AuthService::register()`.

```jsonc
{ "userId": 12, "name": "Ada Lovelace", "email": "ada@example.com",
  "role": "user", "registeredAt": "2026-08-16T12:00:00.000Z" }
```

Consumers: notification → welcome email, admin in-app notice. Analytics → `user_dims`.

### `order.created`

Emitted inside the stock-reservation transaction in `OrderService::create()`. The tickets are already
reserved when this fires.

```jsonc
{ "orderId": 501, "userId": 12, "eventId": 17, "eventTitle": "Aurora Live",
  "ticketTypeId": 44, "ticketTypeName": "Floor A",
  "customerName": "Ada Lovelace", "customerEmail": "ada@example.com",
  "quantity": 2, "unitPrice": "75.00", "totalAmount": "150.00", "currency": "USD",
  "status": "pending",
  "createdAt": "2026-08-16T12:30:00.000Z",
  "expiresAt": "2026-08-16T12:45:00.000Z" }
```

`userId` is `null` for a legacy or guest order. `expiresAt` is when the reservation lapses and the
tickets return to stock.

Consumers: notification → order-confirmation email, in-app notice. Analytics → `order_facts` upsert,
`revenue_daily.ordersCreated`.

### `order.paid`

Emitted from the success branch of `PaymentService::charge()`.

```jsonc
{ "orderId": 501, "userId": 12, "eventId": 17, "eventTitle": "Aurora Live",
  "ticketTypeId": 44, "quantity": 2,
  "totalAmount": "150.00", "currency": "USD",
  "paymentId": 88, "gatewayReference": "TXN-9F2A4C5D6E7F8A0B",
  "customerName": "Ada Lovelace", "customerEmail": "ada@example.com",
  "paidAt": "2026-08-16T12:32:10.000Z" }
```

Consumers: notification → payment receipt + e-ticket, in-app notice, `admins` room push. Analytics →
status transition to `paid`, `revenue_daily.grossRevenue` / `ticketsSold` / `ordersPaid`.

### `order.refunded`

Emitted by `OrderService::refund()` after the gateway confirms. Stock has been restored.

```jsonc
{ "orderId": 501, "userId": 12, "eventId": 17, "eventTitle": "Aurora Live",
  "ticketTypeId": 44, "quantity": 2,
  "refundedAmount": "150.00", "currency": "USD",
  "paymentId": 88, "gatewayReference": "TXN-9F2A4C5D6E7F8A0B",
  "customerName": "Ada Lovelace", "customerEmail": "ada@example.com",
  "reason": "Customer request",
  "refundedAt": "2026-08-17T09:15:00.000Z" }
```

`reason` may be `null`. Partial refunds are out of scope — `refundedAmount` always equals the order
total.

`customerEmail` is carried on the event rather than looked up, because the notification service has
no access to the orders table and a refund confirmation needs somewhere to go. The same reasoning
applies to `eventTitle`: the email says which event was refunded.

Consumers: notification → refund confirmation. Analytics → `refundedAmount`, recomputed `netRevenue`.

### `order.cancelled`

Emitted by an admin cancelling an order, and by the expiry sweeper reclaiming an abandoned
reservation. Stock has been restored.

```jsonc
{ "orderId": 502, "userId": null, "eventId": 17, "ticketTypeId": 44, "quantity": 1,
  "reason": "reservation_expired",
  "cancelledAt": "2026-08-16T12:45:01.000Z" }
```

`reason` is `"reservation_expired"` for the sweeper (in which case `actor` is `null`), or free text
for an admin cancellation.

Consumers: analytics needs this for the drop-off arm of the order funnel. Notification sends nothing
for an expiry — a customer who abandoned a checkout does not want an email about it.

### `event.published`

Emitted by `EventObserver` when an event's `status` transitions to `published`. It fires on the
transition, not on every save of an already-published event.

```jsonc
{ "eventId": 17, "title": "Aurora Live", "venue": "Rooftop Arena",
  "eventTypeId": 3, "eventTypeName": "Concert",
  "startsAt": "2026-09-01T19:00:00.000Z", "endsAt": "2026-09-01T23:00:00.000Z",
  "totalTickets": 500,
  "coverImageUrl": "https://example.com/storage/covers/abc.jpg",
  "publishedAt": "2026-08-16T10:00:00.000Z" }
```

Nullable: `venue`, `eventTypeId`, `eventTypeName`, `endsAt`, `coverImageUrl`.

Consumers: notification → admin in-app notice. Analytics → `event_dims`, which supplies `totalTickets`
for the sell-through calculation.

## Publishing side: the outbox

Laravel does not publish to the broker directly from request handling. It writes the event to a
`domain_events` table **inside the same transaction as the business change**, then dispatches a
queued job after commit to relay it.

This is not ceremony. Publishing directly loses events when the database commits and the broker is
down, and emits phantom events when the transaction rolls back after the message is already gone.
Analytics revenue figures are derived from this stream, so neither failure is acceptable.

A scheduled relay command sweeps rows still unpublished after two minutes, using
`FOR UPDATE SKIP LOCKED` so several workers can drain it without contending. That sweep is the
safety net for a worker dying between commit and dispatch — and it is also the reason duplicates
exist, which is why consumers dedupe.

**Operational signal:** rows in `domain_events` with `published_at IS NULL` older than five minutes
mean the broker is unreachable and the read-models are diverging from the system of record. Orders
still succeed, so nothing looks broken from the outside. Alert on it.
