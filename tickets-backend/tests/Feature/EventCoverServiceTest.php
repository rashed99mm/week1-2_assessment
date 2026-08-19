<?php

namespace Tests\Feature;

use App\Services\EventCoverService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Tests for the cover-image file lifecycle.
 *
 * Extends the framework TestCase because the service reaches the Storage facade,
 * which needs a booted container.
 */
class EventCoverServiceTest extends TestCase
{
    private EventCoverService $covers;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        $this->covers = new EventCoverService;
    }

    /**
     * Verify store() writes into the covers directory and returns its path.
     */
    public function test_store_writes_into_the_covers_directory(): void
    {
        $path = $this->covers->store(UploadedFile::fake()->image('poster.jpg'));

        $this->assertStringStartsWith('covers/', $path);
        Storage::disk('public')->assertExists($path);
    }

    /**
     * Verify store() ignores the client-supplied filename.
     */
    public function test_store_does_not_trust_the_client_filename(): void
    {
        $path = $this->covers->store(UploadedFile::fake()->image('../../evil.jpg'));

        $this->assertStringNotContainsString('..', $path);
        $this->assertStringNotContainsString('evil', $path);
    }

    /**
     * Verify delete() removes a stored cover.
     */
    public function test_delete_removes_a_stored_cover(): void
    {
        $path = $this->covers->store(UploadedFile::fake()->image('poster.jpg'));

        $this->covers->delete($path);

        Storage::disk('public')->assertMissing($path);
    }

    /**
     * Verify delete() refuses paths outside the covers directory, so a tampered
     * database value cannot delete arbitrary files.
     */
    public function test_delete_refuses_paths_outside_the_covers_directory(): void
    {
        Storage::disk('public')->put('important.txt', 'keep me');

        $this->covers->delete('important.txt');
        $this->covers->delete('../important.txt');
        $this->covers->delete(null);
        $this->covers->delete('');

        Storage::disk('public')->assertExists('important.txt');
    }
}
