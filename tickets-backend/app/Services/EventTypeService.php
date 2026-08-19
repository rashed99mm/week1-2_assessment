<?php

namespace App\Services;

use App\Exceptions\ResourceInUseException;
use App\Repositories\Contracts\EventTypeRepositoryInterface;

/**
 * Orchestrates business logic for EventType resources.
 */
class EventTypeService
{
    protected EventTypeRepositoryInterface $repo;

    /**
     * Inject the event type repository.
     *
     * @param  EventTypeRepositoryInterface  $repo  EventType persistence contract.
     */
    public function __construct(EventTypeRepositoryInterface $repo)
    {
        $this->repo = $repo;
    }

    /**
     * List all event types.
     */
    public function index()
    {
        return $this->repo->all();
    }

    /**
     * Show a single event type.
     */
    public function show($id)
    {
        return $this->repo->find($id);
    }

    /**
     * Create a new event type.
     *
     * @param  array<string, mixed>  $data
     */
    public function create(array $data)
    {
        return $this->repo->create($data);
    }

    /**
     * Update an existing event type.
     *
     * @param  array<string, mixed>  $data
     */
    public function update($id, array $data)
    {
        return $this->repo->update($id, $data);
    }

    /**
     * Delete an event type.
     *
     * Events reference their type with a nullOnDelete foreign key, so deleting
     * one would silently strip the categorisation from every event using it
     * rather than failing. Refuse instead: losing which events were concerts is
     * not something an administrator would expect from deleting a lookup row.
     *
     * @return bool|null
     *
     * @throws ResourceInUseException When events reference this type.
     */
    public function delete($id)
    {
        $eventType = $this->repo->find($id);

        if ($eventType->events()->exists()) {
            throw new ResourceInUseException(
                'Cannot delete this event type because events are using it.'
            );
        }

        return $this->repo->delete($id);
    }
}
