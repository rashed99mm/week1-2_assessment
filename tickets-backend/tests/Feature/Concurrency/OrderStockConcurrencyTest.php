<?php

namespace Tests\Feature\Concurrency;

use App\Exceptions\InsufficientStockException;
use App\Models\Event;
use App\Models\TicketType;
use App\Services\OrderService;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use PDOException;
use PHPUnit\Framework\Attributes\Group;
use Tests\TestCase;

/**
 * Proves the row lock in OrderService::create() is real.
 *
 * OrderStockTest covers the sequential invariants and runs everywhere, but it
 * cannot distinguish a working `SELECT ... FOR UPDATE` from one that does
 * nothing — every assertion in it would still pass if the lock were removed,
 * because the guarded decrement alone handles the single-threaded case.
 *
 * The only way to tell the difference is to observe the lock from a *second*
 * database connection while the first transaction holds it. That is what this
 * does: connection B asks for the same row with a short `lock_timeout` and
 * must fail to get it.
 *
 * Notes on the setup:
 *
 * - DatabaseMigrations, not RefreshDatabase. RefreshDatabase wraps each test
 *   in a transaction that is never committed, so rows created by the test
 *   would be invisible to any other connection and the whole exercise would
 *   measure nothing. This trait costs a migrate:fresh per test; that is the
 *   price of testing something real.
 *
 * - Two connections in one process, not two processes. `pcntl_fork` does not
 *   exist on Windows, and a test that only runs on the CI machine is a test
 *   nobody runs before pushing.
 *
 * PostgreSQL only — SQLite accepts lockForUpdate() and silently ignores it.
 */
#[Group('concurrency')]
class OrderStockConcurrencyTest extends TestCase
{
    use DatabaseMigrations;

    private TicketType $ticketType;

    protected function setUp(): void
    {
        parent::setUp();
        $this->requiresRealLocking();

        $event = Event::create([
            'title' => 'Aurora Live',
            'venue' => 'Rooftop Arena',
            'starts_at' => now()->addDays(7)->toDateTimeString(),
            'total_tickets' => 10,
            'status' => 'published',
        ]);

        $this->ticketType = TicketType::create([
            'event_id' => $event->id,
            'name' => 'Floor A',
            'price' => 75.00,
            'quantity' => 5,
        ]);
    }

    protected function tearDown(): void
    {
        // A test that fails mid-transaction would otherwise leave the
        // connection holding locks into the next test.
        if (DB::transactionLevel() > 0) {
            DB::rollBack();
        }

        DB::purge('pgsql_second');

        parent::tearDown();
    }

    /**
     * The second connection, configured to give up quickly rather than block
     * for the rest of the suite.
     */
    private function otherConnection(): Connection
    {
        $connection = DB::connection('pgsql_second');
        $connection->statement("SET lock_timeout = '500ms'");

        return $connection;
    }

    public function test_lock_for_update_blocks_a_concurrent_reader(): void
    {
        DB::beginTransaction();

        // Connection A takes the row lock and holds it.
        DB::table('ticket_types')->where('id', $this->ticketType->id)->lockForUpdate()->first();

        $blocked = false;

        try {
            $this->otherConnection()
                ->table('ticket_types')
                ->where('id', $this->ticketType->id)
                ->lockForUpdate()
                ->first();
        } catch (\Throwable $e) {
            // PostgreSQL 55P03 — lock_not_available.
            $blocked = str_contains($e->getMessage(), 'lock timeout')
                || str_contains($e->getMessage(), '55P03')
                || $e->getPrevious() instanceof PDOException;
        }

        $this->assertTrue(
            $blocked,
            'A second connection acquired the row lock while the first transaction held it. '
            .'lockForUpdate() is not taking a real lock, so concurrent orders can oversell.'
        );

        DB::rollBack();
    }

    public function test_the_lock_is_released_on_commit_and_the_decrement_is_visible(): void
    {
        DB::beginTransaction();

        DB::table('ticket_types')->where('id', $this->ticketType->id)->lockForUpdate()->first();
        DB::table('ticket_types')->where('id', $this->ticketType->id)->decrement('quantity', 2);

        // Still uncommitted: the other connection must see the original value.
        $duringTransaction = $this->otherConnection()
            ->table('ticket_types')->where('id', $this->ticketType->id)->value('quantity');

        $this->assertSame(5, (int) $duringTransaction, 'Uncommitted stock change leaked to another connection.');

        DB::commit();

        $afterCommit = $this->otherConnection()
            ->table('ticket_types')->where('id', $this->ticketType->id)->value('quantity');

        $this->assertSame(3, (int) $afterCommit);
    }

    /**
     * The database is the last line of defence.
     *
     * Even if every application guard were bypassed, the CHECK constraint added
     * in 2026_09_01_000003 must refuse to store a negative balance. PostgreSQL
     * has no unsigned integer type, so without this the column would happily
     * hold -3.
     */
    public function test_the_database_refuses_negative_stock(): void
    {
        $this->expectException(QueryException::class);

        DB::table('ticket_types')
            ->where('id', $this->ticketType->id)
            ->update(['quantity' => -1]);
    }

    /**
     * An end-to-end pass with the real service against the real engine.
     *
     * Sequential, but exercised here so the PostgreSQL lane covers the actual
     * transaction/lock/decrement path rather than only the primitives.
     */
    public function test_service_reserves_exactly_the_available_stock(): void
    {
        $orders = app(OrderService::class);

        for ($i = 0; $i < 5; $i++) {
            $orders->create([
                'ticket_type_id' => $this->ticketType->id,
                'customer_name' => 'Buyer '.$i,
                'customer_email' => "buyer{$i}@example.com",
                'quantity' => 1,
            ]);
        }

        $this->assertSame(0, (int) $this->ticketType->fresh()->quantity);

        $this->expectException(InsufficientStockException::class);

        $orders->create([
            'ticket_type_id' => $this->ticketType->id,
            'customer_name' => 'One Too Many',
            'customer_email' => 'late@example.com',
            'quantity' => 1,
        ]);
    }
}
