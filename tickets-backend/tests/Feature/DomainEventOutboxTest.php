<?php

namespace Tests\Feature;

use App\Domain\Events\OrderCancelled;
use App\Exceptions\InsufficientStockException;
use App\Jobs\PublishDomainEvent;
use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\OrderService;
use App\Support\Messaging\EventPublisher;
use App\Support\Messaging\NullPublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * The transactional outbox.
 *
 * Two services outside this repository consume these events, and the analytics
 * service derives revenue from them. The properties that matter are that an
 * event is never emitted for a change that rolled back, never lost when a
 * change committed, and always shaped to the published contract.
 */
class DomainEventOutboxTest extends TestCase
{
    use AuthenticatesApi;
    use RefreshDatabase;

    private TicketType $ticketType;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateApi();

        $event = Event::create([
            'title' => 'Aurora Live',
            'venue' => 'Rooftop Arena',
            'starts_at' => now()->addDays(7)->toDateTimeString(),
            'total_tickets' => 10,
            'status' => 'draft',
        ]);

        $this->ticketType = TicketType::create([
            'event_id' => $event->id,
            'name' => 'Floor A',
            'price' => 75.00,
            'quantity' => 5,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function orderPayload(int $quantity = 2): array
    {
        return [
            'ticket_type_id' => $this->ticketType->id,
            'customer_name' => 'Ada Lovelace',
            'customer_email' => 'ada@example.com',
            'quantity' => $quantity,
        ];
    }

    /**
     * Fetch the single outbox row of the given type, decoded.
     *
     * @return array<string, mixed>
     */
    private function outboxRow(string $type): array
    {
        $row = DB::table('domain_events')->where('type', $type)->first();

        $this->assertNotNull($row, "Expected a [{$type}] event in the outbox.");

        return [
            'row' => $row,
            'payload' => json_decode($row->payload, true),
            'actor' => $row->actor === null ? null : json_decode($row->actor, true),
        ];
    }

    // -----------------------------------------------------------------
    // Recording
    // -----------------------------------------------------------------

    public function test_creating_an_order_records_an_event(): void
    {
        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        ['row' => $row, 'payload' => $payload] = $this->outboxRow('order.created');

        $this->assertSame(1, (int) $row->version);
        $this->assertTrue(Str::isUuid($row->id));

        $this->assertSame(2, $payload['quantity']);
        $this->assertSame('Aurora Live', $payload['eventTitle']);
        $this->assertSame('Floor A', $payload['ticketTypeName']);
        $this->assertSame('ada@example.com', $payload['customerEmail']);
    }

    /**
     * The property the outbox exists for.
     *
     * The event row and the stock decrement are written in one transaction, so
     * a failure after the decrement must leave neither behind. Publishing from
     * a model observer or a dispatched job cannot make this guarantee.
     */
    public function test_a_rolled_back_order_records_no_event(): void
    {
        // Asking for more than remains aborts after the availability check.
        $this->postJson('/api/v1/orders', $this->orderPayload(99))->assertStatus(422);

        $this->assertDatabaseCount('domain_events', 0);
        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(5, (int) $this->ticketType->fresh()->quantity);
    }

    public function test_an_exception_after_the_decrement_leaves_no_event(): void
    {
        // Force a failure inside the transaction, after stock was taken.
        $this->mock(OrderRepositoryInterface::class)
            ->shouldReceive('create')->andThrow(new \RuntimeException('boom'));

        try {
            app(OrderService::class)->create($this->orderPayload());
        } catch (\RuntimeException) {
            // expected
        }

        $this->assertDatabaseCount('domain_events', 0);
        $this->assertSame(5, (int) $this->ticketType->fresh()->quantity, 'Stock was not rolled back.');
    }

    public function test_registering_records_a_user_event(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'New Person',
            'email' => 'New.Person@Example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(201);

        ['payload' => $payload] = $this->outboxRow('user.registered');

        $this->assertSame('new.person@example.com', $payload['email']);
        $this->assertSame('user', $payload['role']);
    }

    public function test_publishing_an_event_records_it_on_the_transition_only(): void
    {
        $event = Event::create([
            'title' => 'Second Event',
            'starts_at' => now()->addDays(9)->toDateTimeString(),
            'total_tickets' => 50,
            'status' => 'draft',
        ]);

        $this->assertDatabaseCount('domain_events', 0);

        $event->update(['status' => 'published']);
        $this->assertSame(1, DB::table('domain_events')->where('type', 'event.published')->count());

        // Editing an already-published event must not re-announce it.
        $event->update(['venue' => 'A Different Room']);
        $this->assertSame(1, DB::table('domain_events')->where('type', 'event.published')->count());
    }

    public function test_paying_records_a_paid_event_with_the_gateway_reference(): void
    {
        $created = $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        Http::fake(['*/payments/charge' => Http::response([
            'success' => true, 'message' => 'ok', 'status_code' => 200,
            'data' => ['id' => 900, 'status' => 'success', 'gateway_reference' => 'TXN-ABC123'],
            'errors' => null,
        ], 200)]);

        $this->postJson("/api/v1/orders/{$created->json('data.id')}/pay", ['card_token' => '4242424242424242'])
            ->assertOk();

        ['payload' => $payload] = $this->outboxRow('order.paid');

        $this->assertSame('TXN-ABC123', $payload['gatewayReference']);
        $this->assertSame('150.00', $payload['totalAmount']);
    }

    public function test_the_expiry_sweeper_records_a_cancellation_with_no_actor(): void
    {
        $created = $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);
        Order::whereKey($created->json('data.id'))->update(['expires_at' => now()->subMinute()]);

        // Runs as a scheduled command, with no authenticated user.
        auth('api')->logout();
        $this->artisan('orders:expire-pending')->assertSuccessful();

        ['payload' => $payload, 'actor' => $actor] = $this->outboxRow('order.cancelled');

        $this->assertSame(OrderCancelled::REASON_EXPIRED, $payload['reason']);
        $this->assertNull($actor, 'A scheduled command has no actor.');
    }

    // -----------------------------------------------------------------
    // Wire contract
    // -----------------------------------------------------------------

    /**
     * Money must never cross the wire as a JSON number.
     *
     * json_decode gives Node a binary float and .NET a double; either drifts by
     * fractions of a cent, and the error only surfaces when someone reconciles
     * a revenue report against the orders behind it.
     */
    public function test_money_is_a_decimal_string(): void
    {
        $this->ticketType->update(['price' => 0.07, 'quantity' => 100]);

        $this->postJson('/api/v1/orders', $this->orderPayload(3))->assertStatus(201);

        ['payload' => $payload] = $this->outboxRow('order.created');

        $this->assertIsString($payload['unitPrice']);
        $this->assertIsString($payload['totalAmount']);
        $this->assertSame('0.07', $payload['unitPrice']);
        $this->assertSame('0.21', $payload['totalAmount']);
    }

    public function test_timestamps_are_utc_with_millisecond_precision(): void
    {
        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        ['payload' => $payload] = $this->outboxRow('order.created');

        $this->assertMatchesRegularExpression(
            '/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/',
            $payload['createdAt'],
            'Consumers parse RFC 3339 UTC with milliseconds; see docs/contracts/domain-events.md.'
        );
    }

    public function test_the_published_envelope_matches_the_contract(): void
    {
        // Bound before the order is placed: the test lane runs the queue
        // synchronously, so the relay job publishes inline during the request.
        $publisher = new RecordingPublisher;
        $this->app->instance(EventPublisher::class, $publisher);

        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        $this->assertNotEmpty($publisher->published, 'Nothing was published.');

        ['envelope' => $envelope, 'routingKey' => $routingKey] = $publisher->published[0];

        $this->assertSame(
            ['id', 'type', 'version', 'occurredAt', 'source', 'correlationId', 'actor', 'payload'],
            array_keys($envelope),
        );
        $this->assertSame('order.created', $envelope['type']);
        // The routing key is the event type — there is no second vocabulary.
        $this->assertSame($envelope['type'], $routingKey);
        $this->assertSame('tickets-backend', $envelope['source']);
        $this->assertIsArray($envelope['payload']);
        $this->assertSame(1, $envelope['version']);
    }

    // -----------------------------------------------------------------
    // Delivery
    // -----------------------------------------------------------------

    public function test_the_relay_job_is_dispatched_after_commit(): void
    {
        Queue::fake();

        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        Queue::assertPushed(PublishDomainEvent::class);
    }

    public function test_no_relay_job_is_dispatched_when_the_transaction_rolls_back(): void
    {
        Queue::fake();

        $this->postJson('/api/v1/orders', $this->orderPayload(99))->assertStatus(422);

        Queue::assertNothingPushed();
    }

    public function test_publishing_marks_the_row_and_is_not_repeated(): void
    {
        $publisher = new RecordingPublisher;
        $this->app->instance(EventPublisher::class, $publisher);

        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        $id = DB::table('domain_events')->where('type', 'order.created')->value('id');

        $row = DB::table('domain_events')->where('id', $id)->first();
        $this->assertNotNull($row->published_at, 'The relay job should have marked the row published.');
        $this->assertSame(1, (int) $row->attempts);
        $this->assertCount(1, $publisher->published);

        // A redelivered job must not republish or inflate the attempt count —
        // duplicates are cheap for consumers, but pointless work here.
        (new PublishDomainEvent($id))->handle($publisher);

        $this->assertCount(1, $publisher->published);
        $this->assertSame(1, (int) DB::table('domain_events')->where('id', $id)->value('attempts'));
    }

    public function test_the_relay_command_only_picks_up_stale_unpublished_rows(): void
    {
        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);
        $id = DB::table('domain_events')->value('id');

        // Simulate a publish that never happened — a worker that died between
        // the commit and picking the job up.
        DB::table('domain_events')->where('id', $id)->update(['published_at' => null]);

        // Faked only now, so the queue records what the relay dispatches
        // rather than what the original request did.
        Queue::fake();

        // Fresh row: its original job is presumably still queued, so
        // re-dispatching would only create a duplicate.
        $this->artisan('events:relay-unpublished')->assertSuccessful();
        Queue::assertNothingPushed();

        DB::table('domain_events')->where('id', $id)->update(['created_at' => now()->subHour()]);

        $this->artisan('events:relay-unpublished')->assertSuccessful();
        Queue::assertPushed(PublishDomainEvent::class);
    }

    public function test_the_relay_command_ignores_published_rows(): void
    {
        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        DB::table('domain_events')->update([
            'created_at' => now()->subHour(),
            'published_at' => now(),
        ]);

        Queue::fake();
        $this->artisan('events:relay-unpublished')->assertSuccessful();
        Queue::assertNothingPushed();
    }

    /**
     * Guards the escape hatch that keeps the test suites and a bare local
     * checkout working without a broker running.
     */
    public function test_the_null_publisher_is_bound_when_the_broker_is_disabled(): void
    {
        config(['messaging.enabled' => false]);
        $this->app->forgetInstance(EventPublisher::class);

        $this->assertInstanceOf(
            NullPublisher::class,
            app(EventPublisher::class),
        );
    }

    public function test_insufficient_stock_is_reported_before_any_event_is_recorded(): void
    {
        $this->postJson('/api/v1/orders', $this->orderPayload(5))->assertStatus(201);
        DB::table('domain_events')->delete();

        $this->expectException(InsufficientStockException::class);

        try {
            app(OrderService::class)->create($this->orderPayload(1));
        } finally {
            $this->assertDatabaseCount('domain_events', 0);
        }
    }
}

/**
 * An EventPublisher that keeps what it was given.
 *
 * A Mockery double would work, but the assertions here are about the shape of
 * the envelope rather than about call expectations, and reading them back off a
 * plain array is clearer than configuring a mock to capture arguments.
 */
class RecordingPublisher implements EventPublisher
{
    /** @var array<int, array{envelope: array<string, mixed>, routingKey: string}> */
    public array $published = [];

    public function publish(array $envelope, string $routingKey): void
    {
        $this->published[] = ['envelope' => $envelope, 'routingKey' => $routingKey];
    }
}
