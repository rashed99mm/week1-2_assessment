<?php

namespace App\Services;

use App\Exceptions\InvalidCredentialsException;
use App\Models\User;
use App\Repositories\Contracts\UserRepositoryInterface;

/**
 * Orchestrates user registration, authentication and token lifecycle.
 *
 * All token handling delegates to the JWT guard (`auth:api`) which signs
 * stateless HS256 tokens and supports server-side invalidation through
 * the blacklist.
 */
class AuthService
{
    protected UserRepositoryInterface $users;

    /**
     * Inject the user repository.
     *
     * @param  UserRepositoryInterface  $users  User persistence contract.
     */
    public function __construct(UserRepositoryInterface $users)
    {
        $this->users = $users;
    }

    /**
     * Register a new user and issue a signed token.
     *
     * The password is hashed automatically by the `hashed` cast on the
     * User model. Emails are normalized to lowercase.
     *
     * @param  array<string, mixed>  $data  Validated register payload.
     * @return array{user: User, token: string}  The created user and JWT.
     */
    public function register(array $data): array
    {
        $user = $this->users->create([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'password' => $data['password'],
        ]);

        $token = auth('api')->login($user);

        return ['user' => $user, 'token' => $token];
    }

    /**
     * Authenticate a user and issue a signed token.
     *
     * @param  array<string, string>  $credentials  Email and password pair.
     * @return array{user: User, token: string}  The authenticated user and JWT.
     *
     * @throws InvalidCredentialsException When the credentials are invalid.
     */
    public function login(array $credentials): array
    {
        $token = auth('api')->attempt([
            'email' => strtolower($credentials['email']),
            'password' => $credentials['password'],
        ]);

        if (! $token) {
            throw new InvalidCredentialsException();
        }

        return ['user' => auth('api')->user(), 'token' => $token];
    }

    /**
     * Invalidate the current token via the JWT blacklist.
     */
    public function logout(): void
    {
        auth('api')->logout();
    }

    /**
     * Issue a fresh token for the current authenticated session.
     *
     * @return array{user: User, token: string}  The current user and new JWT.
     */
    public function refresh(): array
    {
        $token = auth('api')->refresh();

        return ['user' => auth('api')->user(), 'token' => $token];
    }

    /**
     * Resolve the currently authenticated user.
     *
     * @return User
     */
    public function me(): User
    {
        return auth('api')->user();
    }
}
