<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Record the gateway's own identifier for each payment.
 *
 * Refunds were impossible without this. The gateway's refund endpoint is
 * `POST /api/v1/payments/{id}/refund`, keyed on the integer primary key from
 * *its* database — not on the `TXN-…` reference string this application
 * stored. The gateway offers no lookup-by-reference, so payments taken before
 * this column existed cannot be matched up after the fact and stay
 * unrefundable. PaymentService::refund() reports that explicitly.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->unsignedBigInteger('gateway_payment_id')
                ->nullable()
                ->after('gateway_reference')
                ->index();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->dropIndex(['gateway_payment_id']);
            $table->dropColumn('gateway_payment_id');
        });
    }
};
