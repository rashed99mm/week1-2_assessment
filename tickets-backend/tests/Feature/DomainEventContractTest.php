<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use App\Services\OrderService;
use App\Support\Messaging\EventPublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * Exports one envelope per event type for validation against the published
 * JSON Schema.
 *
 * The schema in docs/contracts/domain-events.schema.json is what the Node and
 * .NET consumers hand-write their types from. Nothing in PHP validates against
 * it, so without this the producer and the contract can drift silently and the
 * first symptom is a consumer dead-lettering messages in another repository.
 *
 * Writes to storage/framework/testing/domain-events/, which the CI job then
 * checks with a JSON Schema validator.
 */
class DomainEventContractTest extends TestCase
{
    use AuthenticatesApi;
    use RefreshDatabase;

    private function exportPath(): string
    {
        return storage_path('framework/testing/domain-events');
    }

    /**
     * Emit every event type once and write the envelopes out.
     */
    public function test_every_event_type_is_emitted_and_exported(): void
    {
        $publisher = new RecordingPublisher;
        $this->app->instance(EventPublisher::class, $publisher);

        // user.registered
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(201);

        $this->authenticateApi();

        // event.published
        $event = Event::create([
            'title' => 'Aurora Live',
            'venue' => 'Rooftop Arena',
            'starts_at' => now()->addDays(7)->toDateTimeString(),
            'ends_at' => now()->addDays(7)->addHours(4)->toDateTimeString(),
            'total_tickets' => 10,
            'status' => 'draft',
        ]);
        $event->update(['status' => 'published']);

        $ticketType = TicketType::create([
            'event_id' => $event->id,
            'name' => 'Floor A',
            'price' => 75.00,
            'quantity' => 5,
        ]);

        $payload = [
            'ticket_type_id' => $ticketType->id,
            'customer_name' => 'Ada Lovelace',
            'customer_email' => 'ada@example.com',
            'quantity' => 2,
        ];

        // order.created
        $created = $this->postJson('/api/v1/orders', $payload)->assertStatus(201);
        $orderId = $created->json('data.id');

        // order.paid
        Http::fake([
            '*/payments/charge' => Http::response([
                'success' => true, 'message' => 'ok', 'status_code' => 200,
                'data' => ['id' => 900, 'status' => 'success', 'gateway_reference' => 'TXN-ABC123'],
                'errors' => null,
            ], 200),
            '*/refund' => Http::response([
                'success' => true, 'message' => 'ok', 'status_code' => 200,
                'data' => ['id' => 900, 'status' => 'refunded', 'gateway_reference' => 'TXN-ABC123'],
                'errors' => null,
            ], 200),
        ]);

        $this->postJson("/api/v1/orders/{$orderId}/pay", ['card_token' => '4242424242424242'])->assertOk();

        // order.refunded
        app(OrderService::class)->refund($orderId, 'Customer request');

        // order.cancelled
        $second = $this->postJson('/api/v1/orders', $payload)->assertStatus(201);
        Order::whereKey($second->json('data.id'))->update(['expires_at' => now()->subMinute()]);
        $this->artisan('orders:expire-pending')->assertSuccessful();

        $byType = [];

        foreach ($publisher->published as $entry) {
            $byType[$entry['envelope']['type']] ??= $entry['envelope'];
        }

        $expected = [
            'user.registered', 'event.published', 'order.created',
            'order.paid', 'order.refunded', 'order.cancelled',
        ];

        foreach ($expected as $type) {
            $this->assertArrayHasKey($type, $byType, "No [{$type}] envelope was published.");
        }

        if (! is_dir($this->exportPath())) {
            mkdir($this->exportPath(), recursive: true);
        }

        file_put_contents(
            $this->exportPath().'/envelopes.json',
            json_encode(array_values($byType), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES),
        );

        $this->assertFileExists($this->exportPath().'/envelopes.json');
    }
}
