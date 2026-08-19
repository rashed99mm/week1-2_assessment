<?php

namespace App\Domain\Events;

use App\Domain\Events\Concerns\SerialisesDomainValues;
use App\Models\Order;
use App\Models\Payment;
use DateTimeInterface;

/**
 * A paid order was refunded and its tickets returned to stock.
 *
 * Partial refunds are out of scope, so `refundedAmount` always equals the order
 * total. Analytics subtracts it from gross revenue to get net.
 */
class OrderRefunded implements DomainEvent
{
    use SerialisesDomainValues;

    public function __construct(
        private readonly Order $order,
        private readonly Payment $payment,
        private readonly ?string $reason = null,
    ) {}

    public function type(): string
    {
        return 'order.refunded';
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
        $order = $this->order->loadMissing('event');

        return [
            'orderId' => (int) $order->id,
            'userId' => $this->nullableId($order->user_id),
            'eventId' => (int) $order->event_id,
            'eventTitle' => $order->event?->title ?? "Event #{$order->event_id}",
            'ticketTypeId' => (int) $order->ticket_type_id,
            'quantity' => (int) $order->quantity,
            // Carried on the event because the notification service has no
            // access to the orders table and a refund confirmation needs
            // somewhere to send.
            'customerName' => $order->customer_name,
            'customerEmail' => $order->customer_email,
            'refundedAmount' => $this->money($this->payment->amount),
            'currency' => $this->payment->currency ?? 'USD',
            'paymentId' => (int) $this->payment->id,
            'gatewayReference' => $this->payment->gateway_reference,
            'reason' => $this->reason,
            'refundedAt' => $this->timestamp($this->occurredAt()),
        ];
    }

    public function actor(): ?array
    {
        $user = auth('api')->user();

        return $user === null ? null : ['userId' => (int) $user->id, 'role' => $user->role->value];
    }
}
