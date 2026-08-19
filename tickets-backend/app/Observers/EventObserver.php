<?php

namespace App\Observers;

use App\Domain\Events\DomainEventRecorder;
use App\Domain\Events\EventPublished as EventPublishedDomainEvent;
use App\Models\Event;

/**
 * Emits `event.published` when an event goes on sale.
 *
 * Lives in an observer rather than in EventService because the service works
 * through a repository that returns the model *after* the update, so the
 * previous status is not available to compare against. `wasChanged('status')`
 * answers the question directly, and covers any code path that writes an
 * event — including a future admin bulk action or a console command.
 */
class EventObserver
{
    public function __construct(private readonly DomainEventRecorder $recorder) {}

    /**
     * An event created directly in the published state.
     */
    public function created(Event $event): void
    {
        if ($event->status === 'published') {
            $this->recorder->record(new EventPublishedDomainEvent($event));
        }
    }

    /**
     * An event that transitioned into the published state.
     *
     * The wasChanged() guard is what makes this fire on the transition rather
     * than on every subsequent save — editing the venue of an already-published
     * event should not re-announce it to every consumer.
     */
    public function updated(Event $event): void
    {
        if ($event->wasChanged('status') && $event->status === 'published') {
            $this->recorder->record(new EventPublishedDomainEvent($event));
        }
    }
}
