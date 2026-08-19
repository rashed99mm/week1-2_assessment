<?php

namespace App\Repositories\Eloquent;

use App\Models\Order;
use App\Repositories\Contracts\OrderRepositoryInterface;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Eloquent implementation of the Order repository contract.
 */
class OrderRepository implements OrderRepositoryInterface
{
    /**
     * Filter keys a client may supply. Anything else is dropped.
     */
    private const ALLOWED_FILTERS = [
        'status', 'event_id', 'ticket_type_id', 'date_from', 'date_to', 'search',
    ];

    private const MAX_PER_PAGE = 100;

    /**
     * List orders, optionally scoped to a single owner.
     *
     * Previously returned every order in the system as one unbounded
     * collection, to any authenticated caller — both a privacy leak and a
     * query that gets slower with every sale.
     *
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator
     */
    public function all(array $filters = [], ?int $userId = null, int $perPage = 15)
    {
        $query = Order::with(['event', 'ticketType', 'payments'])
            ->when($userId !== null, fn ($q) => $q->where('user_id', $userId));

        foreach ($filters as $field => $value) {
            if ($value === null || $value === '' || ! in_array($field, self::ALLOWED_FILTERS, true)) {
                continue;
            }

            match ($field) {
                'status' => $query->where('status', $value),
                'event_id' => $query->where('event_id', (int) $value),
                'ticket_type_id' => $query->where('ticket_type_id', (int) $value),
                'date_from' => $query->where('created_at', '>=', $value),
                'date_to' => $query->where('created_at', '<=', $value),
                // Administrators look orders up by whatever the customer gave
                // them on the phone: an order number, a name, or an email.
                'search' => $query->where(function ($q) use ($value): void {
                    $q->whereLike('customer_name', "%$value%", caseSensitive: false)
                        ->orWhereLike('customer_email', "%$value%", caseSensitive: false);

                    if (ctype_digit((string) $value)) {
                        $q->orWhere('id', (int) $value);
                    }
                }),
            };
        }

        return $query->latest()->paginate(max(1, min($perPage, self::MAX_PER_PAGE)));
    }

    /**
     * Find a single order with its relations, or throw a ModelNotFoundException.
     *
     * @return Order
     */
    public function find($id)
    {
        return Order::with(['event', 'ticketType', 'payments'])->findOrFail($id);
    }

    /**
     * Create a new order.
     *
     * @return Order
     */
    public function create(array $data)
    {
        return Order::create($data);
    }

    /**
     * Update an existing order.
     *
     * @return Order
     */
    public function update($id, array $data)
    {
        $order = Order::findOrFail($id);
        $order->update($data);

        return $order;
    }

    /**
     * Delete an order by id.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return Order::destroy($id);
    }
}
