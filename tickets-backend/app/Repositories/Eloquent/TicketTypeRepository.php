<?php

namespace App\Repositories\Eloquent;

use App\Models\TicketType;
use App\Repositories\Contracts\TicketTypeRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

/**
 * Eloquent implementation of the TicketType repository contract.
 */
class TicketTypeRepository implements TicketTypeRepositoryInterface
{
    /**
     * List ticket types, optionally filtered by event id.
     *
     * @return Collection<int, TicketType>
     */
    public function all($eventId = null)
    {
        $query = TicketType::query();

        if ($eventId !== null) {
            $query->where('event_id', $eventId);
        }

        return $query->get();
    }

    /**
     * Find a single ticket type or throw a ModelNotFoundException.
     *
     * @return TicketType
     */
    public function find($id)
    {
        return TicketType::findOrFail($id);
    }

    /**
     * Create a new ticket type.
     *
     * @return TicketType
     */
    public function create(array $data)
    {
        return TicketType::create($data);
    }

    /**
     * Update an existing ticket type.
     *
     * @return TicketType
     */
    public function update($id, array $data)
    {
        $ticketType = TicketType::findOrFail($id);
        $ticketType->update($data);

        return $ticketType;
    }

    /**
     * Delete a ticket type by id.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return TicketType::destroy($id);
    }
}
