<?php

namespace App\Repositories\Contracts;

/**
 * Contract for persisting and retrieving User records.
 */
interface UserRepositoryInterface
{
    /**
     * Create a new user.
     *
     * @param  array<string, mixed>  $data  Validated user attributes.
     * @return \App\Models\User
     */
    public function create(array $data);

    /**
     * Find a user by email address.
     *
     * @param  string  $email  Email address (compared case-insensitively).
     * @return \App\Models\User|null
     */
    public function findByEmail(string $email);

    /**
     * Find a user by primary key, or fail.
     *
     * @param  mixed  $id  User primary key.
     * @return \App\Models\User
     */
    public function find($id);
}
