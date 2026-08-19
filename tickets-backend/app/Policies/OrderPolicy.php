<?php

namespace App\Policies;

use App\Models\Order;
use App\Models\User;

/**
 * Decides who may read or act on an individual order.
 *
 * Before this existed, any authenticated account could fetch any order by id
 * and pay it, and the order list returned every customer's name and email
 * address to anyone with a token.
 */
class OrderPolicy
{
    /**
     * Whether the user may view this order.
     */
    public function view(User $user, Order $order): bool
    {
        return $user->isAdmin() || $this->owns($user, $order);
    }

    /**
     * Whether the user may pay this order.
     */
    public function pay(User $user, Order $order): bool
    {
        return $user->isAdmin() || $this->owns($user, $order);
    }

    /**
     * Whether the user may cancel this order.
     */
    public function cancel(User $user, Order $order): bool
    {
        return $user->isAdmin() || $this->owns($user, $order);
    }

    /**
     * Whether the user may refund this order.
     *
     * Refunds move money, so they are an administrator action only. A customer
     * asks; an administrator decides.
     */
    public function refund(User $user, Order $order): bool
    {
        return $user->isAdmin();
    }

    /**
     * Whether this order belongs to this user.
     *
     * `orders.user_id` is nullable and stays that way: rows that predate the
     * column, and any future guest checkout, have no owner. The explicit null
     * check is the point of this method — without it, a user whose own id
     * were somehow null would match every ownerless order, and `null === null`
     * fails open rather than closed. Ownerless orders are visible to
     * administrators only.
     */
    private function owns(User $user, Order $order): bool
    {
        return $order->user_id !== null && $order->user_id === $user->id;
    }
}
