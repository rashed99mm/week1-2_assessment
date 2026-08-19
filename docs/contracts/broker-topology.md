# Broker topology

RabbitMQ 3.13. One topic exchange, one durable queue per consumer, one dead-letter path.

## Why RabbitMQ and not Redis Streams

Two consumers written in different runtimes (Node and .NET) each need their own complete copy of the
stream, with per-message acknowledgement, bounded redelivery, and somewhere for poison messages to
land. RabbitMQ gives all of that as queue configuration. Redis Streams gives consumer groups, but
stuck-message reclaim (`XAUTOCLAIM`), retry counting and a dead-letter stream become application code
you write **twice**, once in TypeScript and once in C#.

Redis is still in the deployment — Laravel uses it for cache and sessions. Using that same instance
as the event broker would couple durable delivery to an eviction-prone cache. Separate concerns,
separate containers.

## Topology

```
                          exchange: tickets.events  (topic, durable)
                                       │
              ┌────────────────────────┴────────────────────────┐
     routing key = event type                        routing key = event type
              │                                                 │
    queue: notifications.events                        queue: analytics.events
    bindings: order.*                                  bindings: #
              user.registered
              event.published
              │                                                 │
              └──────────── on delivery-limit ──────────────────┘
                                       │
                    exchange: tickets.events.dlx  (fanout, durable)
                                       │
                          queue: tickets.events.dead
```

| Object | Type | Durable | Notes |
|---|---|---|---|
| `tickets.events` | topic exchange | yes | The only exchange producers publish to |
| `tickets.events.dlx` | fanout exchange | yes | Dead-letter destination |
| `notifications.events` | quorum queue | yes | `x-dead-letter-exchange: tickets.events.dlx`, `x-delivery-limit: 5` |
| `analytics.events` | quorum queue | yes | same policy |
| `tickets.events.dead` | quorum queue | yes | No consumer. Drained by a human. |

**Routing key equals the event `type`** — `order.paid`, `user.registered`, and so on. There is no
separate key vocabulary to keep in sync.

Analytics binds `#` (everything) because a read-model that later wants a new metric should not need a
broker change to see historical event types. Notifications binds explicitly, because sending mail in
response to an event nobody designed a template for is worse than not receiving it.

## Who declares what

The topology is declared **once**, by the broker itself, from
`infra/rabbitmq/definitions.json` loaded at container start:

```
RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=-rabbitmq_management load_definitions "/etc/rabbitmq/definitions.json"
```

No service owns it. This matters because the alternative — each consumer declaring its own queue on
connect — means the exchange must exist before the first consumer starts, the producer must declare
it, and any disagreement about queue arguments between two versions of a service produces a
`PRECONDITION_FAILED` that takes down the consumer on deploy. Declaring it once, outside all of them,
removes the whole class of problem.

Consumers connect and `basicConsume`. They do not declare, and they do not assert.

## Message properties

The AMQP properties mirror the envelope so an operator reading the management UI can identify a
message without opening the body.

| Property | Value |
|---|---|
| `message_id` | `envelope.id` |
| `type` | `envelope.type` |
| `timestamp` | `envelope.occurredAt` as a Unix epoch |
| `content_type` | `application/json` |
| `content_encoding` | `utf-8` |
| `delivery_mode` | `2` (persistent) |
| `app_id` | `envelope.source` |
| `correlation_id` | `envelope.correlationId`, when present |

## Consumer behaviour

**Prefetch.** Notifications 10, analytics 20. Both do bounded work per message; a large prefetch just
moves messages into a consumer's memory where a crash loses them.

**Acknowledgement is manual.** Never `noAck`.

| Situation | Action |
|---|---|
| Envelope fails schema validation | `nack(requeue = false)` — straight to the DLQ. **Never requeue.** A malformed message requeued is redelivered forever and looks like broker load. |
| Unknown `type` | `ack`. New event types must not break existing consumers. |
| Known `type`, unrecognised `version` | `nack(requeue = false)`. Guessing produces silently wrong data. |
| Already processed (duplicate `id`) | `ack`. |
| Handler threw | `nack(requeue = true)`. `x-delivery-limit: 5` dead-letters it after five attempts. Delete the `processed_events` row first, or the retry is swallowed by the dedupe check. |
| Handled successfully | `ack`. |

**Connection loss** is normal, not exceptional. Reconnect with exponential backoff and report the
broker as degraded on the health endpoint while disconnected. Do not exit the process — a container
that restart-loops against a broker that is merely slow to start turns a ten-second delay into a
crash-loop backoff.

## The dead-letter queue

`tickets.events.dead` has no consumer by design. A message there means something needs a human:
a contract violation, a bug in a handler, or a `version` nobody implemented.

Alert on `messages_ready > 0`. Draining it is a manual operation — inspect the body, fix the cause,
then republish to `tickets.events` with the original routing key.

## Connection settings

```
RABBITMQ_HOST=tickets-rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=tickets
RABBITMQ_PASSWORD=<secret>
RABBITMQ_VHOST=/
RABBITMQ_EXCHANGE=tickets.events
```

Laravel additionally has `BROKER_ENABLED`. When false it binds a null publisher, so the fast test
lane and a bare local checkout run without a broker. Events still land in the `domain_events` outbox
table; they are simply never relayed.

The management UI is on 15672. It is **not** routed through nginx and its port is not published —
reach it with `docker compose port` or an SSH tunnel. It is an admin console with no authentication
worth exposing.

## Verifying the topology

```bash
docker compose exec rabbitmq rabbitmqctl list_exchanges name type durable
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers
docker compose exec rabbitmq rabbitmqctl list_bindings source_name routing_key destination_name
```

Two consumers, two queues, both draining to zero is the healthy steady state. A queue with a
consumer but a growing depth means a handler is slower than the publish rate. A queue with **no**
consumer means a service is down and events are accumulating — which is the designed behaviour, not
a failure: they will be processed when it returns.
