<?php

namespace Tests\Unit;

use App\Repositories\Contracts\EventRepositoryInterface;
use App\Services\EventCoverService;
use App\Services\EventService;
use Illuminate\Http\UploadedFile;
use Mockery;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the EventService repository delegation.
 */
class EventServiceTest extends TestCase
{
    /** @var EventRepositoryInterface|Mockery\MockInterface */
    protected $repo;

    protected EventService $service;

    /**
     * Build the service with a mocked repository.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->repo = Mockery::mock(EventRepositoryInterface::class);
        $this->service = new EventService($this->repo);
    }

    /**
     * Verify index() forwards the query arguments to the repository.
     */
    public function test_index_forwards_to_repository(): void
    {
        $expected = ['data' => []];
        $this->repo->shouldReceive('all')
            ->once()
            ->with(['status' => 'published'], 'created_at', 'asc', 10)
            ->andReturn($expected);

        $this->assertSame($expected, $this->service->index(['status' => 'published'], 'created_at', 'asc', 10));
    }

    /**
     * Verify show() forwards the id to the repository.
     */
    public function test_show_forwards_to_repository(): void
    {
        $expected = ['id' => 1];
        $this->repo->shouldReceive('find')->once()->with(1)->andReturn($expected);

        $this->assertSame($expected, $this->service->show(1));
    }

    /**
     * Verify create() forwards the payload to the repository.
     */
    public function test_create_forwards_to_repository(): void
    {
        $expected = ['id' => 2];
        $data = ['title' => 'New Event'];
        $this->repo->shouldReceive('create')->once()->with($data)->andReturn($expected);

        $this->assertSame($expected, $this->service->create($data));
    }

    /**
     * Verify update() forwards the id and payload to the repository.
     */
    public function test_update_forwards_to_repository(): void
    {
        $expected = ['id' => 3];
        $data = ['title' => 'Updated'];
        $this->repo->shouldReceive('update')->once()->with(3, $data)->andReturn($expected);

        $this->assertSame($expected, $this->service->update(3, $data));
    }

    /**
     * Verify delete() forwards the id to the repository.
     */
    public function test_delete_forwards_to_repository(): void
    {
        $this->repo->shouldReceive('delete')->once()->with(4)->andReturn(true);

        $this->assertTrue($this->service->delete(4));
    }

    /**
     * Verify create() stores an uploaded cover and swaps the file for its path.
     */
    public function test_create_stores_the_cover_and_swaps_in_the_path(): void
    {
        $file = Mockery::mock(UploadedFile::class);
        $covers = Mockery::mock(EventCoverService::class);
        $covers->shouldReceive('store')->once()->with($file)->andReturn('covers/abc.jpg');

        $this->repo->shouldReceive('create')
            ->once()
            ->with(['title' => 'X', 'cover_image_path' => 'covers/abc.jpg'])
            ->andReturn(['id' => 9]);

        $service = new EventService($this->repo, $covers);

        $this->assertSame(['id' => 9], $service->create(['title' => 'X', 'cover_image' => $file]));
    }

    /**
     * Verify update() stores the replacement and deletes the previous file.
     */
    public function test_update_replaces_the_cover_and_deletes_the_old_file(): void
    {
        $file = Mockery::mock(UploadedFile::class);
        $existing = (object) ['cover_image_path' => 'covers/old.jpg'];

        $covers = Mockery::mock(EventCoverService::class);
        $covers->shouldReceive('store')->once()->with($file)->andReturn('covers/new.jpg');
        $covers->shouldReceive('delete')->once()->with('covers/old.jpg');

        $this->repo->shouldReceive('find')->once()->with(3)->andReturn($existing);
        $this->repo->shouldReceive('update')
            ->once()
            ->with(3, ['title' => 'Y', 'cover_image_path' => 'covers/new.jpg'])
            ->andReturn(['id' => 3]);

        $service = new EventService($this->repo, $covers);

        $this->assertSame(
            ['id' => 3],
            $service->update(3, ['title' => 'Y', 'cover_image' => $file]),
        );
    }

    /**
     * Verify remove_cover nulls the column and deletes the stored file.
     */
    public function test_update_clears_the_cover_when_remove_cover_is_true(): void
    {
        $existing = (object) ['cover_image_path' => 'covers/old.jpg'];

        $covers = Mockery::mock(EventCoverService::class);
        $covers->shouldReceive('delete')->once()->with('covers/old.jpg');

        $this->repo->shouldReceive('find')->once()->with(5)->andReturn($existing);
        $this->repo->shouldReceive('update')
            ->once()
            ->with(5, ['cover_image_path' => null])
            ->andReturn(['id' => 5]);

        $service = new EventService($this->repo, $covers);

        $this->assertSame(['id' => 5], $service->update(5, ['remove_cover' => true]));
    }

    /**
     * Verify a falsy remove_cover flag still takes the fast path, so a plain
     * update never loads the event or touches the filesystem.
     */
    public function test_update_without_cover_changes_never_loads_the_event(): void
    {
        $covers = Mockery::mock(EventCoverService::class);
        $covers->shouldNotReceive('store');
        $covers->shouldNotReceive('delete');

        $data = ['title' => 'Z', 'remove_cover' => false];
        $this->repo->shouldReceive('update')->once()->with(7, $data)->andReturn(['id' => 7]);

        $service = new EventService($this->repo, $covers);

        $this->assertSame(['id' => 7], $service->update(7, $data));
    }
}
