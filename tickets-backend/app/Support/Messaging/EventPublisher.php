<?php

namespace App\Support\Messaging;

/**
 * Delivers a domain event envelope to the message broker.
 *
 * Implementations receive the fully-formed envelope, already shaped to the
 * contract in docs/contracts/domain-events.md. They are responsible only for
 * transport — never for deciding what an event looks like.
 */
interface EventPublisher
{
    /**
     * Publish one envelope.
     *
     * @param  array<string, mixed>  $envelope  The complete event envelope.
     * @param  string  $routingKey  Equal to the event type.
     *
     * @throws \RuntimeException When the broker cannot be reached. The caller
     *                           is a retrying queued job, so throwing is the
     *                           correct response to a transient failure.
     */
    public function publish(array $envelope, string $routingKey): void;
}
