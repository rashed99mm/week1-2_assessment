<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Pins down the JWT claim contract that two other services depend on.
 *
 * The notification and analytics services never query this database. They
 * decide whether a caller is an administrator purely from the `role` claim in
 * the token, so anything that changes the claim set is a breaking change for
 * them. See docs/contracts/auth-jwt.md.
 */
class JwtClaimsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Decode a JWT payload without verifying it.
     *
     * Deliberately hand-rolled rather than going through the library: this test
     * should fail if the library's behaviour changes, not follow it.
     *
     * @return array<string, mixed>
     */
    private function decodePayload(string $token): array
    {
        $segments = explode('.', $token);
        $this->assertCount(3, $segments, 'Token is not a well-formed JWT.');

        $payload = base64_decode(strtr($segments[1], '-_', '+/'), true);
        $this->assertIsString($payload, 'Token payload is not valid base64url.');

        return json_decode($payload, true, flags: JSON_THROW_ON_ERROR);
    }

    private function makeUser(UserRole $role = UserRole::User): User
    {
        return User::create([
            'name' => 'Ada Lovelace',
            'email' => 'ada@example.com',
            'password' => 'Password123',
            'role' => $role->value,
        ]);
    }

    public function test_login_token_carries_role_name_and_email(): void
    {
        $this->makeUser(UserRole::Admin);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'ada@example.com',
            'password' => 'Password123',
        ])->assertOk();

        $claims = $this->decodePayload($response->json('data.token'));

        $this->assertSame('admin', $claims['role']);
        $this->assertSame('Ada Lovelace', $claims['name']);
        $this->assertSame('ada@example.com', $claims['email']);
    }

    public function test_registration_token_defaults_to_the_user_role(): void
    {
        $response = $this->postJson('/api/auth/register', [
            'name' => 'New Person',
            'email' => 'New.Person@Example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ])->assertStatus(201);

        $claims = $this->decodePayload($response->json('data.token'));

        $this->assertSame('user', $claims['role']);
        $this->assertDatabaseHas('users', ['email' => 'new.person@example.com', 'role' => 'user']);
    }

    /**
     * The regression this test exists for.
     *
     * refresh() rebuilds the payload from scratch and keeps only the claims
     * listed in `persistent_claims`. With that list empty — its default — the
     * refreshed token has no `role`, so an administrator is silently demoted on
     * the two services that authorize from the claim, roughly an hour into
     * their session. Nothing else in the suite would notice.
     */
    public function test_refresh_preserves_custom_claims(): void
    {
        $this->makeUser(UserRole::Admin);

        $login = $this->postJson('/api/auth/login', [
            'email' => 'ada@example.com',
            'password' => 'Password123',
        ])->assertOk();

        $refreshed = $this->postJson('/api/auth/refresh', [], [
            'Authorization' => 'Bearer '.$login->json('data.token'),
        ])->assertOk();

        $claims = $this->decodePayload($refreshed->json('data.token'));

        $this->assertArrayHasKey('role', $claims, 'refresh() dropped the role claim — check persistent_claims in config/jwt.php.');
        $this->assertSame('admin', $claims['role']);
        $this->assertSame('ada@example.com', $claims['email']);
        $this->assertSame('Ada Lovelace', $claims['name']);
    }

    public function test_subject_claim_is_the_user_id_as_a_string(): void
    {
        $user = $this->makeUser();

        $token = auth('api')->login($user);
        $claims = $this->decodePayload($token);

        // Consumers parse `sub` to an integer before comparing with a database
        // id; documenting the type here stops a future change from silently
        // breaking that comparison.
        $this->assertIsString($claims['sub']);
        $this->assertSame((string) $user->id, $claims['sub']);
    }

    public function test_me_endpoint_exposes_the_role(): void
    {
        $user = $this->makeUser(UserRole::Admin);

        $this->getJson('/api/auth/me', ['Authorization' => 'Bearer '.auth('api')->login($user)])
            ->assertOk()
            ->assertJsonPath('data.role', 'admin');
    }
}
