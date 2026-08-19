<?php

namespace App\Services;

use App\Domain\Events\DomainEventRecorder;
use App\Domain\Events\OrderCancelled;
use App\Domain\Events\OrderCreated;
use App\Domain\Events\OrderRefunded;
use App\Exceptions\InsufficientStockException;
use App\Exceptions\PaymentFailedException;
use App\Models\Order;
use App\Models\Payment;
use App\Models\TicketType;
use App\Repositories\Contracts\OrderRepositoryInterface;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Orchestrates business logic for Order resources and their payments.
 *
 * Stock is reserved when an order is created, not when it is paid.
 *
 * The alternative — decrementing at payment — leaves a window where two
 * customers both hold a valid pending order for the last seat and one of them
 * is declined *after* being told the ticket was theirs. Reserving at creation
 * also matches what the storefront already shows: EventService::availability()
 * counts pending orders as sold, so "pending means reserved" is the contract
 * the UI has always described.
 *
 * The cost is that an abandoned checkout holds inventory. `orders.expires_at`
 * and the ExpirePendingOrders command reclaim it.
 */
class OrderService
{
    protected OrderRepositoryInterface $repo;

    protected PaymentService $paymentService;

    protected DomainEventRecorder $events;

    /**
     * Inject the order repository, payment service and event recorder.
     *
     * @param  OrderRepositoryInterface  $repo  Order persistence contract.
     * @param  PaymentService  $paymentService  Handles gateway communication.
     * @param  DomainEventRecorder  $events  Writes domain events to the outbox.
     */
    public function __construct(
        OrderRepositoryInterface $repo,
        PaymentService $paymentService,
        DomainEventRecorder $events,
    ) {
        $this->repo = $repo;
        $this->paymentService = $paymentService;
        $this->events = $events;
    }

    /**
     * List orders visible to the current caller.
     *
     * A normal user sees only their own orders. An administrator sees all of
     * them — the admin CMS needs the full list, and the alternative would be a
     * second code path that could drift from this one.
     *
     * The scope is resolved here and enforced inside the repository, so no
     * controller can produce an unscoped list by forgetting to ask for one.
     *
     * @param  array<string, mixed>  $filters
     * @return LengthAwarePaginator
     */
    public function index(array $filters = [], int $perPage = 15)
    {
        $user = auth('api')->user();

        return $this->repo->all(
            $filters,
            $user !== null && $user->isAdmin() ? null : auth('api')->id(),
            $perPage,
        );
    }

    /**
     * Show a single order.
     *
     * @return Order
     */
    public function show($id)
    {
        return $this->repo->find($id);
    }

    /**
     * Create an order, reserving its tickets atomically.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws InsufficientStockException When fewer tickets remain than requested.
     * @throws ModelNotFoundException When the ticket type does not exist.
     */
    public function create(array $data): Order
    {
        return DB::transaction(function () use ($data) {
            // SELECT ... FOR UPDATE. Concurrent creators for the same ticket
            // type queue here instead of all reading the same pre-sale count
            // and each concluding there is room.
            $ticketType = TicketType::whereKey($data['ticket_type_id'])
                ->lockForUpdate()
                ->first();

            if ($ticketType === null) {
                throw (new ModelNotFoundException)->setModel(TicketType::class);
            }

            $quantity = (int) $data['quantity'];

            if ($ticketType->quantity < $quantity) {
                throw new InsufficientStockException(
                    $ticketType->quantity === 0
                        ? "{$ticketType->name} is sold out."
                        : "Only {$ticketType->quantity} ticket(s) remain for {$ticketType->name}."
                );
            }

            // The WHERE clause is the guard that does not depend on the lock.
            // On SQLite, where lockForUpdate() is silently a no-op, this is
            // still a single atomic UPDATE that cannot take the balance
            // negative — it affects zero rows instead.
            $affected = TicketType::whereKey($ticketType->id)
                ->where('quantity', '>=', $quantity)
                ->decrement('quantity', $quantity);

            if ($affected === 0) {
                throw new InsufficientStockException('Tickets sold out while processing your order.');
            }

            $order = $this->repo->create([
                ...$data,
                // Listed after the spread so it always wins: a caller who puts
                // `user_id` in the request body cannot file an order against
                // someone else's account.
                'user_id' => auth('api')->id(),
                'event_id' => $ticketType->event_id,
                'unit_price' => $ticketType->price,
                // bcmul, not `*`. `price` is a decimal:2 cast and therefore a
                // string; multiplying it as a float drifts by fractions of a
                // cent, which only shows up once someone reconciles a revenue
                // report against the orders that produced it.
                'total_amount' => bcmul((string) $ticketType->price, (string) $quantity, 2),
                'status' => Order::STATUS_PENDING,
                'expires_at' => now()->addMinutes($this->reservationMinutes()),
            ]);

            // Recorded inside the reservation transaction: the event and the
            // stock decrement commit together or not at all. A consumer can
            // never see an order that was rolled back.
            $this->events->record(new OrderCreated($order));

            return $order;
        }, attempts: 3);
    }

    /**
     * Pay an order via the payment gateway.
     *
     * @param  array<string, mixed>  $data
     *
     * @throws InvalidArgumentException When the order is not in a payable state.
     * @throws PaymentFailedException When the gateway declines.
     */
    public function pay($id, array $data): Payment
    {
        $order = $this->repo->find($id);

        if ($order->status === Order::STATUS_PAID) {
            throw new InvalidArgumentException('Order has already been paid.');
        }

        // A reservation that lapsed before checkout finished no longer holds
        // its tickets, so paying it would sell stock already back in the pool.
        if ($order->reservationHasExpired()) {
            throw new InvalidArgumentException('This reservation has expired. Please start a new order.');
        }

        if ($order->status !== Order::STATUS_PENDING) {
            throw new InvalidArgumentException("An order with status '{$order->status}' cannot be paid.");
        }

        return $this->paymentService->charge($order, $data['card_token']);
    }

    /**
     * Cancel an order and return its tickets to the pool.
     *
     * @param  string|null  $reason  Carried on the emitted event. The expiry
     *                               sweeper passes OrderCancelled::REASON_EXPIRED.
     */
    public function cancel($id, ?string $reason = null): Order
    {
        $order = $this->transitionAndRestoreStock($id, Order::STATUS_CANCELLED, $reason);

        return $order;
    }

    /**
     * Refund a paid order and return its tickets to the pool.
     *
     * The gateway is called first: if it refuses, nothing local changes and the
     * order stays paid. Only once money has actually moved is the local state
     * updated and the event emitted.
     *
     * @throws PaymentFailedException When the gateway refuses.
     */
    public function refund($id, ?string $reason = null): Order
    {
        $order = $this->repo->find($id);

        if ($order->status !== Order::STATUS_PAID) {
            throw new InvalidArgumentException("An order with status '{$order->status}' cannot be refunded.");
        }

        $payment = $order->payments()
            ->where('status', 'success')
            ->latest('id')
            ->first();

        if ($payment === null) {
            throw new InvalidArgumentException('This order has no successful payment to refund.');
        }

        $this->paymentService->refund($payment, $reason);

        $refunded = $this->transitionAndRestoreStock($id, Order::STATUS_REFUNDED);

        $this->events->record(new OrderRefunded($refunded, $payment->fresh(), $reason));

        return $refunded;
    }

    /**
     * Move an order to a terminal status and return its stock, exactly once.
     *
     * Both the order row and the ticket-type row are locked, and the order's
     * *current* status is re-read inside the transaction. That re-read is the
     * point: without it, a refund arriving at the same moment as the expiry
     * sweeper would each act on the status they read before starting, and both
     * would return the same seats.
     *
     * @param  string  $newStatus  Terminal status to move to.
     * @param  string|null  $reason  Carried on the cancellation event, if any.
     */
    public function transitionAndRestoreStock($id, string $newStatus, ?string $reason = null): Order
    {
        return DB::transaction(function () use ($id, $newStatus, $reason) {
            $order = Order::whereKey($id)->lockForUpdate()->first();

            if ($order === null) {
                throw (new ModelNotFoundException)->setModel(Order::class);
            }

            // Already terminal: nothing held, nothing to give back. Returning
            // the order rather than throwing keeps this idempotent, which is
            // what a retried request or a redelivered job needs.
            if (! $order->holdsStock()) {
                return $order;
            }

            TicketType::whereKey($order->ticket_type_id)->lockForUpdate()->first();

            TicketType::whereKey($order->ticket_type_id)
                ->increment('quantity', $order->quantity);

            $order->status = $newStatus;
            $order->expires_at = null;
            $order->save();

            // Only cancellations are announced from here. A refund is emitted
            // by refund() once the gateway has confirmed, and a failed payment
            // is not a domain event anyone consumes — the decline is already
            // reported synchronously to the caller.
            if ($newStatus === Order::STATUS_CANCELLED) {
                $this->events->record(new OrderCancelled($order, $reason));
            }

            return $order;
        }, attempts: 3);
    }

    /**
     * How long a pending order holds its tickets.
     */
    private function reservationMinutes(): int
    {
        return (int) config('tickets.reservation_minutes', 15);
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
