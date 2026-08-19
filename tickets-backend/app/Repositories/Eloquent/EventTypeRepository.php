<?php

namespace App\Repositories\Eloquent;

use App\Models\EventType;
use App\Repositories\Contracts\EventTypeRepositoryInterface;
use Illuminate\Database\Eloquent\Collection;

/**
 * Eloquent implementation of the EventType repository contract.
 */
class EventTypeRepository implements EventTypeRepositoryInterface
{
    /**
     * List all event types.
     *
     * Deliberately not paginated. This is a lookup table bounded by its own
     * domain — eight rows today, unique on name and slug — and every consumer
     * loads the whole set to populate a dropdown. Paginating it would break
     * five call sites to solve a problem that does not exist. The cap is a
     * backstop against someone treating it as a general-purpose table later.
     *
     * @return Collection<int, EventType>
     */
    public function all()
    {
        return EventType::orderBy('name')->limit(100)->get();
    }

    /**
     * Find a single event type or throw a ModelNotFoundException.
     *
     * @return EventType
     */
    public function find($id)
    {
        return EventType::findOrFail($id);
    }

    /**
     * Create a new event type.
     *
     * @return EventType
     */
    public function create(array $data)
    {
        return EventType::create($data);
    }

    /**
     * Update an existing event type.
     *
     * @return EventType
     */
    public function update($id, array $data)
    {
        $eventType = EventType::findOrFail($id);
        $eventType->update($data);

        return $eventType;
    }

    /**
     * Delete an event type by id.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return EventType::destroy($id);
    }
}
