<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add the cover image path to the events table.
 *
 * Stores a path relative to the `public` disk (e.g. "covers/ab12….jpg"); the
 * browser-facing URL is derived by the Event model's cover_image_url accessor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('events', function (Blueprint $table) {
            $table->string('cover_image_path')->nullable()->after('event_type_id');
        });
    }

    public function down(): void
    {
        // Kept alone in its own closure: SQLite 3.35+ then uses a native
        // ALTER TABLE ... DROP COLUMN rather than rebuilding the table.
        Schema::table('events', function (Blueprint $table) {
            $table->dropColumn('cover_image_path');
        });
    }
};
