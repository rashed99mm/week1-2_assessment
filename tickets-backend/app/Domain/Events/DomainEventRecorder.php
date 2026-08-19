<?php

namespace App\Domain\Events;

use App\Jobs\PublishDomainEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Writes domain events to the outbox and schedules them for delivery.
 *
 * The row is inserted on the caller's current connection, so when this is
 * called inside a transaction the event commits or rolls back together with
 * the change that produced it. There is no window in which the order exists
 * but the event does not, or vice versa.
 *
 * The relay job is dispatched via DB::afterCommit(), which is the other half
 * of the guarantee: a job dispatched inside a transaction can otherwise be
 * picked up by a worker before the transaction commits, and the worker then
 * reads a row that is not there yet.
 */
class DomainEventRecorder
{
    /**
     * Record an event and schedule it for publication.
     *
     * @return string The event id, which is also the consumers' idempotency key.
     */
    public function record(DomainEvent $event): string
    {
        $id = (string) Str::uuid7();

        DB::table('domain_events')->insert([
            'id' => $id,
            'type' => $event->type(),
            'version' => $event->version(),
            'payload' => json_encode($event->payload(), JSON_THROW_ON_ERROR),
            'occurred_at' => $event->occurredAt(),
            'correlation_id' => $this->correlationId(),
            'actor' => $event->actor() === null
                ? null
                : json_encode($event->actor(), JSON_THROW_ON_ERROR),
            'published_at' => null,
            'attempts' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::afterCommit(fn () => PublishDomainEvent::dispatch($id));

        return $id;
    }

    /**
     * A request-scoped id used to follow one user action across services.
     *
     * Taken from the incoming request when a proxy or client supplied one,
     * otherwise generated per request so the trace is at least internally
     * consistent.
     */
    private function correlationId(): ?string
    {
        $request = request();

        if ($request === null) {
            return null;
        }

        $header = $request->header('X-Correlation-Id');

        if (is_string($header) && Str::isUuid($header)) {
            return $header;
        }

        // Cached on the request so every event raised while handling it shares
        // one id.
        if (! $request->attributes->has('correlation_id')) {
            $request->attributes->set('correlation_id', (string) Str::uuid7());
        }

        return $request->attributes->get('correlation_id');
    }
}
