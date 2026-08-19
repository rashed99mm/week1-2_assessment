<?php

namespace App\Services;

use App\Exceptions\ResourceInUseException;
use App\Models\TicketType;
use App\Repositories\Contracts\TicketTypeRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

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
     * @return Collection<int, TicketType>
     */
    public function index($eventId = null)
    {
        return $this->repo->all($eventId);
    }

    /**
     * Show a single ticket type.
     *
     * @return TicketType
     */
    public function show($id)
    {
        return $this->repo->find($id);
    }

    /**
     * Create a new ticket type.
     *
     * @return TicketType
     */
    public function create(array $data)
    {
        return $this->repo->create($data);
    }

    /**
     * Update an existing ticket type.
     *
     * @return TicketType
     */
    public function update($id, array $data)
    {
        return $this->repo->update($id, $data);
    }

    /**
     * Delete a ticket type.
     *
     * Orders reference ticket types with a restricting foreign key, so a type
     * that has been sold cannot be removed. That is checked here rather than
     * left to the database: relying on the constraint means catching a driver
     * error, and on PostgreSQL a failed statement poisons the whole
     * transaction, leaving the request unable to run another query.
     *
     * @return bool|null
     *
     * @throws ResourceInUseException When orders reference this ticket type.
     */
    public function delete($id)
    {
        $ticketType = $this->repo->find($id);

        if ($ticketType->orders()->exists()) {
            throw new ResourceInUseException(
                'Cannot delete ticket type because it has associated orders.'
            );
        }

        return $this->repo->delete($id);
    }
}
