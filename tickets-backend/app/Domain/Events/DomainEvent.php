<?php

namespace App\Domain\Events;

/**
 * A fact that happened in this system and that other services care about.
 *
 * Implementations are named in the past tense — they describe something that
 * has already been committed, not a request for something to happen. A
 * consumer may not refuse them.
 *
 * The wire format is frozen in docs/contracts/domain-events.md and validated by
 * docs/contracts/domain-events.schema.json. Two services outside this
 * repository parse these payloads, so changing a field is a coordinated
 * release rather than a refactor.
 */
interface DomainEvent
{
    /**
     * Dot-namespaced type, e.g. `order.paid`. Doubles as the AMQP routing key.
     */
    public function type(): string;

    /**
     * Payload schema version for this type.
     *
     * Adding an optional field does not change this. Removing or renaming one
     * does — consumers dead-letter a version they do not recognise rather than
     * guessing.
     */
    public function version(): int;

    /**
     * When the fact occurred, as opposed to when it is published.
     */
    public function occurredAt(): \DateTimeInterface;

    /**
     * Type-specific body.
     *
     * Keys are camelCase. Money is a decimal string ("150.00"), never a float —
     * a JSON number would arrive in Node as a binary float and drift by
     * fractions of a cent.
     *
     * @return array<string, mixed>
     */
    public function payload(): array;

    /**
     * Who caused this, or null for system-originated events such as the
     * expiry sweeper reclaiming an abandoned reservation.
     *
     * @return array{userId: int|null, role: string}|null
     */
    public function actor(): ?array;
}
