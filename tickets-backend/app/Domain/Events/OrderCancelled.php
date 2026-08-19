<?php

namespace App\Domain\Events;

use App\Domain\Events\Concerns\SerialisesDomainValues;
use App\Models\Order;
use DateTimeInterface;

/**
 * An order was cancelled and its tickets returned to stock.
 *
 * Two sources: an administrator cancelling from the CMS, and the expiry
 * sweeper reclaiming an abandoned reservation. The sweeper has no actor, which
 * is how a consumer tells the two apart.
 *
 * Analytics needs this for the drop-off arm of the order funnel. The
 * notification service deliberately sends nothing for an expiry — a customer
 * who walked away from a checkout does not want an email about it.
 */
class OrderCancelled implements DomainEvent
{
    use SerialisesDomainValues;

    /**
     * Reason recorded when the expiry sweeper reclaims a reservation.
     */
    public const REASON_EXPIRED = 'reservation_expired';

    public function __construct(
        private readonly Order $order,
        private readonly ?string $reason = null,
    ) {}

    public function type(): string
    {
        return 'order.cancelled';
    }

    public function version(): int
    {
        return 1;
    }

    public function occurredAt(): DateTimeInterface
    {
        return now();
    }

    public function payload(): array
    {
        return [
            'orderId' => (int) $this->order->id,
            'userId' => $this->nullableId($this->order->user_id),
            'eventId' => (int) $this->order->event_id,
            'ticketTypeId' => (int) $this->order->ticket_type_id,
            'quantity' => (int) $this->order->quantity,
            'reason' => $this->reason,
            'cancelledAt' => $this->timestamp($this->occurredAt()),
        ];
    }

    public function actor(): ?array
    {
        $user = auth('api')->user();

        // Null when the sweeper runs it: a scheduled command has no user.
        return $user === null ? null : ['userId' => (int) $user->id, 'role' => $user->role->value];
    }
}
