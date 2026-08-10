<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Eloquent model representing a category / format of event.
 *
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property bool $is_online
 * @property string $seating_model
 */
class EventType extends Model
{
    /** @var array<int, string> */
    protected $fillable = ['name', 'slug', 'is_online', 'seating_model'];

    /** @var array<string, string> */
    protected $casts = [
        'is_online' => 'boolean',
    ];

    /**
     * Events that belong to this type.
     *
     * @return \Illuminate\Database\Eloquent\Relations\HasMany<Event>
     */
    public function events()
    {
        return $this->hasMany(Event::class);
    }
}
