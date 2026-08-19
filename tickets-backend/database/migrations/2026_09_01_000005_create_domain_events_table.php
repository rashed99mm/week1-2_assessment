<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The transactional outbox.
 *
 * Domain events are written here inside the same transaction as the business
 * change that produced them, then relayed to the broker afterwards.
 *
 * Publishing straight to RabbitMQ from a model observer or a queued job is
 * wrong in both directions: if the database commits while the broker is
 * unreachable the event is lost, and if the transaction rolls back after the
 * job was dispatched a phantom event is delivered for something that never
 * happened. The analytics service derives revenue figures from this stream, so
 * neither is acceptable.
 *
 * See docs/contracts/domain-events.md.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('domain_events', function (Blueprint $table): void {
            // UUID v7: time-ordered, so it sorts by creation and is safe to
            // use directly as a Mongo _id on the consumer side.
            $table->uuid('id')->primary();

            $table->string('type', 64);
            $table->unsignedSmallInteger('version')->default(1);

            // jsonb on PostgreSQL — queryable and indexable, which matters when
            // replaying or diagnosing a stuck event.
            $table->json('payload');

            $table->timestamp('occurred_at');
            $table->uuid('correlation_id')->nullable();
            $table->json('actor')->nullable();

            $table->timestamp('published_at')->nullable();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->text('last_error')->nullable();

            $table->timestamps();

            // The relay sweeps for unpublished rows oldest-first. A partial
            // index would be tighter, but this stays portable across engines
            // and the table is pruned once rows are published.
            $table->index(['published_at', 'occurred_at']);
            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domain_events');
    }
};
