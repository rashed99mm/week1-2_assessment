# The API response envelope

Every HTTP endpoint in the system — Laravel, FastAPI, Node, .NET — returns the same JSON envelope.
A client that can parse one API can parse all four.

Canonical implementation: `tickets-backend/app/Http/Responses/ApiResponse.php`.

## Shape

```jsonc
{
  "success":     true,        // boolean — mirrors whether status_code is 2xx
  "message":     "Success",   // string — human-readable, safe to show a user
  "status_code": 200,         // integer — same as the HTTP status line
  "data":        { },         // the payload, or null on error
  "errors":      null         // null on success; on error, see below
}
```

`status_code` duplicates the HTTP status deliberately: some proxies and client libraries flatten or
lose the status line, and the body should still be self-describing.

### Success

```json
{ "success": true, "message": "Order created.", "status_code": 201,
  "data": { "id": 42, "total_amount": "150.00", "status": "pending" },
  "errors": null }
```

`data` may be an object, an array, a paginated envelope (below), or `null` for a 204-style response.

### Error

```json
{ "success": false, "message": "The given data was invalid.", "status_code": 422,
  "data": null,
  "errors": { "quantity": ["The quantity must be at least 1."],
              "customer_email": ["The customer email field is required."] } }
```

`errors` is a **map of field name to an array of messages** for validation failures (422). For every
other error class it is either `null` or a free-form object carrying debug detail. Clients must
tolerate both: check whether `errors` is an object of arrays before rendering it field-by-field.

Non-validation errors:

```json
{ "success": false, "message": "This action requires administrator privileges.",
  "status_code": 403, "data": null, "errors": null }
```

### Status codes in use

| Code | When |
|---|---|
| 200 | Read, update, or an action that returns a result |
| 201 | Resource created — **also sets a `Location` header** |
| 400 | Rejected by a downstream system (e.g. the gateway declined a charge) |
| 401 | Missing, malformed, or expired token |
| 403 | Authenticated but not permitted |
| 404 | No such resource, or one the caller may not know exists |
| 409 | Refused because of a referential conflict (e.g. deleting a ticket type that has orders) |
| 413 | Upload exceeded the size limit |
| 422 | Validation failed — `errors` is populated |
| 429 | Rate limited |
| 500 | Unhandled — `message` is generic, detail goes to logs, never to the client |

**Every error path must go through the envelope**, including framework-generated ones. The two that
frameworks most commonly leak in their own shape:

- Laravel's `ValidationException` (422) and `AuthorizationException` (403) — mapped explicitly in
  `bootstrap/app.php`.
- ASP.NET Core's JWT bearer 401/403, which default to an *empty body*. Override via the
  `OnChallenge` and `OnForbidden` events.

An API that emits two different error shapes forces every client to handle both. There is one shape.

## Pagination

Paginated endpoints put Laravel's paginator straight into `data`. The other services reproduce these
exact field names so a single client-side `Paginated<T>` type works against all of them.

```jsonc
{
  "success": true, "message": "Success", "status_code": 200, "errors": null,
  "data": {
    "current_page":   1,
    "data":           [ /* the items */ ],
    "first_page_url": "http://…?page=1",
    "from":           1,        // 1-based index of the first item, null when empty
    "last_page":      7,
    "last_page_url":  "http://…?page=7",
    "links":          [ { "url": null, "label": "&laquo; Previous", "active": false } ],
    "next_page_url":  "http://…?page=2",
    "path":           "http://…",
    "per_page":       15,
    "prev_page_url":  null,
    "to":             15,       // 1-based index of the last item, null when empty
    "total":          98
  }
}
```

Note the nesting: `data.data` is the item array. That is Laravel's shape and it is not worth
diverging from for cosmetics.

Non-Laravel services need only populate `current_page`, `data`, `last_page`, `per_page`, `from`,
`to`, and `total` faithfully. The `*_url` and `links` fields may be `null` / `[]` — no client renders
them; they use `current_page` and `last_page`.

### Query parameters

| Parameter | Meaning |
|---|---|
| `page` | 1-based page number, default 1 |
| `per_page` | items per page, default 15, capped at 100 |
| `sort_by` / `sort_order` | column and `asc`\|`desc`, where the endpoint documents support |
| `search` | free-text, endpoint-defined fields |
| `filters[<field>]` | structured filters — **allow-listed per endpoint**; unknown keys are silently dropped, never passed to the query builder |

### What is not paginated

Lookup tables bounded by their domain — `/event-types` returns 8-20 rows and is capped rather than
paginated. Paginating it would break every consumer to solve a problem that does not exist.

## TypeScript reference

Already present at `frontend/src/types/index.ts`; the Angular CMS reuses it verbatim.

```ts
export interface ApiResponse<T> {
  success: boolean
  message: string
  status_code: number
  data: T
  errors: Record<string, string[]> | null
}

export interface Paginated<T> {
  current_page: number
  data: T[]
  last_page: number
  per_page: number
  from: number | null
  to: number | null
  total: number
  // …url/links fields omitted; present on the wire, unused by clients
}
```

Clients unwrap to `body.data` and throw a typed error carrying `status` and `errors` on a non-2xx —
see `frontend/src/lib/api.ts` for the reference implementation, including `formatApiErrors()`, which
flattens the `errors` map into `"field: message"` strings.

## Implementation notes per service

**Laravel** — use `ApiResponse::success()` / `ApiResponse::error()`. Never `return $model` directly
from a controller.

**FastAPI** — the generic `ApiResponse[T]` in `payment-gateway/app/schemas/response.py`. Note the
gateway's deliberate quirk: a **declined charge returns HTTP 200** with `success: false` and
`status_code: 400` in the body, because a decline is a successful call to the gateway that produced a
negative answer. Only `tickets-backend` calls it, and `PaymentService` handles this. No other client
should.

**Node (Fastify)** — `src/core/api-response.ts` exposes `ok<T>()` and `fail()`. Register an error
handler so thrown errors and schema validation failures both serialise through it.

**.NET** — `Common/ApiResponse.cs`, plus `JsonSerializerOptions.PropertyNamingPolicy =
JsonNamingPolicy.SnakeCaseLower`. Without the naming policy you emit `statusCode` and every client
breaks silently on a field it cannot find.
