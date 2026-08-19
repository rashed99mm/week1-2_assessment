<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Broker enabled
    |--------------------------------------------------------------------------
    |
    | When false a null publisher is bound: domain events are still written to
    | the outbox table inside their originating transaction, but nothing is
    | relayed to RabbitMQ. This keeps the test suites and a bare local checkout
    | working without a broker, while still exercising the transactional path.
    |
    */

    'enabled' => (bool) env('BROKER_ENABLED', false),

    /*
    |--------------------------------------------------------------------------
    | RabbitMQ connection
    |--------------------------------------------------------------------------
    |
    | The exchange and its queues are created by the broker itself from
    | infra/rabbitmq/definitions.json — this application publishes to the
    | exchange and never declares it. See docs/contracts/broker-topology.md.
    |
    */

    'rabbitmq' => [
        'host' => env('RABBITMQ_HOST', '127.0.0.1'),
        'port' => (int) env('RABBITMQ_PORT', 5672),
        'user' => env('RABBITMQ_USER', 'guest'),
        'password' => env('RABBITMQ_PASSWORD', 'guest'),
        'vhost' => env('RABBITMQ_VHOST', '/'),
        'exchange' => env('RABBITMQ_EXCHANGE', 'tickets.events'),

        'connection_timeout' => (float) env('RABBITMQ_CONNECTION_TIMEOUT', 3.0),
        'read_write_timeout' => (float) env('RABBITMQ_READ_WRITE_TIMEOUT', 3.0),

        // Must be less than half the read/write timeout or the library will
        // consider the connection dead between heartbeats.
        'heartbeat' => (int) env('RABBITMQ_HEARTBEAT', 0),
    ],

    /*
    |--------------------------------------------------------------------------
    | Outbox relay
    |--------------------------------------------------------------------------
    |
    | The safety net for events whose publish job never ran — a worker that
    | died between the commit and picking the job up. Rows older than this and
    | still unpublished are re-dispatched by `events:relay-unpublished`.
    |
    | Also the threshold for the operational alarm: unpublished events older
    | than a few minutes mean the read models are diverging from the system of
    | record, while orders keep succeeding and nothing looks broken.
    |
    */

    'relay' => [
        'stale_after_minutes' => (int) env('DOMAIN_EVENT_RELAY_STALE_MINUTES', 2),
        'batch_size' => (int) env('DOMAIN_EVENT_RELAY_BATCH', 100),
    ],

    /*
    | Identifies this service as the origin of every event it emits.
    */

    'source' => env('DOMAIN_EVENT_SOURCE', 'tickets-backend'),

];
