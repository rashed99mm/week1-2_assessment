<?php

namespace Tests\Concerns;

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
     * @return User
     */
    protected function createApiUser(): User
    {
        return User::create([
            'name' => 'Test User',
            'email' => 'test-'.Str::random(8).'@example.com',
            'password' => 'password',
        ]);
    }

    /**
     * Authenticate the test request as a fresh user on the api (jwt) guard.
     *
     * A real JWT is signed and attached as the Authorization header so the
     * `jwt.auth` middleware resolves the user exactly as production would.
     *
     * @return User  The authenticated user.
     */
    protected function authenticateApi(): User
    {
        $user = $this->createApiUser();
        $this->withHeaders($this->authHeaders($this->apiToken($user)));

        return $user;
    }

    /**
     * Build a real JWT for the given user.
     *
     * @param  User  $user  The user to sign a token for.
     * @return string  The signed JWT.
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
