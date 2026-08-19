<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers how GET /api/events handles the query string.
 *
 * Every value here is attacker-controlled, and none of it was validated before:
 * an arbitrary `filters[<column>]` key reached the query builder, and an
 * unknown `sort_by` reached ORDER BY. These tests pin the allow-lists down.
 *
 * The search cases also guard the PostgreSQL migration. A plain `LIKE` is
 * case-insensitive on SQLite and case-sensitive on PostgreSQL, so a
 * lowercase query silently stopped matching a capitalised title. Nothing in the
 * original suite would have caught that.
 */
class EventListingQueryTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Build a valid event payload.
     *
     * @return array<string, mixed>
     */
    private function eventPayload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Tech Conference',
            'description' => 'A one day developer conference.',
            'venue' => 'Expo Center',
            'starts_at' => now()->addDays(2)->toDateTimeString(),
            'ends_at' => now()->addDays(2)->addHours(6)->toDateTimeString(),
            'total_tickets' => 200,
            'status' => 'published',
        ], $overrides);
    }

    /**
     * A lowercase search must match a capitalised title on every engine.
     */
    public function test_search_filter_is_case_insensitive_on_title(): void
    {
        Event::create($this->eventPayload(['title' => 'Aurora Live']));
        Event::create($this->eventPayload(['title' => 'Quiet Reading']));

        $response = $this->getJson('/api/events?filters[search]=aurora');

        $response->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.title', 'Aurora Live');
    }

    /**
     * The same must hold for the venue half of the search clause.
     */
    public function test_search_filter_is_case_insensitive_on_venue(): void
    {
        Event::create($this->eventPayload(['title' => 'Anything', 'venue' => 'Rooftop Arena']));

        $response = $this->getJson('/api/events?filters[search]=ROOFTOP');

        $response->assertOk()->assertJsonPath('data.total', 1);
    }

    /**
     * An unknown filter key must be ignored, not passed to the query builder.
     *
     * Before the allow-list this produced `where password like '%x%'`, which is
     * a 500 that confirms whether a column exists.
     */
    public function test_unknown_filter_key_is_ignored(): void
    {
        Event::create($this->eventPayload(['title' => 'Visible Event']));

        $response = $this->getJson('/api/events?filters[password]=x&filters[remember_token]=y');

        $response->assertOk()->assertJsonPath('data.total', 1);
    }

    /**
     * Known filters still work alongside the allow-list.
     */
    public function test_status_and_event_type_filters_still_apply(): void
    {
        $type = EventType::create([
            'name' => 'Concert', 'slug' => 'concert',
            'is_online' => false, 'seating_model' => 'assigned',
        ]);

        Event::create($this->eventPayload(['title' => 'Published One', 'status' => 'published', 'event_type_id' => $type->id]));
        Event::create($this->eventPayload(['title' => 'Draft One', 'status' => 'draft']));

        $this->getJson('/api/events?filters[status]=draft')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.title', 'Draft One');

        $this->getJson("/api/events?filters[event_type_id]={$type->id}")
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.title', 'Published One');
    }

    /**
     * An unsortable column must fall back to the default rather than 500.
     */
    public function test_unknown_sort_column_falls_back_to_default(): void
    {
        Event::create($this->eventPayload(['title' => 'Only Event']));

        $this->getJson('/api/events?sort_by=password&sort_order=asc')
            ->assertOk()
            ->assertJsonPath('data.total', 1);
    }

    /**
     * A sortable column must actually sort.
     */
    public function test_sortable_column_is_honoured(): void
    {
        Event::create($this->eventPayload(['title' => 'Bravo']));
        Event::create($this->eventPayload(['title' => 'Alpha']));

        $this->getJson('/api/events?sort_by=title&sort_order=asc')
            ->assertOk()
            ->assertJsonPath('data.data.0.title', 'Alpha');
    }

    /**
     * per_page must be clamped so one request cannot pull the whole table.
     */
    public function test_per_page_is_clamped(): void
    {
        Event::create($this->eventPayload());

        $this->getJson('/api/events?per_page=100000')
            ->assertOk()
            ->assertJsonPath('data.per_page', 100);

        $this->getJson('/api/events?per_page=0')
            ->assertOk()
            ->assertJsonPath('data.per_page', 1);
    }

    /**
     * A scalar `filters` must not be a TypeError against the array parameter.
     */
    public function test_scalar_filters_parameter_is_tolerated(): void
    {
        Event::create($this->eventPayload());

        $this->getJson('/api/events?filters=nonsense')
            ->assertOk()
            ->assertJsonPath('data.total', 1);
    }

    /**
     * An array `sort_by` must not be an "array to string conversion" error.
     */
    public function test_array_sort_parameter_is_tolerated(): void
    {
        Event::create($this->eventPayload());

        $this->getJson('/api/events?sort_by[]=title&sort_order[]=asc')
            ->assertOk()
            ->assertJsonPath('data.total', 1);
    }
}
