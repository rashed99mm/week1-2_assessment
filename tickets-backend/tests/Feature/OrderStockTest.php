<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use App\Services\OrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * The stock invariants.
 *
 * Orders never used to touch `ticket_types.quantity` at all. The only check
 * compared the request against the ticket type's *total* capacity, so a
 * hundred people could each buy the last seat and every one of them would be
 * told it worked.
 *
 * These are sequential tests and run on both engines. They cannot prove that
 * the row lock blocks a concurrent writer — that is what
 * OrderStockConcurrencyTest does, on PostgreSQL only — but they catch almost
 * every way this can regress.
 */
class OrderStockTest extends TestCase
{
    use AuthenticatesApi;
    use RefreshDatabase;

    private Event $event;

    private TicketType $ticketType;

    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateApi();

        $this->event = Event::create([
            'title' => 'Aurora Live',
            'venue' => 'Rooftop Arena',
            'starts_at' => now()->addDays(7)->toDateTimeString(),
            'total_tickets' => 10,
            'status' => 'published',
        ]);

        $this->ticketType = TicketType::create([
            'event_id' => $this->event->id,
            'name' => 'Floor A',
            'price' => 75.00,
            'quantity' => 5,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function orderPayload(int $quantity = 1): array
    {
        return [
            'ticket_type_id' => $this->ticketType->id,
            'customer_name' => 'Ada Lovelace',
            'customer_email' => 'ada@example.com',
            'quantity' => $quantity,
        ];
    }

    private function remainingStock(): int
    {
        return (int) $this->ticketType->fresh()->quantity;
    }

    /**
     * Approve or decline the next gateway charge.
     */
    private function fakeGateway(bool $approved, int $paymentId = 900): void
    {
        Http::fake([
            '*/payments/charge' => Http::response([
                'success' => $approved,
                'message' => $approved ? 'Payment approved.' : 'Card declined.',
                'status_code' => $approved ? 200 : 400,
                'data' => [
                    'id' => $paymentId,
                    'status' => $approved ? 'success' : 'failed',
                    'gateway_reference' => $approved ? 'TXN-TEST123456789' : null,
                ],
                'errors' => null,
            ], 200),
        ]);
    }

    // -----------------------------------------------------------------
    // Reserving
    // -----------------------------------------------------------------

    public function test_creating_an_order_decrements_stock(): void
    {
        $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);

        $this->assertSame(3, $this->remainingStock());
    }

    public function test_stock_decrements_exactly_once_per_order(): void
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/orders', $this->orderPayload(1))->assertStatus(201);
        }

        $this->assertSame(0, $this->remainingStock());
    }

    public function test_the_order_after_the_last_ticket_is_rejected(): void
    {
        $this->postJson('/api/orders', $this->orderPayload(5))->assertStatus(201);

        $this->postJson('/api/orders', $this->orderPayload(1))
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Floor A is sold out.');

        $this->assertSame(0, $this->remainingStock());
    }

    public function test_stock_never_goes_negative(): void
    {
        $this->postJson('/api/orders', $this->orderPayload(4))->assertStatus(201);

        // Asks for more than remains: must be refused outright, not clamped.
        $this->postJson('/api/orders', $this->orderPayload(3))->assertStatus(422);

        $this->assertSame(1, $this->remainingStock());
        $this->assertGreaterThanOrEqual(0, $this->remainingStock());
    }

    public function test_a_rejected_order_is_not_persisted(): void
    {
        $this->postJson('/api/orders', $this->orderPayload(99))->assertStatus(422);

        $this->assertDatabaseCount('orders', 0);
        $this->assertSame(5, $this->remainingStock());
    }

    public function test_total_is_computed_exactly_without_float_drift(): void
    {
        $this->ticketType->update(['price' => 0.07, 'quantity' => 1000]);

        $this->postJson('/api/orders', $this->orderPayload(3))
            ->assertStatus(201)
            // 0.07 * 3 is 0.21000000000000002 in binary floating point.
            ->assertJsonPath('data.total_amount', '0.21');
    }

    public function test_order_records_its_owner_and_a_reservation_deadline(): void
    {
        $user = $this->authenticateApi();

        $response = $this->postJson('/api/orders', $this->orderPayload())->assertStatus(201);

        $order = Order::find($response->json('data.id'));

        $this->assertSame($user->id, $order->user_id);
        $this->assertNotNull($order->expires_at);
        $this->assertTrue($order->expires_at->isFuture());
    }

    public function test_user_id_cannot_be_set_from_the_request_body(): void
    {
        $owner = $this->authenticateApi();

        $response = $this->postJson('/api/orders', [
            ...$this->orderPayload(),
            'user_id' => 99999,
        ])->assertStatus(201);

        $this->assertSame($owner->id, Order::find($response->json('data.id'))->user_id);
    }

    // -----------------------------------------------------------------
    // Releasing
    // -----------------------------------------------------------------

    public function test_a_declined_payment_returns_the_tickets(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);
        $this->assertSame(3, $this->remainingStock());

        $this->fakeGateway(approved: false);

        $this->postJson("/api/orders/{$created->json('data.id')}/pay", ['card_token' => '1111222233334444'])
            ->assertStatus(400);

        // Before this fix a declined card destroyed the inventory permanently.
        $this->assertSame(5, $this->remainingStock());
        $this->assertDatabaseHas('orders', [
            'id' => $created->json('data.id'),
            'status' => Order::STATUS_FAILED,
        ]);
    }

    public function test_a_successful_payment_keeps_the_tickets_sold(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);

        $this->fakeGateway(approved: true);

        $this->postJson("/api/orders/{$created->json('data.id')}/pay", ['card_token' => '4242424242424242'])
            ->assertOk();

        $this->assertSame(3, $this->remainingStock());
        $this->assertDatabaseHas('orders', [
            'id' => $created->json('data.id'),
            'status' => Order::STATUS_PAID,
            'expires_at' => null,
        ]);
    }

    public function test_cancelling_returns_the_tickets(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);

        app(OrderService::class)->cancel($created->json('data.id'));

        $this->assertSame(5, $this->remainingStock());
    }

    /**
     * The second-order bug that most oversell fixes introduce.
     *
     * A refund arriving at the same moment as the expiry sweeper must not
     * return the same seats twice. Both paths re-read the order's status under
     * a row lock, so whichever runs second finds nothing left to release.
     */
    public function test_releasing_the_same_order_twice_does_not_double_restore(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);
        $orderId = $created->json('data.id');

        $orders = app(OrderService::class);
        $orders->transitionAndRestoreStock($orderId, Order::STATUS_CANCELLED);
        $orders->transitionAndRestoreStock($orderId, Order::STATUS_REFUNDED);

        // 5, not 7. Inventory cannot be conjured by cancelling twice.
        $this->assertSame(5, $this->remainingStock());
        $this->assertDatabaseHas('orders', ['id' => $orderId, 'status' => Order::STATUS_CANCELLED]);
    }

    public function test_releasing_is_idempotent_and_reports_the_terminal_state(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload())->assertStatus(201);
        $orderId = $created->json('data.id');

        $orders = app(OrderService::class);
        $first = $orders->cancel($orderId);
        $second = $orders->cancel($orderId);

        $this->assertSame(Order::STATUS_CANCELLED, $first->status);
        $this->assertSame(Order::STATUS_CANCELLED, $second->status);
        $this->assertSame(5, $this->remainingStock());
    }

    // -----------------------------------------------------------------
    // Expiry
    // -----------------------------------------------------------------

    public function test_the_sweeper_releases_an_expired_reservation(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);

        Order::whereKey($created->json('data.id'))->update(['expires_at' => now()->subMinute()]);

        $this->artisan('orders:expire-pending')->assertSuccessful();

        $this->assertSame(5, $this->remainingStock());
        $this->assertDatabaseHas('orders', [
            'id' => $created->json('data.id'),
            'status' => Order::STATUS_CANCELLED,
        ]);
    }

    public function test_the_sweeper_leaves_live_reservations_alone(): void
    {
        $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);

        $this->artisan('orders:expire-pending')->assertSuccessful();

        $this->assertSame(3, $this->remainingStock());
    }

    public function test_the_sweeper_leaves_paid_orders_alone(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload(2))->assertStatus(201);
        $this->fakeGateway(approved: true);
        $this->postJson("/api/orders/{$created->json('data.id')}/pay", ['card_token' => '4242424242424242'])->assertOk();

        // Even with a stale deadline, a paid order is not a reservation.
        Order::whereKey($created->json('data.id'))->update(['expires_at' => now()->subDay()]);

        $this->artisan('orders:expire-pending')->assertSuccessful();

        $this->assertSame(3, $this->remainingStock());
        $this->assertDatabaseHas('orders', [
            'id' => $created->json('data.id'),
            'status' => Order::STATUS_PAID,
        ]);
    }

    public function test_an_expired_reservation_cannot_be_paid(): void
    {
        $created = $this->postJson('/api/orders', $this->orderPayload())->assertStatus(201);
        Order::whereKey($created->json('data.id'))->update(['expires_at' => now()->subMinute()]);

        $this->fakeGateway(approved: true);

        $this->postJson("/api/orders/{$created->json('data.id')}/pay", ['card_token' => '4242424242424242'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This reservation has expired. Please start a new order.');
    }
}
