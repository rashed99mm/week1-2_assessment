<?php

namespace App\Services;

use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use App\Repositories\Contracts\EventRepositoryInterface;
use Illuminate\Http\UploadedFile;
use Illuminate\Pagination\LengthAwarePaginator;

/**
 * Orchestrates business logic for Event resources.
 */
class EventService
{
    protected EventRepositoryInterface $repo;

    protected EventCoverService $covers;

    /**
     * Inject the event repository.
     *
     * @param  EventRepositoryInterface  $repo  Event persistence contract.
     * @param  EventCoverService|null  $covers  Cover-image file lifecycle. Optional
     *                                          so the service remains constructible without a container; the framework
     *                                          autowires the concrete class in the application.
     */
    public function __construct(EventRepositoryInterface $repo, ?EventCoverService $covers = null)
    {
        $this->repo = $repo;
        $this->covers = $covers ?? new EventCoverService;
    }

    /**
     * List events with filtering, sorting and pagination.
     *
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator
     */
    public function index(array $filters, string $sortBy, string $sortOrder, int $perPage)
    {
        return $this->repo->all($filters, $sortBy, $sortOrder, $perPage);
    }

    /**
     * Show a single event.
     *
     * @return Event
     */
    public function show($id)
    {
        return $this->repo->find($id);
    }

    /**
     * Compute per-ticket-type sold counts for an event.
     *
     * Public read-only view of how many seats are already taken, without
     * exposing any customer data. "Sold" includes paid and pending orders.
     *
     * @return array{event_id: int, event_type: array<string, mixed>|null, ticket_types: array<int, array<string, mixed>>}
     */
    public function availability($id)
    {
        $event = $this->repo->find($id);

        $ticketTypes = TicketType::where('event_id', $event->id)->orderBy('price')->get();

        $soldTotals = Order::where('event_id', $event->id)
            ->whereIn('status', ['paid', 'pending'])
            ->groupBy('ticket_type_id')
            ->selectRaw('ticket_type_id, SUM(quantity) as total')
            ->pluck('total', 'ticket_type_id');

        $ticketTypesData = $ticketTypes->map(function (TicketType $ticketType) use ($soldTotals): array {
            return [
                'ticket_type_id' => $ticketType->id,
                'name' => $ticketType->name,
                'price' => $ticketType->price,
                'quantity' => $ticketType->quantity,
                'sold' => (int) ($soldTotals[$ticketType->id] ?? 0),
            ];
        })->values()->all();

        return [
            'event_id' => $event->id,
            'event_type' => $event->eventType ? $event->eventType->toArray() : null,
            'ticket_types' => $ticketTypesData,
        ];
    }

    /**
     * Create a new event, storing an uploaded cover image if one is present.
     *
     * @return Event
     */
    public function create(array $data)
    {
        $file = $data['cover_image'] ?? null;

        // Fast path: no upload involved, so forward the payload untouched.
        if (! $file instanceof UploadedFile) {
            return $this->repo->create($data);
        }

        unset($data['cover_image']);
        $data['cover_image_path'] = $this->covers->store($file);

        return $this->repo->create($data);
    }

    /**
     * Update an existing event, replacing or clearing its cover as requested.
     *
     * A newly uploaded file always wins over the remove_cover flag.
     *
     * @return Event
     */
    public function update($id, array $data)
    {
        $file = $data['cover_image'] ?? null;
        $removeCover = $data['remove_cover'] ?? false;

        // Fast path: nothing cover-related, so forward id and payload untouched.
        if (! $file instanceof UploadedFile && $removeCover !== true) {
            return $this->repo->update($id, $data);
        }

        unset($data['cover_image'], $data['remove_cover']);

        // Throws ModelNotFoundException, which the controller maps to a 404.
        $oldPath = $this->repo->find($id)->cover_image_path;

        $data['cover_image_path'] = $file instanceof UploadedFile
            ? $this->covers->store($file)
            : null;

        $event = $this->repo->update($id, $data);

        if ($oldPath !== $data['cover_image_path']) {
            $this->covers->delete($oldPath);
        }

        return $event;
    }

    /**
     * Delete an event.
     *
     * The cover file is deliberately left on disk: events are soft-deleted, so
     * removing it would leave a restored event with a broken image. Orphaned
     * files are expected to be swept separately.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return $this->repo->delete($id);
    }
}
