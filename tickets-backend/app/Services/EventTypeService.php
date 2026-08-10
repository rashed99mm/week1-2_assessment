<?php

namespace App\Services;

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
}
