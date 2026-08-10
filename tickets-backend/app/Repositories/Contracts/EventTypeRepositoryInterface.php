<?php

namespace App\Repositories\Contracts;

/**
 * Contract for persisting and retrieving EventType records.
 */
interface EventTypeRepositoryInterface
{
    /**
     * List all event types.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, \App\Models\EventType>
     */
    public function all();

    /**
     * Find a single event type or fail.
     *
     * @return \App\Models\EventType
     */
    public function find($id);
}
