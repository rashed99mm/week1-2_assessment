<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Event;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers the privilege boundary introduced with the role column.
 *
 * Before this existed, every route below was reachable by any account that
 * completed the public registration form: a new user could delete another
 * organiser's events, rewrite ticket prices, and list every order in the
 * system together with the customer names and email addresses on them.
 */
class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Create a user with the given role and return a Bearer header for them.
     *
     * @return array<string, string>
     */
    private function headersFor(UserRole $role): array
    {
        $user = User::create([
            'name' => $role->label(),
            'email' => $role->value.'-'.uniqid().'@example.com',
            'password' => 'Password123',
            'role' => $role->value,
        ]);

        return ['Authorization' => 'Bearer '.auth('api')->login($user)];
    }

    /**
     * Build a valid event payload.
     *
     * @return array<string, mixed>
     */
    private function eventPayload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Tech Conference',
            'venue' => 'Expo Center',
            'starts_at' => now()->addDays(2)->toDateTimeString(),
            'total_tickets' => 200,
            'status' => 'published',
        ], $overrides);
    }

    // -----------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------

    public function test_non_admin_cannot_create_an_event(): void
    {
        $this->postJson('/api/events', $this->eventPayload(), $this->headersFor(UserRole::User))
            ->assertForbidden()
            ->assertJsonPath('success', false)
            ->assertJsonPath('status_code', 403)
            ->assertJsonPath('message', 'This action requires administrator privileges.');

        $this->assertDatabaseCount('events', 0);
    }

    public function test_non_admin_cannot_update_an_event(): void
    {
        $event = Event::create($this->eventPayload(['title' => 'Untouched']));

        $this->putJson("/api/events/{$event->id}", ['title' => 'Hijacked'], $this->headersFor(UserRole::User))
            ->assertForbidden();

        $this->assertDatabaseHas('events', ['id' => $event->id, 'title' => 'Untouched']);
    }

    public function test_non_admin_cannot_delete_an_event(): void
    {
        $event = Event::create($this->eventPayload());

        $this->deleteJson("/api/events/{$event->id}", [], $this->headersFor(UserRole::User))
            ->assertForbidden();

        $this->assertDatabaseHas('events', ['id' => $event->id, 'deleted_at' => null]);
    }

    public function test_admin_can_create_an_event(): void
    {
        $this->postJson('/api/events', $this->eventPayload(), $this->headersFor(UserRole::Admin))
            ->assertStatus(201)
            ->assertJsonPath('data.title', 'Tech Conference');
    }

    // -----------------------------------------------------------------
    // Ticket types
    // -----------------------------------------------------------------

    public function test_non_admin_cannot_create_a_ticket_type(): void
    {
        $event = Event::create($this->eventPayload());

        $this->postJson('/api/ticket-types', [
            'event_id' => $event->id, 'name' => 'Free For Me', 'price' => 0, 'quantity' => 10,
        ], $this->headersFor(UserRole::User))->assertForbidden();

        $this->assertDatabaseCount('ticket_types', 0);
    }

    public function test_non_admin_cannot_change_a_ticket_price(): void
    {
        $event = Event::create($this->eventPayload());
        $type = TicketType::create([
            'event_id' => $event->id, 'name' => 'Floor', 'price' => 75.00, 'quantity' => 100,
        ]);

        $this->putJson("/api/ticket-types/{$type->id}", ['price' => 0.01], $this->headersFor(UserRole::User))
            ->assertForbidden();

        $this->assertDatabaseHas('ticket_types', ['id' => $type->id, 'price' => '75.00']);
    }

    public function test_admin_can_create_a_ticket_type(): void
    {
        $event = Event::create($this->eventPayload());

        $this->postJson('/api/ticket-types', [
            'event_id' => $event->id, 'name' => 'Floor', 'price' => 75.00, 'quantity' => 100,
        ], $this->headersFor(UserRole::Admin))->assertStatus(201);
    }

    // -----------------------------------------------------------------
    // Public reads stay public
    // -----------------------------------------------------------------

    public function test_public_browsing_is_unaffected_by_the_role_gate(): void
    {
        Event::create($this->eventPayload());

        $this->getJson('/api/events')->assertOk();
        $this->getJson('/api/ticket-types')->assertOk();
        $this->getJson('/api/event-types')->assertOk();
    }

    // -----------------------------------------------------------------
    // Unauthenticated still means 401, not 403
    // -----------------------------------------------------------------

    public function test_anonymous_write_is_unauthenticated_not_forbidden(): void
    {
        $this->postJson('/api/events', $this->eventPayload())
            ->assertUnauthorized();
    }
}
