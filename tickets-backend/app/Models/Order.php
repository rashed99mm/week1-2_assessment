<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Carbon;

/**
 * Eloquent model representing a customer ticket purchase.
 *
 * @property int $id
 * @property int|null $user_id
 * @property int $event_id
 * @property int $ticket_type_id
 * @property string $customer_name
 * @property string $customer_email
 * @property int $quantity
 * @property string $unit_price
 * @property string $total_amount
 * @property string $status
 * @property Carbon|null $expires_at
 */
class Order extends Model
{
    /**
     * Pending orders hold reserved stock until this deadline passes.
     */
    public const STATUS_PENDING = 'pending';

    public const STATUS_PAID = 'paid';

    public const STATUS_FAILED = 'failed';

    public const STATUS_REFUNDED = 'refunded';

    public const STATUS_CANCELLED = 'cancelled';

    /**
     * Statuses in which the order is still holding stock.
     *
     * Anything outside this set has already had its tickets returned, which is
     * what makes the restore operations safe to call more than once.
     *
     * @var array<int, string>
     */
    public const STATUSES_HOLDING_STOCK = [self::STATUS_PENDING, self::STATUS_PAID];

    /**
     * @var array<int, string>
     *
     * `user_id` is fillable, but OrderService is the only thing that sets it,
     * and it does so *after* spreading the request payload — so a caller who
     * puts `user_id` in the request body cannot file an order against someone
     * else's account.
     */
    protected $fillable = [
        'user_id', 'event_id', 'ticket_type_id', 'customer_name', 'customer_email',
        'quantity', 'unit_price', 'total_amount', 'status', 'expires_at',
    ];

    /** @var array<string, string> */
    protected $casts = [
        'unit_price' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'expires_at' => 'datetime',
    ];

    /**
     * The account that placed this order, if any.
     *
     * Null for rows that predate order ownership, and for guest checkout.
     *
     * @return BelongsTo<User>
     */
    public function user()
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The event this order belongs to.
     *
     * @return BelongsTo<Event>
     */
    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    /**
     * The ticket type purchased in this order.
     *
     * @return BelongsTo<TicketType>
     */
    public function ticketType()
    {
        return $this->belongsTo(TicketType::class);
    }

    /**
     * Payments recorded against this order.
     *
     * @return HasMany<Payment>
     */
    public function payments()
    {
        return $this->hasMany(Payment::class);
    }

    /**
     * Whether this order is still holding reserved tickets.
     *
     * Every path that returns stock checks this first, inside the same
     * transaction that locked the row. Without it, a refund racing the expiry
     * sweeper would return the same seats twice and inflate inventory.
     */
    public function holdsStock(): bool
    {
        return in_array($this->status, self::STATUSES_HOLDING_STOCK, true);
    }

    /**
     * Whether this pending order's reservation window has closed.
     */
    public function reservationHasExpired(): bool
    {
        return $this->status === self::STATUS_PENDING
            && $this->expires_at !== null
            && $this->expires_at->isPast();
    }
}
