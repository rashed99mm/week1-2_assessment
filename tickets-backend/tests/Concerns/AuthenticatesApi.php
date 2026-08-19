<?php

namespace Tests\Concerns;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Shared helpers for authenticating API feature tests against the JWT guard.
 */
trait AuthenticatesApi
{
    /**
     * Create a fresh user in the test database.
     *
     * @param  UserRole  $role  Privilege level for the new account.
     */
    protected function createApiUser(UserRole $role = UserRole::User): User
    {
        return User::create([
            'name' => 'Test '.$role->label(),
            'email' => 'test-'.Str::random(8).'@example.com',
            'password' => 'password',
            'role' => $role->value,
        ]);
    }

    /**
     * Authenticate the test request as a fresh user on the api (jwt) guard.
     *
     * A real JWT is signed and attached as the Authorization header so the
     * `jwt.auth` middleware resolves the user exactly as production would.
     *
     * Defaults to an administrator. Most feature tests here exercise the
     * catalogue endpoints, which are administrator-only, so an unprivileged
     * default would mean asserting 403 in tests that are about something else
     * entirely. Tests that care about the privilege boundary itself live in
     * AuthorizationTest and build their own users.
     *
     * @param  UserRole  $role  Privilege level to authenticate as.
     * @return User The authenticated user.
     */
    protected function authenticateApi(UserRole $role = UserRole::Admin): User
    {
        $user = $this->createApiUser($role);
        $this->withHeaders($this->authHeaders($this->apiToken($user)));

        return $user;
    }

    /**
     * Build a real JWT for the given user.
     *
     * @param  User  $user  The user to sign a token for.
     * @return string The signed JWT.
     */
    protected function apiToken(User $user): string
    {
        return auth('api')->login($user);
    }

    /**
     * Return the Authorization header for a given token.
     *
     * @param  string  $token  The bearer token.
     * @return array<string, string>
     */
    protected function authHeaders(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }
}
