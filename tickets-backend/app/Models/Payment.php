<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Eloquent model representing a payment made through the gateway.
 *
 * @property int $id
 * @property int $order_id
 * @property float $amount
 * @property string $currency
 * @property string $status
 * @property string|null $gateway_reference
 * @property int|null $gateway_payment_id
 * @property Carbon|null $paid_at
 */
class Payment extends Model
{
    /** @var array<int, string> */
    protected $fillable = [
        'order_id', 'amount', 'currency', 'status', 'gateway_reference',
        'gateway_payment_id', 'paid_at',
    ];

    /** @var array<string, string> */
    protected $casts = [
        'paid_at' => 'datetime',
        'amount' => 'decimal:2',
        'gateway_payment_id' => 'integer',
    ];

    /**
     * The order this payment belongs to.
     *
     * @return BelongsTo<Order>
     */
    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
