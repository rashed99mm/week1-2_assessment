<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Refuse negative ticket stock at the database level.
 *
 * The application now decrements `ticket_types.quantity` inside a locked
 * transaction, and the decrement itself carries a `quantity >= n` guard. This
 * constraint is the layer underneath both: whatever a future code path does,
 * the database will not record a ticket type that has sold more seats than it
 * had.
 *
 * It matters specifically on PostgreSQL, which has no unsigned integer type.
 * The original schema used `unsignedInteger`, so on SQLite and MySQL an
 * oversell would at least have failed loudly; on PostgreSQL the column is a
 * plain `integer` and would happily store -3.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! $this->supportsCheckConstraints()) {
            return;
        }

        DB::statement(
            'ALTER TABLE ticket_types ADD CONSTRAINT ticket_types_quantity_non_negative CHECK (quantity >= 0)'
        );

        DB::statement(
            'ALTER TABLE orders ADD CONSTRAINT orders_quantity_positive CHECK (quantity >= 1)'
        );
    }

    public function down(): void
    {
        if (! $this->supportsCheckConstraints()) {
            return;
        }

        DB::statement('ALTER TABLE ticket_types DROP CONSTRAINT IF EXISTS ticket_types_quantity_non_negative');
        DB::statement('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_quantity_positive');
    }

    /**
     * Whether the current engine can add a CHECK constraint to a live table.
     *
     * SQLite cannot: constraints are part of the CREATE TABLE statement and
     * `ALTER TABLE ... ADD CONSTRAINT` is not supported. The fast test lane
     * therefore runs without this backstop, which is why the guarded decrement
     * in OrderService is written to hold on its own.
     */
    private function supportsCheckConstraints(): bool
    {
        return in_array(Schema::getConnection()->getDriverName(), ['pgsql', 'mysql', 'mariadb'], true);
    }
};
