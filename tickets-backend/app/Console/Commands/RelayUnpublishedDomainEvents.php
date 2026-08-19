<?php

namespace App\Console\Commands;

use App\Jobs\PublishDomainEvent;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Re-dispatches outbox rows whose publish job never ran.
 *
 * DomainEventRecorder dispatches a job after the transaction commits, which
 * covers the normal path. It does not cover a worker dying between the commit
 * and picking the job up, a queue being flushed, or the job exhausting its
 * retries while the broker was down. This command is what makes the outbox a
 * guarantee rather than an optimistic gesture.
 *
 * Scheduled every minute in routes/console.php.
 */
class RelayUnpublishedDomainEvents extends Command
{
    protected $signature = 'events:relay-unpublished
                            {--limit= : Maximum rows to re-dispatch in one pass}';

    protected $description = 'Re-dispatch domain events that were never published to the broker';

    public function handle(): int
    {
        $staleAfter = now()->subMinutes((int) config('messaging.relay.stale_after_minutes'));
        $limit = (int) ($this->option('limit') ?: config('messaging.relay.batch_size'));

        // The age filter avoids racing the original dispatch: a row created
        // seconds ago most likely has a job sitting in the queue right now,
        // and re-dispatching it would just produce a duplicate.
        $query = DB::table('domain_events')
            ->whereNull('published_at')
            ->where('created_at', '<', $staleAfter)
            ->orderBy('occurred_at')
            ->limit($limit);

        // SKIP LOCKED lets several schedulers drain the backlog together
        // instead of queueing behind each other on the same rows. Passed as a
        // raw lock clause because the query builder has no skipLocked()
        // helper. Postgres only — SQLite has no row locks, and a single
        // process is the only realistic scenario there anyway.
        if (DB::connection()->getDriverName() === 'pgsql') {
            $query->lock('for update skip locked');
        }

        $ids = DB::transaction(fn () => $query->pluck('id'));

        if ($ids->isEmpty()) {
            $this->info('No unpublished domain events.');

            return self::SUCCESS;
        }

        foreach ($ids as $id) {
            PublishDomainEvent::dispatch($id);
        }

        // Worth surfacing loudly: a persistent backlog means the read models
        // are drifting from the system of record while orders keep succeeding,
        // so nothing else looks broken.
        $this->warn("Re-dispatched {$ids->count()} unpublished domain event(s).");

        return self::SUCCESS;
    }
}
