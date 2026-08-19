<?php

namespace App\Support\Messaging;

use Illuminate\Support\Facades\Log;

/**
 * Accepts events and drops them.
 *
 * Bound when `BROKER_ENABLED=false`, which is the default for the test suites
 * and a bare local checkout. Events still land in the `domain_events` outbox
 * table — only the relay to RabbitMQ is skipped — so the transactional
 * behaviour is exercised in tests without requiring a broker to be running.
 *
 * Marking rows as published rather than leaving them pending is deliberate:
 * otherwise the relay command would retry the same rows forever on any machine
 * without a broker.
 */
class NullPublisher implements EventPublisher
{
    public function publish(array $envelope, string $routingKey): void
    {
        Log::debug('Domain event discarded: message broker is disabled.', [
            'id' => $envelope['id'],
            'type' => $routingKey,
        ]);
    }
}
