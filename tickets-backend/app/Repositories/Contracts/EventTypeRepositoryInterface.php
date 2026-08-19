<?php

namespace App\Repositories\Contracts;

use App\Models\EventType;
use Illuminate\Database\Eloquent\Collection;

/**
 * Contract for persisting and retrieving EventType records.
 */
interface EventTypeRepositoryInterface
{
    /**
     * List all event types.
     *
     * @return Collection<int, EventType>
     */
    public function all();

    /**
     * Find a single event type or fail.
     *
     * @return EventType
     */
    public function find($id);

    /**
     * Create a new event type.
     *
     * @param  array<string, mixed>  $data
     * @return EventType
     */
    public function create(array $data);

    /**
     * Update an existing event type.
     *
     * @param  array<string, mixed>  $data
     * @return EventType
     */
    public function update($id, array $data);

    /**
     * Delete an event type.
     *
     * @return bool|null
     */
    public function delete($id);
}
