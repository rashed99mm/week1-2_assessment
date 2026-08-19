<?php

namespace Tests\Unit;

use App\Exceptions\ResourceInUseException;
use App\Models\TicketType;
use App\Repositories\Contracts\TicketTypeRepositoryInterface;
use App\Services\TicketTypeService;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Mockery;
use PHPUnit\Framework\TestCase;

/**
 * Unit tests for the TicketTypeService repository delegation.
 */
class TicketTypeServiceTest extends TestCase
{
    /** @var TicketTypeRepositoryInterface|Mockery\MockInterface */
    protected $repo;

    protected TicketTypeService $service;

    /**
     * Build the service with a mocked repository.
     */
    protected function setUp(): void
    {
        parent::setUp();

        $this->repo = Mockery::mock(TicketTypeRepositoryInterface::class);
        $this->service = new TicketTypeService($this->repo);
    }

    /**
     * Verify index() forwards the optional event id to the repository.
     */
    public function test_index_forwards_to_repository(): void
    {
        $expected = [];
        $this->repo->shouldReceive('all')->once()->with(5)->andReturn($expected);

        $this->assertSame($expected, $this->service->index(5));
    }

    /**
     * Verify index() passes null when no event id is given.
     */
    public function test_index_uses_null_when_no_event_given(): void
    {
        $this->repo->shouldReceive('all')->once()->with(null)->andReturn([]);

        $this->assertSame([], $this->service->index());
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
        $data = ['event_id' => 1, 'name' => 'VIP', 'price' => 100.0, 'quantity' => 10];
        $this->repo->shouldReceive('create')->once()->with($data)->andReturn($expected);

        $this->assertSame($expected, $this->service->create($data));
    }

    /**
     * Verify update() forwards the id and payload to the repository.
     */
    public function test_update_forwards_to_repository(): void
    {
        $expected = ['id' => 3];
        $data = ['price' => 120.0];
        $this->repo->shouldReceive('update')->once()->with(3, $data)->andReturn($expected);

        $this->assertSame($expected, $this->service->update(3, $data));
    }

    /**
     * Verify delete() forwards the id to the repository when nothing depends
     * on the ticket type.
     */
    public function test_delete_forwards_to_repository(): void
    {
        $this->repo->shouldReceive('find')->once()->with(4)
            ->andReturn($this->ticketTypeWithOrders(false));
        $this->repo->shouldReceive('delete')->once()->with(4)->andReturn(true);

        $this->assertTrue($this->service->delete(4));
    }

    /**
     * Verify delete() refuses when orders reference the ticket type.
     *
     * The check has to happen before the delete rather than being left to the
     * foreign key: on PostgreSQL the constraint violation aborts the whole
     * transaction, and nothing else can run on that connection afterwards.
     */
    public function test_delete_rejects_ticket_type_with_orders(): void
    {
        $this->repo->shouldReceive('find')->once()->with(4)
            ->andReturn($this->ticketTypeWithOrders(true));
        $this->repo->shouldNotReceive('delete');

        $this->expectException(ResourceInUseException::class);

        $this->service->delete(4);
    }

    /**
     * A TicketType double whose orders() relation reports the given existence.
     */
    private function ticketTypeWithOrders(bool $hasOrders): TicketType
    {
        $relation = Mockery::mock(HasMany::class);
        $relation->shouldReceive('exists')->andReturn($hasOrders);

        $ticketType = Mockery::mock(TicketType::class)->makePartial();
        $ticketType->shouldReceive('orders')->andReturn($relation);

        return $ticketType;
    }
}
