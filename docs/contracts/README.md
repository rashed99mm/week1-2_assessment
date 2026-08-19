# Cross-service contracts

Four services speak to each other in this system. Everything they rely on about each other is
written down here, and **only** here. If a behaviour is not in this directory, no service may
depend on it.

| Service | Path | Role |
|---|---|---|
| `tickets-backend` | Laravel 13 / PHP 8.3+ | System of record. Owns users, events, ticket types, orders, payments. Mints JWTs. Publishes domain events. |
| `payment-gateway` | FastAPI / Python 3.12 | Mock card processor. Reachable only from `tickets-backend` over the internal network. |
| `notification-service` | Fastify / Node 22 | Consumes domain events. Sends email, persists in-app notifications, pushes realtime updates. |
| `analytics-service` | ASP.NET Core / .NET 9 | Consumes domain events. Maintains a MongoDB read-model and serves the CMS dashboard. |

Two front-ends consume them: the React user portal (`frontend/`) at `/` and the Angular admin CMS
(`admin-cms/`) at `/admin/`.

## The contracts

| Document | Covers |
|---|---|
| [`api-response.md`](./api-response.md) | The response envelope every HTTP API emits, and the pagination shape |
| [`auth-jwt.md`](./auth-jwt.md) | Token format, claims, and the rules non-Laravel services must follow to verify one |
| [`domain-events.md`](./domain-events.md) | The event envelope and every payload, with delivery guarantees |
| [`domain-events.schema.json`](./domain-events.schema.json) | Machine-readable form of the above — validate against it in your tests |
| [`broker-topology.md`](./broker-topology.md) | Exchange, routing keys, queues, dead-letter policy |

## Versioning policy

**HTTP.** Every API is served under `/api/v1`. A breaking change to a response shape means `/api/v2`,
served alongside `v1` until every consumer has moved. Adding a field to a response is *not* breaking;
consumers must ignore fields they do not recognise.

`tickets-backend` additionally serves an unversioned `/api/*` compatibility mount for the React
portal, which predates versioning. It emits `Deprecation` and `Sunset` headers and is controlled by
`LEGACY_API_ENABLED`. It is switched off once the Angular CMS replaces the React admin pages. **New
code must never target it.**

**Events.** Each event type carries an integer `version`. Adding an optional payload field does not
bump it. Removing a field, renaming one, or changing its type does. A consumer that receives a
`version` it does not recognise must dead-letter the message rather than guess — see
[`domain-events.md`](./domain-events.md).

## Conventions that hold everywhere

- **JSON keys are `snake_case`** in HTTP responses. Laravel and FastAPI produce this naturally;
  .NET must configure `JsonNamingPolicy.SnakeCaseLower`. Domain *event* payloads use `camelCase` —
  see the note in [`domain-events.md`](./domain-events.md).
- **Money is always a decimal string** — `"150.00"`, never `150.0`. This holds on the wire in both
  HTTP responses and event payloads. Parse it into a decimal type (`Decimal128`, `decimal`,
  `Numeric`), never a float or a JS `number`.
- **Timestamps are RFC 3339 in UTC with an explicit `Z`**, millisecond precision. Every service
  stores and buckets in UTC. The only place a local timezone exists is a browser rendering a date.
- **Currency is a 3-letter uppercase ISO 4217 code.** The MVP only ever emits `USD`, but consumers
  must not assume it.
- **IDs from `tickets-backend` are integers.** They appear as JSON numbers in payloads and as a
  *string* in the JWT `sub` claim (a JWT convention, not an inconsistency).

## Browser storage

The portal and the CMS are served from the same origin (`/` and `/admin/`) and therefore share
`localStorage`. They deliberately use different keys so a logout in one does not sign the user out
of the other:

| App | Key |
|---|---|
| React portal | `tickets_token` |
| Angular CMS | `admin_cms_token` |

Do not "unify" these. Sharing one key means an admin browsing the portal as a customer and then
logging out drops their CMS session, which reads as a bug.

## Changing a contract

These files are consumed by three codebases that are built and deployed independently. Changing one
is a coordinated release, not a refactor. The order is always: publish the new contract → update
every consumer to accept both old and new → change the producer → remove the old handling.
