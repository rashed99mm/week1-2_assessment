<?php

namespace App\Domain\Events;

use App\Domain\Events\Concerns\SerialisesDomainValues;
use App\Models\Event;
use DateTimeInterface;

/**
 * An event went on sale.
 *
 * Fires on the transition into `published`, not on every save of an
 * already-published event — see EventObserver.
 *
 * Analytics stores `totalTickets` from here; it is the denominator of the
 * sell-through figure on the dashboard.
 */
class EventPublished implements DomainEvent
{
    use SerialisesDomainValues;

    public function __construct(private readonly Event $event) {}

    public function type(): string
    {
        return 'event.published';
    }

    public function version(): int
    {
        return 1;
    }

    public function occurredAt(): DateTimeInterface
    {
        return now();
    }

    public function payload(): array
    {
        $event = $this->event->loadMissing('eventType');

        return [
            'eventId' => (int) $event->id,
            'title' => $event->title,
            'venue' => $event->venue,
            'eventTypeId' => $this->nullableId($event->event_type_id),
            'eventTypeName' => $event->eventType?->name,
            'startsAt' => $this->timestamp($event->starts_at),
            'endsAt' => $this->timestamp($event->ends_at),
            'totalTickets' => (int) $event->total_tickets,
            'coverImageUrl' => $event->cover_image_url,
            'publishedAt' => $this->timestamp($this->occurredAt()),
        ];
    }

    public function actor(): ?array
    {
        $user = auth('api')->user();

        return $user === null ? null : ['userId' => (int) $user->id, 'role' => $user->role->value];
    }
}
