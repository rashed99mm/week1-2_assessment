<?php

namespace App\Repositories\Eloquent;

use App\Models\User;
use App\Repositories\Contracts\UserRepositoryInterface;

/**
 * Eloquent implementation of the User repository contract.
 */
class UserRepository implements UserRepositoryInterface
{
    /**
     * Create a new user.
     *
     * @param  array<string, mixed>  $data  Validated user attributes.
     * @return \App\Models\User
     */
    public function create(array $data)
    {
        return User::create($data);
    }

    /**
     * Find a user by email address.
     *
     * @param  string  $email  Email address (compared case-insensitively).
     * @return \App\Models\User|null
     */
    public function findByEmail(string $email)
    {
        return User::where('email', strtolower($email))->first();
    }

    /**
     * Find a user by primary key, or throw a ModelNotFoundException.
     *
     * @param  mixed  $id  User primary key.
     * @return \App\Models\User
     */
    public function find($id)
    {
        return User::findOrFail($id);
    }
}
