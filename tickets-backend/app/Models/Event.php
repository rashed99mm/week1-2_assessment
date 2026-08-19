<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * Eloquent model representing an event that sells tickets.
 *
 * @property int $id
 * @property string $title
 * @property string|null $description
 * @property string|null $venue
 * @property string|null $cover_image_path Path on the `public` disk, e.g. "covers/ab12….jpg".
 * @property-read string|null $cover_image_url Absolute, browser-usable URL, or null when unset.
 * @property Carbon $starts_at
 * @property Carbon|null $ends_at
 * @property int $total_tickets
 * @property string $status
 */
class Event extends Model
{
    use SoftDeletes;

    /** @var array<int, string> */
    protected $fillable = [
        'title', 'description', 'venue', 'event_type_id', 'cover_image_path',
        'starts_at', 'ends_at', 'total_tickets', 'status',
    ];

    /** @var array<int, string> */
    protected $with = ['eventType'];

    /** @var array<int, string> */
    protected $appends = ['cover_image_url'];

    /** @var array<string, string> */
    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];

    /**
     * Absolute URL of the cover image, or null when the event has no cover.
     *
     * Built with asset() rather than Storage::disk('public')->url(): the public
     * disk's URL is hard-wired to APP_URL, whereas asset() derives the root from
     * the current request, so it stays correct behind the Vite dev proxy, on
     * `php artisan serve`, and in production alike.
     *
     * @return Attribute<string|null, never>
     */
    protected function coverImageUrl(): Attribute
    {
        return Attribute::get(fn (): ?string => filled($this->cover_image_path)
            ? asset('storage/'.ltrim((string) $this->cover_image_path, '/'))
            : null);
    }

    /**
     * The type / category this event belongs to.
     *
     * @return BelongsTo<EventType>
     */
    public function eventType()
    {
        return $this->belongsTo(EventType::class);
    }

    /**
     * Ticket types available for this event.
     *
     * @return HasMany<TicketType>
     */
    public function ticketTypes()
    {
        return $this->hasMany(TicketType::class);
    }

    /**
     * Orders placed against this event.
     *
     * @return HasMany<Order>
     */
    public function orders()
    {
        return $this->hasMany(Order::class);
    }
}
