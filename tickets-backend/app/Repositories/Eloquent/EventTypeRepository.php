<?php

namespace App\Repositories\Eloquent;

use App\Models\EventType;
use App\Repositories\Contracts\EventTypeRepositoryInterface;

/**
 * Eloquent implementation of the EventType repository contract.
 */
class EventTypeRepository implements EventTypeRepositoryInterface
{
    /**
     * List all event types.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, \App\Models\EventType>
     */
    public function all()
    {
        return EventType::orderBy('name')->get();
    }

    /**
     * Find a single event type or throw a ModelNotFoundException.
     *
     * @return \App\Models\EventType
     */
    public function find($id)
    {
        return EventType::findOrFail($id);
    }
}
