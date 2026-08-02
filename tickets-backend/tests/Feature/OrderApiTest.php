<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * Feature tests for the Order REST endpoints and payment flow.
 */
class OrderApiTest extends TestCase
{
    use RefreshDatabase;
    use AuthenticatesApi;

    /**
     * Authenticate every request against the JWT guard.
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->authenticateApi();
    }

    /**
     * Seed an event and ticket type.
     */
    private function makeEventAndTicket(float $price = 50.00, int $quantity = 10): array
    {
        $event = Event::create([
            'title' => 'Test Event',
            'venue' => 'Main Hall',
            'starts_at' => now()->addDay(),
            'total_tickets' => 100,
        ]);

        $ticket = TicketType::create([
            'event_id' => $event->id,
            'name' => 'Standard',
            'price' => $price,
            'quantity' => $quantity,
        ]);

        return [$event, $ticket];
    }

    /**
     * Verify POST /api/orders creates a pending order with computed totals.
     */
    public function test_store_creates_order_with_computed_total(): void
    {
        [$event, $ticket] = $this->makeEventAndTicket(75.00);

        $response = $this->postJson('/api/orders', [
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Alice',
            'customer_email' => 'alice@example.com',
            'quantity' => 2,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.event_id', $event->id)
            ->assertJsonPath('data.unit_price', '75.00')
            ->assertJsonPath('data.total_amount', '150.00')
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('orders', ['ticket_type_id' => $ticket->id, 'total_amount' => 150.00]);
    }

    /**
     * Verify POST /api/orders rejects quantities beyond availability.
     */
    public function test_store_rejects_quantity_exceeding_availability(): void
    {
        [, $ticket] = $this->makeEventAndTicket(50.00, 5);

        $response = $this->postJson('/api/orders', [
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Alice',
            'customer_email' => 'alice@example.com',
            'quantity' => 99,
        ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    /**
     * Verify POST /api/orders validates required customer fields.
     */
    public function test_store_validates_customer_fields(): void
    {
        [, $ticket] = $this->makeEventAndTicket();

        $response = $this->postJson('/api/orders', [
            'ticket_type_id' => $ticket->id,
            'quantity' => 1,
        ]);

        $response->assertStatus(422);
    }

    /**
     * Verify GET /api/orders returns the order list.
     */
    public function test_index_returns_orders(): void
    {
        [$event, $ticket] = $this->makeEventAndTicket();
        Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Alice',
            'customer_email' => 'alice@example.com',
            'quantity' => 1,
            'unit_price' => 50.00,
            'total_amount' => 50.00,
            'status' => 'pending',
        ]);

        $this->getJson('/api/orders')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data');
    }

    /**
     * Verify POST /api/orders/{id}/pay marks the order paid on approval.
     */
    public function test_pay_marks_order_paid_on_approval(): void
    {
        [$event, $ticket] = $this->makeEventAndTicket();
        $order = Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Alice',
            'customer_email' => 'alice@example.com',
            'quantity' => 1,
            'unit_price' => 50.00,
            'total_amount' => 50.00,
            'status' => 'pending',
        ]);

        Http::fake([
            '*' => Http::response([
                'success' => true,
                'message' => 'Payment approved.',
                'status_code' => 200,
                'data' => ['status' => 'success', 'gateway_reference' => 'TXN-APPROVED'],
            ]),
        ]);

        $response = $this->postJson("/api/orders/{$order->id}/pay", ['card_token' => '4242424242424242']);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'success');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'paid']);
        $this->assertDatabaseHas('payments', ['order_id' => $order->id, 'status' => 'success']);
    }

    /**
     * Verify POST /api/orders/{id}/pay returns 400 and fails the order on decline.
     */
    public function test_pay_returns_400_and_fails_order_on_decline(): void
    {
        [$event, $ticket] = $this->makeEventAndTicket();
        $order = Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Alice',
            'customer_email' => 'alice@example.com',
            'quantity' => 1,
            'unit_price' => 50.00,
            'total_amount' => 50.00,
            'status' => 'pending',
        ]);

        Http::fake([
            '*' => Http::response([
                'success' => false,
                'message' => 'Payment declined by the gateway.',
                'status_code' => 400,
                'data' => ['status' => 'failed', 'gateway_reference' => 'TXN-DECLINED'],
            ]),
        ]);

        $response = $this->postJson("/api/orders/{$order->id}/pay", ['card_token' => '4000000000000002']);

        $response->assertStatus(400)
            ->assertJsonPath('success', false)
            ->assertJsonPath('message', 'Payment declined by the gateway.');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'failed']);
        $this->assertDatabaseHas('payments', ['order_id' => $order->id, 'status' => 'failed']);
    }

    /**
     * Verify POST /api/orders/{id}/pay rejects an already paid order.
     */
    public function test_pay_rejects_already_paid_order(): void
    {
        [$event, $ticket] = $this->makeEventAndTicket();
        $order = Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Alice',
            'customer_email' => 'alice@example.com',
            'quantity' => 1,
            'unit_price' => 50.00,
            'total_amount' => 50.00,
            'status' => 'paid',
        ]);

        Http::fake();

        $this->postJson("/api/orders/{$order->id}/pay", ['card_token' => '4242424242424242'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'Order has already been paid.');
    }
}
