<?php

namespace App\Domain\Events;

use App\Domain\Events\Concerns\SerialisesDomainValues;
use App\Models\User;
use DateTimeInterface;

/**
 * A new account was created through public registration.
 *
 * Consumed by the notification service (welcome email, admin notice) and by
 * the analytics service (user dimension).
 */
class UserRegistered implements DomainEvent
{
    use SerialisesDomainValues;

    public function __construct(private readonly User $user) {}

    public function type(): string
    {
        return 'user.registered';
    }

    public function version(): int
    {
        return 1;
    }

    public function occurredAt(): DateTimeInterface
    {
        return $this->user->created_at ?? now();
    }

    public function payload(): array
    {
        return [
            'userId' => (int) $this->user->id,
            'name' => $this->user->name,
            'email' => $this->user->email,
            'role' => $this->user->role->value,
            'registeredAt' => $this->timestamp($this->occurredAt()),
        ];
    }

    public function actor(): ?array
    {
        // Self-service registration: the new account is its own actor.
        return ['userId' => (int) $this->user->id, 'role' => $this->user->role->value];
    }
}
