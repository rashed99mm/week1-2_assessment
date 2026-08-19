<?php

namespace Tests\Feature;

use App\Models\Event;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * Feature tests for the Event REST endpoints.
 */
class EventApiTest extends TestCase
{
    use AuthenticatesApi;
    use RefreshDatabase;

    /**
     * Authenticate every request against the JWT guard.
     */
    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->authenticateApi();
    }

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

    /**
     * Verify POST /api/events stores an uploaded cover and exposes its URL.
     *
     * Uses post() rather than postJson(): postJson encodes the body as JSON,
     * which would destroy the multipart payload and drop the file.
     */
    public function test_store_accepts_a_cover_image(): void
    {
        $response = $this->post('/api/events', $this->eventPayload([
            'cover_image' => UploadedFile::fake()->image('cover.jpg', 1200, 800),
        ]));

        $response->assertStatus(201);

        $path = $response->json('data.cover_image_path');

        $this->assertStringStartsWith('covers/', $path);
        Storage::disk('public')->assertExists($path);
        // Asserted as a suffix so the test does not pin APP_URL.
        $this->assertStringEndsWith('/storage/'.$path, $response->json('data.cover_image_url'));
    }

    /**
     * Verify an event without a cover exposes a null URL rather than a broken one.
     */
    public function test_event_without_a_cover_exposes_a_null_url(): void
    {
        $event = Event::create($this->eventPayload());

        $this->getJson("/api/events/{$event->id}")
            ->assertOk()
            ->assertJsonPath('data.cover_image_path', null)
            ->assertJsonPath('data.cover_image_url', null);
    }

    /**
     * Verify POST /api/events rejects an upload that is not an image.
     */
    public function test_store_rejects_a_non_image_upload(): void
    {
        $this->post('/api/events', $this->eventPayload([
            'cover_image' => UploadedFile::fake()->create('notes.pdf', 64, 'application/pdf'),
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('cover_image');
    }

    /**
     * Verify a replacement cover is stored and the previous file removed.
     */
    public function test_update_replaces_the_cover_and_deletes_the_old_file(): void
    {
        $event = Event::create($this->eventPayload());
        $oldPath = UploadedFile::fake()->image('old.jpg')->store('covers', 'public');
        $event->forceFill(['cover_image_path' => $oldPath])->save();

        $response = $this->post("/api/events/{$event->id}", [
            '_method' => 'PUT',
            'cover_image' => UploadedFile::fake()->image('new.jpg'),
        ]);

        $response->assertOk();
        $newPath = $response->json('data.cover_image_path');

        $this->assertNotSame($oldPath, $newPath);
        Storage::disk('public')->assertExists($newPath);
        Storage::disk('public')->assertMissing($oldPath);
    }

    /**
     * Verify remove_cover clears the column and deletes the file.
     */
    public function test_update_removes_the_cover_when_asked(): void
    {
        $event = Event::create($this->eventPayload());
        $path = UploadedFile::fake()->image('old.jpg')->store('covers', 'public');
        $event->forceFill(['cover_image_path' => $path])->save();

        $this->post("/api/events/{$event->id}", ['_method' => 'PUT', 'remove_cover' => '1'])
            ->assertOk()
            ->assertJsonPath('data.cover_image_path', null)
            ->assertJsonPath('data.cover_image_url', null);

        Storage::disk('public')->assertMissing($path);
        $this->assertNull($event->fresh()->cover_image_path);
    }

    /**
     * Regression guard for the cover-free fast path in EventService::update():
     * a plain JSON update must never touch the filesystem.
     */
    public function test_update_without_cover_fields_leaves_the_cover_alone(): void
    {
        $event = Event::create($this->eventPayload());
        $path = UploadedFile::fake()->image('keep.jpg')->store('covers', 'public');
        $event->forceFill(['cover_image_path' => $path])->save();

        $this->putJson("/api/events/{$event->id}", ['title' => 'Renamed'])->assertOk();

        Storage::disk('public')->assertExists($path);
        $this->assertSame($path, $event->fresh()->cover_image_path);
    }
}
