<?php

namespace App\Repositories\Contracts;

use App\Models\TicketType;
use Illuminate\Database\Eloquent\Collection;

/**
 * Contract for persisting and retrieving TicketType records.
 */
interface TicketTypeRepositoryInterface
{
    /**
     * List ticket types, optionally filtered by event id.
     *
     * @return Collection<int, TicketType>
     */
    public function all($eventId = null);

    /**
     * Find a single ticket type or fail.
     *
     * @return TicketType
     */
    public function find($id);

    /**
     * Create a new ticket type.
     *
     * @return TicketType
     */
    public function create(array $data);

    /**
     * Update an existing ticket type.
     *
     * @return TicketType
     */
    public function update($id, array $data);

    /**
     * Delete a ticket type by id.
     *
     * @return bool|null
     */
    public function delete($id);
}
