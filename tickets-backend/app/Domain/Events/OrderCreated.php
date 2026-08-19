<?php

namespace App\Domain\Events;

use App\Domain\Events\Concerns\SerialisesDomainValues;
use App\Models\Order;
use DateTimeInterface;

/**
 * An order was placed and its tickets are reserved.
 *
 * Emitted inside the reservation transaction, so by the time a consumer sees
 * this the stock has already been decremented. `expiresAt` is when the
 * reservation lapses if the customer never pays.
 */
class OrderCreated implements DomainEvent
{
    use SerialisesDomainValues;

    public function __construct(private readonly Order $order) {}

    public function type(): string
    {
        return 'order.created';
    }

    public function version(): int
    {
        return 1;
    }

    public function occurredAt(): DateTimeInterface
    {
        return $this->order->created_at ?? now();
    }

    public function payload(): array
    {
        $order = $this->order->loadMissing(['event', 'ticketType']);

        return [
            'orderId' => (int) $order->id,
            'userId' => $this->nullableId($order->user_id),
            'eventId' => (int) $order->event_id,
            // Denormalised so a consumer can render "Aurora Live" without
            // calling back into this service. Read models want the title as it
            // was at the time, not as it is now.
            'eventTitle' => $order->event?->title ?? "Event #{$order->event_id}",
            'ticketTypeId' => (int) $order->ticket_type_id,
            'ticketTypeName' => $order->ticketType?->name ?? "Ticket type #{$order->ticket_type_id}",
            'customerName' => $order->customer_name,
            'customerEmail' => $order->customer_email,
            'quantity' => (int) $order->quantity,
            'unitPrice' => $this->money($order->unit_price),
            'totalAmount' => $this->money($order->total_amount),
            'currency' => 'USD',
            'status' => Order::STATUS_PENDING,
            'createdAt' => $this->timestamp($this->occurredAt()),
            'expiresAt' => $this->timestamp($order->expires_at),
        ];
    }

    public function actor(): ?array
    {
        $user = auth('api')->user();

        return $user === null ? null : ['userId' => (int) $user->id, 'role' => $user->role->value];
    }
}
