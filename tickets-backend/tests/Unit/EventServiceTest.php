<?php

namespace Tests\Unit;

use App\Repositories\Contracts\EventRepositoryInterface;
use App\Services\EventService;
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
}
