<?php

namespace App\Repositories\Contracts;

use App\Models\User;

/**
 * Contract for persisting and retrieving User records.
 */
interface UserRepositoryInterface
{
    /**
     * Create a new user.
     *
     * @param  array<string, mixed>  $data  Validated user attributes.
     * @return User
     */
    public function create(array $data);

    /**
     * Find a user by email address.
     *
     * @param  string  $email  Email address (compared case-insensitively).
     * @return User|null
     */
    public function findByEmail(string $email);

    /**
     * Find a user by primary key, or fail.
     *
     * @param  mixed  $id  User primary key.
     * @return User
     */
    public function find($id);
}
