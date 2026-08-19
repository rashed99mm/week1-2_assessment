<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\EventType;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * Feature tests for the JWT authentication endpoints.
 */
class AuthApiTest extends TestCase
{
    use AuthenticatesApi;
    use RefreshDatabase;

    /**
     * Build a valid register payload.
     *
     * @return array<string, string>
     */
    private function registerPayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'Password123',
            'password_confirmation' => 'Password123',
        ], $overrides);
    }

    /**
     * Verify POST /api/auth/register creates a user and returns a token.
     */
    public function test_register_creates_user_and_returns_token(): void
    {
        $response = $this->postJson('/api/auth/register', $this->registerPayload());

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.user.email', 'jane@example.com')
            ->assertJsonPath('data.user.name', 'Jane Doe')
            ->assertJsonStructure(['data' => ['token', 'user']]);

        $this->assertDatabaseHas('users', ['email' => 'jane@example.com']);
    }

    /**
     * Verify registration normalizes the email to lowercase.
     */
    public function test_register_normalizes_email_to_lowercase(): void
    {
        $this->postJson('/api/auth/register', $this->registerPayload(['email' => 'Jane@Example.COM']))
            ->assertStatus(201);

        $this->assertDatabaseHas('users', ['email' => 'jane@example.com']);
    }

    /**
     * Verify registration rejects a duplicate email.
     */
    public function test_register_rejects_duplicate_email(): void
    {
        $this->postJson('/api/auth/register', $this->registerPayload())->assertStatus(201);

        $this->postJson('/api/auth/register', $this->registerPayload())
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    /**
     * Verify registration rejects a weak password.
     */
    public function test_register_rejects_weak_password(): void
    {
        $this->postJson('/api/auth/register', $this->registerPayload([
            'password' => 'password',
            'password_confirmation' => 'password',
        ]))->assertStatus(422);
    }

    /**
     * Verify POST /api/auth/login returns a token for valid credentials.
     */
    public function test_login_returns_token(): void
    {
        $this->postJson('/api/auth/register', $this->registerPayload())->assertStatus(201);

        $response = $this->postJson('/api/auth/login', [
            'email' => 'jane@example.com',
            'password' => 'Password123',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => ['token', 'user']]);
    }

    /**
     * Verify login rejects invalid credentials with a generic 401.
     */
    public function test_login_rejects_invalid_credentials(): void
    {
        $this->postJson('/api/auth/register', $this->registerPayload())->assertStatus(201);

        $this->postJson('/api/auth/login', [
            'email' => 'jane@example.com',
            'password' => 'WrongPass123',
        ])->assertStatus(401)
            ->assertJsonPath('success', false);
    }

    /**
     * Verify GET /api/auth/me returns the authenticated user.
     */
    public function test_me_returns_authenticated_user(): void
    {
        $token = $this->postJson('/api/auth/register', $this->registerPayload())
            ->json('data.token');

        $this->getJson('/api/auth/me', $this->authHeaders($token))
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.email', 'jane@example.com');
    }

    /**
     * Verify protected routes reject requests without a token.
     */
    public function test_protected_routes_reject_missing_token(): void
    {
        $this->getJson('/api/auth/me')->assertStatus(401)
            ->assertJsonPath('success', false)
            ->assertJsonPath('status_code', 401);
        $this->getJson('/api/orders')->assertStatus(401)
            ->assertJsonPath('success', false);
        $this->postJson('/api/events', [])->assertStatus(401)
            ->assertJsonPath('success', false);
    }

    /**
     * Verify public read-only routes (events, event types, availability)
     * are accessible without a token.
     */
    public function test_public_browsing_routes_do_not_require_token(): void
    {
        $eventType = EventType::create([
            'name' => 'Concert',
            'slug' => 'concert',
            'is_online' => false,
            'seating_model' => 'assigned',
        ]);
        $event = Event::create([
            'title' => 'Open Air Night',
            'description' => 'A public browsing test event.',
            'venue' => 'Riverside Park',
            'event_type_id' => $eventType->id,
            'starts_at' => now()->addDays(2),
            'total_tickets' => 100,
            'status' => 'published',
        ]);
        TicketType::create([
            'event_id' => $event->id,
            'name' => 'General',
            'price' => 25.00,
            'quantity' => 100,
        ]);

        $this->getJson('/api/events')->assertOk()
            ->assertJsonPath('success', true);
        $this->getJson('/api/event-types')->assertOk()
            ->assertJsonPath('success', true);
        $this->getJson("/api/events/{$event->id}/availability")->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.ticket_types.0.sold', 0);
    }

    /**
     * Verify an invalid token is rejected with 401.
     */
    public function test_protected_routes_reject_invalid_token(): void
    {
        $this->getJson('/api/auth/me', $this->authHeaders('not.a.valid.jwt'))
            ->assertStatus(401);
    }

    /**
     * Verify POST /api/auth/logout invalidates the token.
     */
    public function test_logout_invalidates_token(): void
    {
        $token = $this->postJson('/api/auth/register', $this->registerPayload())
            ->json('data.token');

        $this->postJson('/api/auth/logout', [], $this->authHeaders($token))
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->getJson('/api/auth/me', $this->authHeaders($token))
            ->assertStatus(401);
    }

    /**
     * Verify POST /api/auth/refresh issues a working token.
     */
    public function test_refresh_issues_new_token(): void
    {
        $token = $this->postJson('/api/auth/register', $this->registerPayload())
            ->json('data.token');

        $newToken = $this->postJson('/api/auth/refresh', [], $this->authHeaders($token))
            ->assertOk()
            ->json('data.token');

        $this->assertNotSame($token, $newToken);

        $this->getJson('/api/auth/me', $this->authHeaders($newToken))
            ->assertOk();
    }

    /**
     * Verify login is rate-limited to prevent brute force attacks.
     */
    public function test_login_is_rate_limited(): void
    {
        User::create([
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'Password123',
        ]);

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'jane@example.com',
                'password' => 'WrongPass123',
            ])->assertStatus(401);
        }

        $this->postJson('/api/auth/login', [
            'email' => 'jane@example.com',
            'password' => 'WrongPass123',
        ])->assertStatus(429);
    }
}
