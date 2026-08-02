<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Eloquent model representing an event that sells tickets.
 *
 * @property int $id
 * @property string $title
 * @property string|null $description
 * @property string|null $venue
 * @property \Illuminate\Support\Carbon $starts_at
 * @property \Illuminate\Support\Carbon|null $ends_at
 * @property int $total_tickets
 * @property string $status
 */
class Event extends Model
{
    use SoftDeletes;

    /** @var array<int, string> */
    protected $fillable = [
        'title', 'description', 'venue', 'starts_at', 'ends_at', 'total_tickets', 'status',
    ];

    /** @var array<string, string> */
    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];

    /**
     * Ticket types available for this event.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<TicketType>
     */
    public function ticketTypes()
    {
        return $this->hasMany(TicketType::class);
    }

    /**
     * Orders placed against this event.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<Order>
     */
    public function orders()
    {
        return $this->hasMany(Order::class);
    }
}
