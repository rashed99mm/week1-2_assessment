<?php

namespace App\Repositories\Contracts;

/**
 * Contract for persisting and retrieving Event records.
 */
interface EventRepositoryInterface
{
    /**
     * List events with optional filtering, sorting and pagination.
     *
     * @param  array<string, mixed>  $filters
     * @return \Illuminate\Pagination\LengthAwarePaginator
     */
    public function all(array $filters = [], string $sortBy = 'created_at', string $sortOrder = 'desc', int $perPage = 15);

    /**
     * Find a single event or fail.
     *
     * @return \App\Models\Event
     */
    public function find($id);

    /**
     * Create a new event.
     *
     * @return \App\Models\Event
     */
    public function create(array $data);

    /**
     * Update an existing event.
     *
     * @return \App\Models\Event
     */
    public function update($id, array $data);

    /**
     * Delete an event by id.
     *
     * @return bool|null
     */
    public function delete($id);
}
