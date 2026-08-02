<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Eloquent model representing a purchasable ticket type for an event.
 *
 * @property int $id
 * @property int $event_id
 * @property string $name
 * @property float $price
 * @property int $quantity
 */
class TicketType extends Model
{
    /** @var array<int, string> */
    protected $fillable = ['event_id', 'name', 'price', 'quantity'];

    /** @var array<string, string> */
    protected $casts = [
        'price' => 'decimal:2',
    ];

    /**
     * The event this ticket type belongs to.
     *
     * @return \Illuminate\Database\Eloquent\Relations\BelongsTo<Event>
     */
    public function event()
    {
        return $this->belongsTo(Event::class);
    }

    /**
     * Orders created for this ticket type.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<Order>
     */
    public function orders()
    {
        return $this->hasMany(Order::class);
    }
}
