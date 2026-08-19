<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Give orders an owner and a reservation deadline.
 *
 * Orders previously recorded only a customer name and email, so there was no
 * way to scope a listing to the caller and no way to check that the person
 * paying an order was the person who placed it.
 *
 * `expires_at` exists because stock is now decremented when an order is
 * created rather than when it is paid. That is the correct trade — it stops
 * two people buying the last seat — but it means an abandoned checkout would
 * hold inventory forever without a deadline to reclaim it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            // Nullable, permanently. Rows that predate this column have no
            // owner, and making it NOT NULL would also foreclose guest
            // checkout. `null` means "no owner", and OrderPolicy treats those
            // orders as visible to administrators only.
            $table->foreignId('user_id')
                ->nullable()
                ->after('id')
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('expires_at')->nullable()->after('status');

            // The "my orders" listing sorts a user's own rows by recency.
            $table->index(['user_id', 'created_at']);

            // The expiry sweeper scans for pending orders past their deadline.
            $table->index(['status', 'expires_at']);
        });

        $this->backfillOwnersFromEmail();
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex(['status', 'expires_at']);
            $table->dropIndex(['user_id', 'created_at']);
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn('expires_at');
        });
    }

    /**
     * Attach existing orders to the account that shares their email address.
     *
     * Written as a chunked Eloquent loop rather than a single UPDATE ... FROM
     * so it runs identically on PostgreSQL and on the SQLite test lane. The
     * volume here is small; correctness across both engines matters more than
     * doing it in one statement.
     *
     * Orders whose email matches no account stay unowned, which is the honest
     * result — the seeded demo orders use addresses that were never registered.
     */
    private function backfillOwnersFromEmail(): void
    {
        DB::table('users')
            ->select('id', 'email')
            ->orderBy('id')
            ->chunk(500, function ($users): void {
                foreach ($users as $user) {
                    DB::table('orders')
                        ->whereNull('user_id')
                        ->whereRaw('lower(customer_email) = ?', [strtolower($user->email)])
                        ->update(['user_id' => $user->id]);
                }
            });
    }
};
