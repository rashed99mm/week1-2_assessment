<?php

namespace App\Repositories\Contracts;

/**
 * Contract for persisting and retrieving Order records.
 */
interface OrderRepositoryInterface
{
    /**
     * List all orders with their relations.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, \App\Models\Order>
     */
    public function all();

    /**
     * Find a single order with its relations, or fail.
     *
     * @return \App\Models\Order
     */
    public function find($id);

    /**
     * Create a new order.
     *
     * @return \App\Models\Order
     */
    public function create(array $data);

    /**
     * Update an existing order.
     *
     * @return \App\Models\Order
     */
    public function update($id, array $data);

    /**
     * Delete an order by id.
     *
     * @return bool|null
     */
    public function delete($id);
}
