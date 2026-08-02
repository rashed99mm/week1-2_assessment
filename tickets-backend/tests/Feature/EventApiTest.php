<?php

namespace Tests\Feature;

use App\Models\Event;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Feature tests for the Event REST endpoints.
 */
class EventApiTest extends TestCase
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
     * Verify GET /api/events returns the paginated envelope.
     */
    public function test_index_returns_paginated_events(): void
    {
        Event::create($this->eventPayload(['title' => 'First Event']));

        $response = $this->getJson('/api/events');

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('message', 'Events fetched successfully.')
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.title', 'First Event');
    }

    /**
     * Verify POST /api/events creates an event.
     */
    public function test_store_creates_event(): void
    {
        $response = $this->postJson('/api/events', $this->eventPayload());

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.title', 'Tech Conference');

        $this->assertDatabaseHas('events', ['title' => 'Tech Conference', 'status' => 'published']);
    }

    /**
     * Verify POST /api/events rejects a missing required title.
     */
    public function test_store_validates_required_fields(): void
    {
        $response = $this->postJson('/api/events', $this->eventPayload(['title' => null]));

        $response->assertStatus(422);
    }

    /**
     * Verify GET /api/events/{id} returns a single event.
     */
    public function test_show_returns_event(): void
    {
        $event = Event::create($this->eventPayload());

        $response = $this->getJson("/api/events/{$event->id}");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.id', $event->id);
    }

    /**
     * Verify GET /api/events/{id} returns 404 for missing events.
     */
    public function test_show_missing_event_returns_404(): void
    {
        $this->getJson('/api/events/999')->assertStatus(404);
    }

    /**
     * Verify PUT /api/events/{id} updates an event.
     */
    public function test_update_updates_event(): void
    {
        $event = Event::create($this->eventPayload());

        $response = $this->putJson("/api/events/{$event->id}", ['title' => 'Updated Title']);

        $response->assertOk()
            ->assertJsonPath('data.title', 'Updated Title');
    }

    /**
     * Verify DELETE /api/events/{id} soft deletes an event.
     */
    public function test_destroy_soft_deletes_event(): void
    {
        $event = Event::create($this->eventPayload());

        $this->deleteJson("/api/events/{$event->id}")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSoftDeleted('events', ['id' => $event->id]);
    }
}
