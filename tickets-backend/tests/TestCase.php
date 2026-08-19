<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\DB;

abstract class TestCase extends BaseTestCase
{
    /**
     * Skip the calling test unless the database engine implements real row
     * locking.
     *
     * SQLite accepts `lockForUpdate()` and silently ignores it — it locks the
     * whole database file instead of a row. A concurrency test would therefore
     * pass there without proving anything, which is worse than not running it,
     * because a green suite would imply a guarantee the fast lane cannot make.
     *
     * Tests calling this belong to the `concurrency` group and run only in the
     * PostgreSQL lane (`phpunit.pgsql.xml`).
     */
    protected function requiresRealLocking(): void
    {
        $driver = DB::connection()->getDriverName();

        if (in_array($driver, ['sqlite', 'sqlsrv'], true)) {
            $this->markTestSkipped(
                "Row-level locking is not observable on [{$driver}]; run this suite with -c phpunit.pgsql.xml."
            );
        }
    }

    /**
     * Whether the current connection is PostgreSQL.
     *
     * Useful for asserting engine-specific behaviour (case-insensitive search,
     * CHECK constraints) without duplicating the whole test.
     */
    protected function onPostgres(): bool
    {
        return DB::connection()->getDriverName() === 'pgsql';
    }
}
