<?php

namespace App\Repositories\Eloquent;

use App\Models\Order;
use App\Repositories\Contracts\OrderRepositoryInterface;

/**
 * Eloquent implementation of the Order repository contract.
 */
class OrderRepository implements OrderRepositoryInterface
{
    /**
     * List all orders with their relations.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, \App\Models\Order>
     */
    public function all()
    {
        return Order::with(['event', 'ticketType', 'payments'])->latest()->get();
    }

    /**
     * Find a single order with its relations, or throw a ModelNotFoundException.
     *
     * @return \App\Models\Order
     */
    public function find($id)
    {
        return Order::with(['event', 'ticketType', 'payments'])->findOrFail($id);
    }

    /**
     * Create a new order.
     *
     * @return \App\Models\Order
     */
    public function create(array $data)
    {
        return Order::create($data);
    }

    /**
     * Update an existing order.
     *
     * @return \App\Models\Order
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
