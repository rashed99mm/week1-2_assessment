<?php

namespace App\Services;

use App\Exceptions\PaymentFailedException;
use App\Models\Order;
use App\Models\Payment;
use App\Models\TicketType;
use App\Repositories\Contracts\OrderRepositoryInterface;

/**
 * Orchestrates business logic for Order resources and their payments.
 */
class OrderService
{
    protected OrderRepositoryInterface $repo;

    protected PaymentService $paymentService;

    /**
     * Inject the order repository and payment service.
     *
     * @param  OrderRepositoryInterface  $repo  Order persistence contract.
     * @param  PaymentService  $paymentService  Handles gateway communication.
     */
    public function __construct(OrderRepositoryInterface $repo, PaymentService $paymentService)
    {
        $this->repo = $repo;
        $this->paymentService = $paymentService;
    }

    /**
     * List all orders with their relations.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, \App\Models\Order>
     */
    public function index()
    {
        return $this->repo->all();
    }

    /**
     * Show a single order.
     *
     * @return \App\Models\Order
     */
    public function show($id)
    {
        return $this->repo->find($id);
    }

    /**
     * Create an order for a given ticket type, computing unit and total price.
     *
     * @param  array<string, mixed>  $data
     * @return Order
     *
     * @throws \InvalidArgumentException When the requested quantity exceeds availability.
     */
    public function create(array $data): Order
    {
        $ticketType = TicketType::findOrFail($data['ticket_type_id']);

        if ($ticketType->quantity < $data['quantity']) {
            throw new \InvalidArgumentException('Not enough tickets available for the selected ticket type.');
        }

        $data['event_id'] = $ticketType->event_id;
        $data['unit_price'] = $ticketType->price;
        $data['total_amount'] = $ticketType->price * $data['quantity'];
        $data['status'] = 'pending';

        return $this->repo->create($data);
    }

    /**
     * Pay an order via the payment gateway.
     *
     * @param  array<string, mixed>  $data
     * @return Payment
     *
     * @throws \InvalidArgumentException When the order is already paid.
     * @throws PaymentFailedException When the gateway declines the payment.
     */
    public function pay($id, array $data): Payment
    {
        $order = $this->repo->find($id);

        if ($order->status === 'paid') {
            throw new \InvalidArgumentException('Order has already been paid.');
        }

        return $this->paymentService->charge($order, $data['card_token']);
    }

    /**
     * Delete an order.
     *
     * @return bool|null
     */
    public function delete($id)
    {
        return $this->repo->delete($id);
    }
}
