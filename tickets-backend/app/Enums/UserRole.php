<?php

namespace App\Enums;

/**
 * The roles a user account can hold.
 *
 * Two roles, stored in a single column on `users`. A roles/permissions pivot
 * would buy nothing here: there are no per-object permissions, and the role has
 * to be embedded in every JWT so the notification and analytics services can
 * authorize without reaching into this database. A join on every token mint,
 * to read one value out of a two-row table, is not a trade worth making.
 *
 * Adding a third role (organiser, support) is a new case here. Per-event
 * permissions would be a genuinely different model and a rewrite either way,
 * so nothing is pre-paid for it now.
 *
 * The string values are part of the JWT contract — see
 * docs/contracts/auth-jwt.md. Changing one invalidates every live token and
 * breaks authorization in two other services.
 */
enum UserRole: string
{
    case User = 'user';
    case Admin = 'admin';

    /**
     * Human-readable label for admin UIs.
     */
    public function label(): string
    {
        return match ($this) {
            self::User => 'User',
            self::Admin => 'Administrator',
        };
    }

    /**
     * All role values, for validation rules.
     *
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }
}
