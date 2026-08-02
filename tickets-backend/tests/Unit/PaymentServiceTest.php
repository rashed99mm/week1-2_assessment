<?php

namespace Tests\Unit;

use App\Exceptions\PaymentFailedException;
use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use App\Services\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Unit tests for the PaymentService gateway integration.
 */
class PaymentServiceTest extends TestCase
{
    use RefreshDatabase;

    protected PaymentService $service;

    /**
     * Build the service under test.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->service = new PaymentService();
    }

    /**
     * Create a seeded pending order worth 150.00.
     */
    private function makeOrder(): Order
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
            'price' => 150.00,
            'quantity' => 10,
        ]);

        return Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Jane Doe',
            'customer_email' => 'jane@example.com',
            'quantity' => 1,
            'unit_price' => 150.00,
            'total_amount' => 150.00,
            'status' => 'pending',
        ]);
    }

    /**
     * Verify an approved charge records the payment and marks the order paid.
     */
    public function test_charge_records_success_and_marks_order_paid(): void
    {
        $order = $this->makeOrder();

        Http::fake([
            '*' => Http::response([
                'success' => true,
                'message' => 'Payment approved.',
                'status_code' => 200,
                'data' => ['status' => 'success', 'gateway_reference' => 'TXN-123'],
            ]),
        ]);

        $payment = $this->service->charge($order, '4242424242424242');

        $this->assertSame('success', $payment->status);
        $this->assertSame('TXN-123', $payment->gateway_reference);
        $this->assertNotNull($payment->paid_at);
        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => 'paid']);
        $this->assertDatabaseHas('payments', ['order_id' => $order->id, 'status' => 'success']);
    }

    /**
     * Verify a declined charge records the failure and throws.
     */
    public function test_charge_declined_marks_order_failed_and_throws(): void
    {
        $order = $this->makeOrder();

        Http::fake([
            '*' => Http::response([
                'success' => false,
                'message' => 'Payment declined by the gateway.',
                'status_code' => 400,
                'data' => ['status' => 'failed', 'gateway_reference' => 'TXN-456'],
            ]),
        ]);

        try {
            $this->service->charge($order, '4000000000000002');
            $this->fail('Expected PaymentFailedException to be thrown.');
        } catch (PaymentFailedException $e) {
            $this->assertSame('Payment declined by the gateway.', $e->getMessage());
        }

        $this->assertSame('failed', $order->fresh()->status);
        $this->assertDatabaseHas('payments', ['order_id' => $order->id, 'status' => 'failed']);
    }

    /**
     * Verify an unreachable gateway surfaces as a payment failure.
     */
    public function test_charge_throws_when_gateway_is_unreachable(): void
    {
        $order = $this->makeOrder();

        Http::fake([
            '*' => Http::response('server error', 500),
        ]);

        $this->expectException(PaymentFailedException::class);
        $this->expectExceptionMessage('Payment gateway is unreachable.');

        $this->service->charge($order, '4242424242424242');
    }
}
