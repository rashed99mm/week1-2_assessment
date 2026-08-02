<?php

namespace Tests\Unit;

use App\Models\Event;
use App\Models\Order;
use App\Models\Payment;
use App\Models\TicketType;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Services\OrderService;
use App\Services\PaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use InvalidArgumentException;
use Mockery;
use Tests\TestCase;

/**
 * Unit tests for the OrderService business logic.
 */
class OrderServiceTest extends TestCase
{
    use RefreshDatabase;

    /** @var OrderRepositoryInterface|Mockery\MockInterface */
    protected $repo;

    /** @var PaymentService|Mockery\MockInterface */
    protected $paymentService;

    protected OrderService $service;

    /**
     * Build the service with mocked collaborators.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->repo = Mockery::mock(OrderRepositoryInterface::class);
        $this->paymentService = Mockery::mock(PaymentService::class);

        $this->service = new OrderService($this->repo, $this->paymentService);
    }

    /**
     * Create a seeded event, ticket type and order for tests.
     *
     * @param  array<string, mixed>  $attributes
     */
    private function makeOrder(array $attributes = []): Order
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
            'price' => 50.00,
            'quantity' => 10,
        ]);

        return Order::create(array_merge([
            'event_id' => $event->id,
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Jane Doe',
            'customer_email' => 'jane@example.com',
            'quantity' => 1,
            'unit_price' => 50.00,
            'total_amount' => 50.00,
            'status' => 'pending',
        ], $attributes));
    }

    /**
     * Verify create() computes unit price and total from the ticket type.
     */
    public function test_create_computes_prices_from_ticket_type(): void
    {
        $event = Event::create([
            'title' => 'Concert',
            'venue' => 'Stage',
            'starts_at' => now()->addDay(),
            'total_tickets' => 50,
        ]);
        $ticket = TicketType::create([
            'event_id' => $event->id,
            'name' => 'VIP',
            'price' => 75.00,
            'quantity' => 10,
        ]);

        $expected = new Order();
        $this->repo->shouldReceive('create')
            ->once()
            ->with(Mockery::on(function (array $data) use ($event, $ticket): bool {
                return $data['event_id'] === $event->id
                    && $data['ticket_type_id'] === $ticket->id
                    && $data['unit_price'] == 75.00
                    && $data['total_amount'] == 225.00
                    && $data['status'] === 'pending';
            }))
            ->andReturn($expected);

        $order = $this->service->create([
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'John',
            'customer_email' => 'john@example.com',
            'quantity' => 3,
        ]);

        $this->assertSame($expected, $order);
    }

    /**
     * Verify create() throws when the requested quantity exceeds availability.
     */
    public function test_create_throws_when_quantity_exceeds_availability(): void
    {
        $order = $this->makeOrder();

        $this->repo->shouldReceive('create')->never();

        $this->expectException(InvalidArgumentException::class);

        $this->service->create([
            'ticket_type_id' => $order->ticket_type_id,
            'customer_name' => 'John',
            'customer_email' => 'john@example.com',
            'quantity' => 99,
        ]);
    }

    /**
     * Verify pay() delegates to the payment service and returns its result.
     */
    public function test_pay_delegates_to_payment_service(): void
    {
        $order = $this->makeOrder();
        $payment = new Payment(['status' => 'success']);

        $this->repo->shouldReceive('find')->once()->with($order->id)->andReturn($order);
        $this->paymentService->shouldReceive('charge')
            ->once()
            ->with($order, '4242424242424242')
            ->andReturn($payment);

        $result = $this->service->pay($order->id, ['card_token' => '4242424242424242']);

        $this->assertSame($payment, $result);
    }

    /**
     * Verify pay() rejects orders that have already been paid.
     */
    public function test_pay_throws_when_order_is_already_paid(): void
    {
        $order = $this->makeOrder(['status' => 'paid']);

        $this->repo->shouldReceive('find')->once()->with($order->id)->andReturn($order);
        $this->paymentService->shouldReceive('charge')->never();

        $this->expectException(InvalidArgumentException::class);

        $this->service->pay($order->id, ['card_token' => '4242424242424242']);
    }
}
