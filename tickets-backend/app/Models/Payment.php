<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Eloquent model representing a payment made through the gateway.
 *
 * @property int $id
 * @property int $order_id
 * @property float $amount
 * @property string $currency
 * @property string $status
 * @property string|null $gateway_reference
 * @property \Illuminate\Support\Carbon|null $paid_at
 */
class Payment extends Model
{
    /** @var array<int, string> */
    protected $fillable = [
        'order_id', 'amount', 'currency', 'status', 'gateway_reference', 'paid_at',
    ];

    /** @var array<string, string> */
    protected $casts = [
        'paid_at' => 'datetime',
    ];

    /**
     * The order this payment belongs to.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<Order>
     */
    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
