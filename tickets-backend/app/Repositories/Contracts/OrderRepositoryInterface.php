<?php

namespace App\Repositories\Contracts;

use App\Models\Order;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Contract for persisting and retrieving Order records.
 */
interface OrderRepositoryInterface
{
    /**
     * List orders, optionally scoped to a single owner.
     *
     * Scoping is a parameter of the repository rather than something a caller
     * applies afterwards, because it is a privacy boundary: every order row
     * carries a customer name and email address. Leaving the filter to the
     * caller means one forgetful controller leaks the whole customer list,
     * which is exactly what this endpoint used to do.
     *
     * @param  array<string, mixed>  $filters  Allow-listed filters.
     * @param  int|null  $userId  Restrict to this owner; null means no restriction.
     * @param  int  $perPage  Page size.
     * @return LengthAwarePaginator
     */
    public function all(array $filters = [], ?int $userId = null, int $perPage = 15);

    /**
     * Find a single order with its relations, or fail.
     *
     * @return Order
     */
    public function find($id);

    /**
     * Create a new order.
     *
     * @return Order
     */
    public function create(array $data);

    /**
     * Update an existing order.
     *
     * @return Order
     */
    public function update($id, array $data);

    /**
     * Delete an order by id.
     *
     * @return bool|null
     */
    public function delete($id);
}
