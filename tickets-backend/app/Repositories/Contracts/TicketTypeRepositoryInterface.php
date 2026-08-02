<?php

namespace App\Repositories\Contracts;

/**
 * Contract for persisting and retrieving TicketType records.
 */
interface TicketTypeRepositoryInterface
{
    /**
     * List ticket types, optionally filtered by event id.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, \App\Models\TicketType>
     */
    public function all($eventId = null);

    /**
     * Find a single ticket type or fail.
     *
     * @return \App\Models\TicketType
     */
    public function find($id);

    /**
     * Create a new ticket type.
     *
     * @return \App\Models\TicketType
     */
    public function create(array $data);

    /**
     * Update an existing ticket type.
     *
     * @return \App\Models\TicketType
     */
    public function update($id, array $data);

    /**
     * Delete a ticket type by id.
     *
     * @return bool|null
     */
    public function delete($id);
}
