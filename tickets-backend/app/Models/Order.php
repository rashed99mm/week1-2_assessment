<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Eloquent model representing a customer ticket purchase.
 *
 * @property int $id
 * @property int $event_id
 * @property int $ticket_type_id
 * @property string $customer_name
 * @property string $customer_email
 * @property int $quantity
 * @property float $unit_price
 * @property float $total_amount
 * @property string $status
 */
class Order extends Model
{
    /** @var array<int, string> */
    protected $fillable = [
        'event_id', 'ticket_type_id', 'customer_name', 'customer_email',
        'quantity', 'unit_price', 'total_amount', 'status',
    ];

    /** @var array<string, string> */
    protected $casts = [
        'unit_price' => 'decimal:2',
        'total_amount' => 'decimal:2',
    ];

    /**
     * The event this order belongs to.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<Event>
     */
    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    /**
     * The ticket type purchased in this order.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<TicketType>
     */
    public function ticketType()
    {
        return $this->belongsTo(TicketType::class);
    }

    /**
     * Payments recorded against this order.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<Payment>
     */
    public function payments()
    {
        return $this->hasMany(Payment::class);
    }
}
