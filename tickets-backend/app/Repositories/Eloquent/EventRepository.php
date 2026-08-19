<?php

namespace App\Repositories\Eloquent;

use App\Models\Event;
use App\Repositories\Contracts\EventRepositoryInterface;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Eloquent implementation of the Event repository contract.
 */
class EventRepository implements EventRepositoryInterface
{
    /**
     * Filter keys a client is allowed to supply. Anything else is dropped.
     *
     * Every value here reaches the query builder, so this list is a security
     * boundary rather than a convenience: without it an arbitrary column name
     * from `filters[...]` ends up in a WHERE clause, which leaks schema detail
     * through SQL errors and lets a caller probe columns such as `password`.
     */
    private const ALLOWED_FILTERS = ['status', 'event_type_id', 'search', 'venue'];

    /**
     * Columns a client may sort by. An unknown column would otherwise reach
     * ORDER BY and surface as a 500.
     */
    private const SORTABLE = ['created_at', 'starts_at', 'title', 'total_tickets'];

    /**
     * Largest page a client may request, so `per_page=100000` cannot be used
     * to pull the whole table in one query.
     */
    private const MAX_PER_PAGE = 100;

    /**
     * List events with optional filtering, sorting and pagination.
     *
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator
     */
    public function all(array $filters = [], string $sortBy = 'created_at', string $sortOrder = 'desc', int $perPage = 15)
    {
        $query = Event::query();

        foreach ($filters as $field => $value) {
            if ($value === null || $value === '' || ! in_array($field, self::ALLOWED_FILTERS, true)) {
                continue;
            }

            match ($field) {
                'status' => $query->where('status', $value),
                'event_type_id' => $query->where('event_type_id', (int) $value),
                // whereLike() is case-insensitive by default and compiles to
                // ILIKE on PostgreSQL. A plain `like` is case-sensitive there
                // but not on SQLite/MySQL, so searching "aurora" would quietly
                // stop matching "Aurora" after the Postgres migration.
                'search' => $query->where(function ($q) use ($value): void {
                    $q->whereLike('title', "%$value%", caseSensitive: false)
                        ->orWhereLike('venue', "%$value%", caseSensitive: false);
                }),
                'venue' => $query->whereLike('venue', "%$value%", caseSensitive: false),
            };
        }

        $sortBy = in_array($sortBy, self::SORTABLE, true) ? $sortBy : 'created_at';
        $sortOrder = strtolower($sortOrder) === 'asc' ? 'asc' : 'desc';

        $query->orderBy($sortBy, $sortOrder);

        return $query->paginate($this->clampPerPage($perPage));
    }

    /**
     * Keep the requested page size within sane bounds.
     */
    private function clampPerPage(int $perPage): int
    {
        return max(1, min($perPage, self::MAX_PER_PAGE));
    }

    /**
     * Find a single event or throw a ModelNotFoundException.
     *
     * @return Event
     */
    public function find($id)
    {
        return Event::findOrFail($id);
    }

    /**
     * Create a new event.
     *
     * @return Event
     */
    public function create(array $data)
    {
        return Event::create($data);
    }

    /**
     * Update an existing event.
     *
     * @return Event
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
