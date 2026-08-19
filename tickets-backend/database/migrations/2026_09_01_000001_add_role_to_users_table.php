<?php

use App\Enums\UserRole;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Introduce the role column that every authorization check reads.
 *
 * Until now the API had no notion of privilege: any authenticated account could
 * create, update and delete events and ticket types, and could list every order
 * in the system along with the customer names and email addresses on them.
 */
return new class extends Migration
{
    /**
     * The account the seeder creates as the demo administrator.
     */
    private const SEEDED_ADMIN_EMAIL = 'admin@example.com';

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Indexed because the admin user list filters on it, and because
            // the "is this the last admin?" guard runs on every role change.
            $table->string('role', 20)
                ->default(UserRole::User->value)
                ->index()
                ->after('email');
        });

        // Existing accounts default to `user`. Without promoting one of them
        // there is no way into the admin surface on an already-seeded
        // database, so the demo account keeps the privileges its name implies.
        DB::table('users')
            ->where('email', self::SEEDED_ADMIN_EMAIL)
            ->update(['role' => UserRole::Admin->value]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['role']);
            $table->dropColumn('role');
        });
    }
};
