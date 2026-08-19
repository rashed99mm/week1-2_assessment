<?php

namespace App\Console\Commands;

use App\Domain\Events\OrderCancelled;
use App\Models\Order;
use App\Services\OrderService;
use Illuminate\Console\Command;

/**
 * Return tickets held by pending orders whose reservation window has closed.
 *
 * Stock is reserved at order creation, so without this an abandoned checkout
 * holds its seats permanently and a popular event sells out to carts nobody
 * ever intends to pay for.
 *
 * Scheduled every minute in routes/console.php.
 */
class ExpirePendingOrders extends Command
{
    protected $signature = 'orders:expire-pending
                            {--limit=500 : Maximum orders to release in one pass}';

    protected $description = 'Cancel pending orders past their reservation deadline and return their tickets to stock';

    public function handle(OrderService $orders): int
    {
        // Ids first, then release each in its own transaction. Holding one
        // transaction across the whole sweep would block every checkout for
        // the affected ticket types until it finished.
        $expired = Order::query()
            ->where('status', Order::STATUS_PENDING)
            ->whereNotNull('expires_at')
            ->where('expires_at', '<', now())
            ->orderBy('id')
            ->limit((int) $this->option('limit'))
            ->pluck('id');

        if ($expired->isEmpty()) {
            $this->info('No expired reservations.');

            return self::SUCCESS;
        }

        $released = 0;

        foreach ($expired as $id) {
            // transitionAndRestoreStock re-checks the status under a row lock,
            // so an order paid in the moment between the query above and this
            // call is left alone rather than having its tickets taken back.
            $order = $orders->transitionAndRestoreStock(
                $id,
                Order::STATUS_CANCELLED,
                OrderCancelled::REASON_EXPIRED,
            );

            if ($order->status === Order::STATUS_CANCELLED) {
                $released++;
            }
        }

        $this->info("Released {$released} expired reservation(s).");

        return self::SUCCESS;
    }
}
