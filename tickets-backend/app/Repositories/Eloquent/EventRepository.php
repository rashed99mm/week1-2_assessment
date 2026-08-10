<?php

namespace App\Repositories\Eloquent;

use App\Models\Event;
use App\Repositories\Contracts\EventRepositoryInterface;

/**
 * Eloquent implementation of the Event repository contract.
 */
class EventRepository implements EventRepositoryInterface
{
    /**
     * List events with optional filtering, sorting and pagination.
     *
     * @param  array<string, mixed>  $filters
     * @return \Illuminate\Pagination\LengthAwarePaginator
     */
    public function all(array $filters = [], string $sortBy = 'created_at', string $sortOrder = 'desc', int $perPage = 15)
    {
        $query = Event::query();

        foreach ($filters as $field => $value) {
            if ($value !== null && $value !== '') {
                if ($field === 'status') {
                    $query->where($field, $value);
                } elseif ($field === 'event_type_id') {
                    $query->where($field, (int) $value);
                } elseif ($field === 'search') {
                    $query->where(function ($q) use ($value): void {
                        $q->where('title', 'like', "%$value%")
                            ->orWhere('venue', 'like', "%$value%");
                    });
                } else {
                    $query->where($field, 'like', "%$value%");
                }
            }
        }

        $query->orderBy($sortBy, $sortOrder);

        return $query->paginate($perPage);
    }

    /**
     * Find a single event or throw a ModelNotFoundException.
     *
     * @return \App\Models\Event
     */
    public function find($id)
    {
        return Event::findOrFail($id);
    }

    /**
     * Create a new event.
     *
     * @return \App\Models\Event
     */
    public function create(array $data)
    {
        return Event::create($data);
    }

    /**
     * Update an existing event.
     *
     * @return \App\Models\Event
     */
    public function update($id, array $data)
    {
        $event = Event::findOrFail($id);
        $event->update($data);

        return $event;
    }

    /**
     * Delete an event by id.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return Event::destroy($id);
    }
}
