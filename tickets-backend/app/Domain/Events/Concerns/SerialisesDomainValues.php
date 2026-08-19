<?php

namespace App\Domain\Events\Concerns;

use DateTimeInterface;
use Illuminate\Support\Carbon;

/**
 * Wire-format helpers shared by every domain event.
 *
 * The contract these enforce is not cosmetic. Two consumers written in other
 * languages parse these payloads, and the two ways this most easily goes wrong
 * are money arriving as a binary float and timestamps arriving in the server's
 * local time.
 */
trait SerialisesDomainValues
{
    /**
     * Format a monetary value as a fixed-precision decimal string.
     *
     * Never emit money as a JSON number. `json_decode` in Node produces a
     * binary float, and .NET a double; either drifts by fractions of a cent,
     * which stays invisible until someone reconciles a revenue report against
     * the orders that produced it.
     */
    protected function money(mixed $amount): string
    {
        return number_format((float) $amount, 2, '.', '');
    }

    /**
     * Format a timestamp as RFC 3339 in UTC with millisecond precision.
     *
     * Always UTC with an explicit Z. The analytics service buckets by UTC day;
     * emitting local time would put orders in the wrong day near midnight and
     * the discrepancy would look like a reporting bug.
     */
    protected function timestamp(DateTimeInterface|string|null $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return Carbon::parse($value)->utc()->format('Y-m-d\TH:i:s.v\Z');
    }

    /**
     * Cast an optional identifier, preserving null rather than turning it into 0.
     */
    protected function nullableId(mixed $value): ?int
    {
        return $value === null ? null : (int) $value;
    }
}
