<?php

namespace App\Domain\Events;

use App\Domain\Events\Concerns\SerialisesDomainValues;
use App\Models\Order;
use App\Models\Payment;
use DateTimeInterface;

/**
 * An order was paid successfully.
 *
 * The revenue-bearing event: the analytics service's gross revenue, tickets
 * sold and paid-order counts all derive from this. The notification service
 * sends the receipt and the e-ticket.
 */
class OrderPaid implements DomainEvent
{
    use SerialisesDomainValues;

    public function __construct(
        private readonly Order $order,
        private readonly Payment $payment,
    ) {}

    public function type(): string
    {
        return 'order.paid';
    }

    public function version(): int
    {
        return 1;
    }

    public function occurredAt(): DateTimeInterface
    {
        return $this->payment->paid_at ?? now();
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
            'totalAmount' => $this->money($order->total_amount),
            'currency' => $this->payment->currency ?? 'USD',
            'paymentId' => (int) $this->payment->id,
            'gatewayReference' => $this->payment->gateway_reference,
            'customerName' => $order->customer_name,
            'customerEmail' => $order->customer_email,
            'paidAt' => $this->timestamp($this->occurredAt()),
        ];
    }

    public function actor(): ?array
    {
        $user = auth('api')->user();

        return $user === null ? null : ['userId' => (int) $user->id, 'role' => $user->role->value];
    }
}
