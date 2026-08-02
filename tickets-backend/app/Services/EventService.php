<?php

namespace App\Services;

use App\Repositories\Contracts\EventRepositoryInterface;

/**
 * Orchestrates business logic for Event resources.
 */
class EventService
{
    protected EventRepositoryInterface $repo;

    /**
     * Inject the event repository.
     *
     * @param  EventRepositoryInterface  $repo  Event persistence contract.
     */
    public function __construct(EventRepositoryInterface $repo)
    {
        $this->repo = $repo;
    }

    /**
     * List events with filtering, sorting and pagination.
     *
     * @param  array<string, mixed>  $filters
     * @return \Illuminate\Pagination\LengthAwarePaginator
     */
    public function index(array $filters, string $sortBy, string $sortOrder, int $perPage)
    {
        return $this->repo->all($filters, $sortBy, $sortOrder, $perPage);
    }

    /**
     * Show a single event.
     *
     * @return \App\Models\Event
     */
    public function show($id)
    {
        return $this->repo->find($id);
    }

    /**
     * Create a new event.
     *
     * @return \App\Models\Event
     */
    public function create(array $data)
    {
        return $this->repo->create($data);
    }

    /**
     * Update an existing event.
     *
     * @return \App\Models\Event
     */
    public function update($id, array $data)
    {
        return $this->repo->update($id, $data);
    }

    /**
     * Delete an event.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return $this->repo->delete($id);
    }
}
