<?php

namespace App\Jobs;

use App\Support\Messaging\EventPublisher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Relays one outbox row to the message broker.
 *
 * Dispatched by DomainEventRecorder after the originating transaction commits,
 * and re-dispatched by `events:relay-unpublished` for rows whose first attempt
 * never happened.
 *
 * Publishing is at-least-once by design: this job can succeed at the broker and
 * then fail before marking the row published, producing a duplicate on the
 * retry. That is the trade the outbox makes — duplicates are cheap because
 * consumers dedupe on the envelope id, whereas a lost revenue event is not
 * recoverable.
 */
class PublishDomainEvent implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    /**
     * Backing off in seconds rather than retrying tightly: the usual reason
     * this fails is that the broker is restarting, and hammering it does not
     * help it come back.
     *
     * @var array<int, int>
     */
    public array $backoff = [5, 15, 60, 300];

    public function __construct(public readonly string $eventId) {}

    public function handle(EventPublisher $publisher): void
    {
        $row = DB::table('domain_events')->where('id', $this->eventId)->first();

        if ($row === null) {
            // The originating transaction rolled back after this job was
            // queued, or the row was pruned. Nothing to publish.
            return;
        }

        if ($row->published_at !== null) {
            // Already relayed — the relay command and the original dispatch
            // both reached it. Not an error.
            return;
        }

        DB::table('domain_events')->where('id', $this->eventId)->update([
            'attempts' => $row->attempts + 1,
            'updated_at' => now(),
        ]);

        $publisher->publish($this->envelopeFrom($row), $row->type);

        DB::table('domain_events')->where('id', $this->eventId)->update([
            'published_at' => now(),
            'last_error' => null,
            'updated_at' => now(),
        ]);
    }

    /**
     * Rebuild the wire envelope from the stored row.
     *
     * Shaped exactly as docs/contracts/domain-events.md specifies; two services
     * outside this repository parse it.
     *
     * @return array<string, mixed>
     */
    private function envelopeFrom(object $row): array
    {
        return [
            'id' => $row->id,
            'type' => $row->type,
            'version' => (int) $row->version,
            'occurredAt' => Carbon::parse($row->occurred_at)
                ->utc()->format('Y-m-d\TH:i:s.v\Z'),
            'source' => config('messaging.source'),
            'correlationId' => $row->correlation_id,
            'actor' => $row->actor === null ? null : json_decode($row->actor, true),
            'payload' => json_decode($row->payload, true),
        ];
    }

    /**
     * Record why the final attempt failed.
     *
     * The row stays unpublished, so the relay command keeps it visible and the
     * "unpublished events older than N minutes" alarm fires.
     */
    public function failed(Throwable $e): void
    {
        DB::table('domain_events')->where('id', $this->eventId)->update([
            'last_error' => mb_substr($e->getMessage(), 0, 2000),
            'updated_at' => now(),
        ]);
    }
}
