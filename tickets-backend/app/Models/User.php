<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Enums\UserRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use PHPOpenSourceSaver\JWTAuth\Contracts\JWTSubject;

#[Fillable(['name', 'email', 'password', 'role'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable implements JWTSubject
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * Return the subject identifier used in the JWT payload.
     *
     * @return mixed
     */
    public function getJWTIdentifier()
    {
        return $this->getKey();
    }

    /**
     * Return custom claims merged into the JWT payload.
     *
     * `role` is what lets the notification and analytics services authorize a
     * request without querying this database — see docs/contracts/auth-jwt.md.
     * `name` and `email` save the admin CMS a /auth/me round-trip just to
     * render a user chip.
     *
     * These claims must also be listed in `persistent_claims` in config/jwt.php.
     * The guard rebuilds the payload from scratch on refresh() and drops any
     * custom claim not named there, which would quietly demote every admin to a
     * role-less token about an hour into their session.
     *
     * @return array<string, mixed>
     */
    public function getJWTCustomClaims()
    {
        return [
            // Falls back rather than dereferencing null: a model instance built
            // without an explicit role (relying on the column default) has no
            // value loaded yet, and failing to mint a token is a worse outcome
            // than issuing an unprivileged one.
            'role' => ($this->role ?? UserRole::User)->value,
            'name' => $this->name,
            'email' => $this->email,
        ];
    }

    /**
     * Orders placed by this account.
     *
     * Nullable on the order side: rows that predate order ownership, and any
     * future guest checkout, belong to nobody.
     *
     * @return HasMany<Order>
     */
    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    /**
     * Whether this account holds administrator privileges.
     *
     * Authorization inside this application reads the column, never the token
     * claim. The claim is a cache carried for other services' benefit; the row
     * is the truth, so a demotion takes effect immediately here rather than
     * whenever the user's token happens to expire.
     */
    public function isAdmin(): bool
    {
        return $this->role === UserRole::Admin;
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
        ];
    }
}
