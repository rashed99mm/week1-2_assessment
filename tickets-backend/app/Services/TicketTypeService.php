<?php

namespace App\Services;

use App\Repositories\Contracts\TicketTypeRepositoryInterface;

/**
 * Orchestrates business logic for TicketType resources.
 */
class TicketTypeService
{
    protected TicketTypeRepositoryInterface $repo;

    /**
     * Inject the ticket type repository.
     *
     * @param  TicketTypeRepositoryInterface  $repo  Ticket type persistence contract.
     */
    public function __construct(TicketTypeRepositoryInterface $repo)
    {
        $this->repo = $repo;
    }

    /**
     * List ticket types, optionally filtered by event id.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, \App\Models\TicketType>
     */
    public function index($eventId = null)
    {
        return $this->repo->all($eventId);
    }

    /**
     * Show a single ticket type.
     *
     * @return \App\Models\TicketType
     */
    public function show($id)
    {
        return $this->repo->find($id);
    }

    /**
     * Create a new ticket type.
     *
     * @return \App\Models\TicketType
     */
    public function create(array $data)
    {
        return $this->repo->create($data);
    }

    /**
     * Update an existing ticket type.
     *
     * @return \App\Models\TicketType
     */
    public function update($id, array $data)
    {
        return $this->repo->update($id, $data);
    }

    /**
     * Delete a ticket type.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return $this->repo->delete($id);
    }
}
