<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Event;
use App\Models\EventType;
use App\Models\Order;
use App\Models\Payment;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * The back-office surface the Angular CMS consumes.
 */
class AdminApiTest extends TestCase
{
    use AuthenticatesApi;
    use RefreshDatabase;

    private User $admin;

    private TicketType $ticketType;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->authenticateApi(UserRole::Admin);

        $event = Event::create([
            'title' => 'Aurora Live',
            'venue' => 'Rooftop Arena',
            'starts_at' => now()->addDays(7)->toDateTimeString(),
            'total_tickets' => 100,
            'status' => 'published',
        ]);

        $this->ticketType = TicketType::create([
            'event_id' => $event->id,
            'name' => 'Floor A',
            'price' => 75.00,
            'quantity' => 10,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function orderPayload(int $quantity = 2): array
    {
        return [
            'ticket_type_id' => $this->ticketType->id,
            'customer_name' => 'Ada Lovelace',
            'customer_email' => 'ada@example.com',
            'quantity' => $quantity,
        ];
    }

    /**
     * Place an order and pay it, so it is refundable.
     */
    private function paidOrder(): int
    {
        $created = $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        Http::fake(['*/payments/charge' => Http::response([
            'success' => true, 'message' => 'ok', 'status_code' => 200,
            'data' => ['id' => 900, 'status' => 'success', 'gateway_reference' => 'TXN-ABC123'],
            'errors' => null,
        ], 200)]);

        $id = $created->json('data.id');
        $this->postJson("/api/v1/orders/{$id}/pay", ['card_token' => '4242424242424242'])->assertOk();

        return $id;
    }

    // -----------------------------------------------------------------
    // Access
    // -----------------------------------------------------------------

    public function test_every_admin_route_rejects_a_non_admin(): void
    {
        $user = $this->createApiUser();
        $headers = $this->authHeaders($this->apiToken($user));

        $this->getJson('/api/v1/admin/orders', $headers)->assertForbidden();
        $this->getJson('/api/v1/admin/users', $headers)->assertForbidden();
        $this->postJson('/api/v1/admin/event-types', ['name' => 'X'], $headers)->assertForbidden();
        $this->patchJson("/api/v1/admin/users/{$user->id}/role", ['role' => 'admin'], $headers)
            ->assertForbidden();
    }

    public function test_admin_routes_reject_anonymous_callers(): void
    {
        // setUp() attaches an admin token to every request by default, so it
        // has to be cleared to test the unauthenticated path at all.
        $this->flushHeaders();

        $this->getJson('/api/v1/admin/orders')->assertUnauthorized();
    }

    // -----------------------------------------------------------------
    // Orders
    // -----------------------------------------------------------------

    public function test_admin_can_list_and_filter_all_orders(): void
    {
        $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        $this->getJson('/api/v1/admin/orders')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.customer_email', 'ada@example.com');

        $this->getJson('/api/v1/admin/orders?filters[status]=paid')
            ->assertOk()
            ->assertJsonPath('data.total', 0);
    }

    public function test_admin_can_show_an_order_with_its_payments_and_owner(): void
    {
        $id = $this->paidOrder();

        $this->getJson("/api/v1/admin/orders/{$id}")
            ->assertOk()
            ->assertJsonPath('data.id', $id)
            ->assertJsonPath('data.payments.0.gateway_reference', 'TXN-ABC123')
            ->assertJsonPath('data.user.id', $this->admin->id);
    }

    public function test_admin_can_cancel_an_order_and_stock_returns(): void
    {
        $created = $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);
        $this->assertSame(8, (int) $this->ticketType->fresh()->quantity);

        $this->patchJson("/api/v1/admin/orders/{$created->json('data.id')}/status", [
            'status' => 'cancelled',
            'reason' => 'Duplicate booking',
        ])->assertOk()->assertJsonPath('data.status', 'cancelled');

        $this->assertSame(10, (int) $this->ticketType->fresh()->quantity);
    }

    /**
     * Marking an order paid or refunded from the CMS, without money moving,
     * would put these records out of step with the payment provider. The
     * refund endpoint exists precisely so nobody needs this shortcut.
     */
    public function test_admin_cannot_fake_a_status_transition(): void
    {
        $created = $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        foreach (['paid', 'refunded', 'failed', 'pending'] as $status) {
            $this->patchJson("/api/v1/admin/orders/{$created->json('data.id')}/status", ['status' => $status])
                ->assertStatus(422)
                ->assertJsonValidationErrors('status');
        }
    }

    // -----------------------------------------------------------------
    // Refunds
    // -----------------------------------------------------------------

    public function test_admin_can_refund_a_paid_order(): void
    {
        $id = $this->paidOrder();
        $this->assertSame(8, (int) $this->ticketType->fresh()->quantity);

        Http::fake(['*/refund' => Http::response([
            'success' => true, 'message' => 'ok', 'status_code' => 200,
            'data' => ['id' => 900, 'status' => 'refunded', 'gateway_reference' => 'TXN-ABC123'],
            'errors' => null,
        ], 200)]);

        $this->postJson("/api/v1/admin/orders/{$id}/refund", ['reason' => 'Customer request'])
            ->assertOk()
            ->assertJsonPath('data.status', 'refunded');

        $this->assertSame(10, (int) $this->ticketType->fresh()->quantity);
        $this->assertDatabaseHas('payments', ['order_id' => $id, 'status' => 'refunded']);
    }

    public function test_refunding_an_unpaid_order_is_rejected(): void
    {
        $created = $this->postJson('/api/v1/orders', $this->orderPayload())->assertStatus(201);

        $this->postJson("/api/v1/admin/orders/{$created->json('data.id')}/refund")
            ->assertStatus(422);
    }

    /**
     * A gateway refusal must leave the local state untouched. Marking the order
     * refunded when no money moved is the worst possible outcome: the customer
     * is told they were refunded and the ticket goes back on sale.
     */
    public function test_a_gateway_refusal_leaves_the_order_paid(): void
    {
        $id = $this->paidOrder();

        Http::fake(['*/refund' => Http::response([
            'success' => false, 'message' => 'Only successful payments can be refunded.',
            'status_code' => 400, 'data' => null, 'errors' => null,
        ], 400)]);

        $this->postJson("/api/v1/admin/orders/{$id}/refund")->assertStatus(400);

        $this->assertDatabaseHas('orders', ['id' => $id, 'status' => 'paid']);
        $this->assertSame(8, (int) $this->ticketType->fresh()->quantity);
    }

    /**
     * Payments taken before gateway_payment_id was captured cannot be matched
     * to a gateway record. Say so, rather than failing with a 500.
     */
    public function test_a_legacy_payment_reports_that_it_cannot_be_refunded(): void
    {
        $id = $this->paidOrder();
        Payment::where('order_id', $id)->update(['gateway_payment_id' => null]);

        $this->postJson("/api/v1/admin/orders/{$id}/refund")
            ->assertStatus(400)
            ->assertJsonPath('success', false);

        $this->assertDatabaseHas('orders', ['id' => $id, 'status' => 'paid']);
    }

    // -----------------------------------------------------------------
    // Event types
    // -----------------------------------------------------------------

    public function test_admin_can_create_an_event_type_with_a_derived_slug(): void
    {
        $this->postJson('/api/v1/admin/event-types', ['name' => 'Comedy Night'])
            ->assertStatus(201)
            ->assertJsonPath('data.slug', 'comedy-night')
            ->assertHeader('Location');
    }

    public function test_event_type_names_must_be_unique(): void
    {
        EventType::create(['name' => 'Concert', 'slug' => 'concert', 'is_online' => false, 'seating_model' => 'assigned']);

        $this->postJson('/api/v1/admin/event-types', ['name' => 'Concert'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('name');
    }

    public function test_updating_an_event_type_does_not_collide_with_itself(): void
    {
        $type = EventType::create(['name' => 'Concert', 'slug' => 'concert', 'is_online' => false, 'seating_model' => 'assigned']);

        // Saving an unchanged name must not fail against its own row.
        $this->putJson("/api/v1/admin/event-types/{$type->id}", ['name' => 'Concert', 'is_online' => true])
            ->assertOk()
            ->assertJsonPath('data.is_online', true);
    }

    public function test_an_event_type_in_use_cannot_be_deleted(): void
    {
        $type = EventType::create(['name' => 'Concert', 'slug' => 'concert', 'is_online' => false, 'seating_model' => 'assigned']);
        Event::create([
            'title' => 'Uses The Type',
            'event_type_id' => $type->id,
            'starts_at' => now()->addDays(3)->toDateTimeString(),
            'total_tickets' => 10,
            'status' => 'draft',
        ]);

        // nullOnDelete would otherwise silently strip the categorisation from
        // every event using it.
        $this->deleteJson("/api/v1/admin/event-types/{$type->id}")->assertStatus(409);

        $this->assertDatabaseHas('event_types', ['id' => $type->id]);
    }

    public function test_an_unused_event_type_can_be_deleted(): void
    {
        $type = EventType::create(['name' => 'Unused', 'slug' => 'unused', 'is_online' => false, 'seating_model' => 'general']);

        $this->deleteJson("/api/v1/admin/event-types/{$type->id}")->assertOk();

        $this->assertDatabaseMissing('event_types', ['id' => $type->id]);
    }

    // -----------------------------------------------------------------
    // Users and roles
    // -----------------------------------------------------------------

    public function test_admin_can_list_and_search_users(): void
    {
        User::create(['name' => 'Grace Hopper', 'email' => 'grace@example.com', 'password' => 'Password123', 'role' => 'user']);

        $this->getJson('/api/v1/admin/users?search=GRACE')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.email', 'grace@example.com');

        $this->getJson('/api/v1/admin/users?role=admin')
            ->assertOk()
            ->assertJsonPath('data.total', 1);
    }

    public function test_admin_can_promote_and_demote_another_account(): void
    {
        $user = User::create(['name' => 'Grace', 'email' => 'grace@example.com', 'password' => 'Password123', 'role' => 'user']);

        $this->patchJson("/api/v1/admin/users/{$user->id}/role", ['role' => 'admin'])
            ->assertOk()
            ->assertJsonPath('data.role', 'admin');

        $this->patchJson("/api/v1/admin/users/{$user->id}/role", ['role' => 'user'])
            ->assertOk()
            ->assertJsonPath('data.role', 'user');
    }

    /**
     * Both of these exist because the alternative is locking everyone out of
     * the CMS with no way back in except a database console.
     */
    public function test_an_admin_cannot_demote_themselves(): void
    {
        User::create(['name' => 'Other Admin', 'email' => 'other@example.com', 'password' => 'Password123', 'role' => 'admin']);

        $this->patchJson("/api/v1/admin/users/{$this->admin->id}/role", ['role' => 'user'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'You cannot remove your own administrator privileges.');

        $this->assertDatabaseHas('users', ['id' => $this->admin->id, 'role' => 'admin']);
    }

    public function test_the_last_admin_cannot_be_demoted(): void
    {
        $other = User::create(['name' => 'Other Admin', 'email' => 'other@example.com', 'password' => 'Password123', 'role' => 'admin']);

        // Two admins: demoting one is fine.
        $this->patchJson("/api/v1/admin/users/{$other->id}/role", ['role' => 'user'])->assertOk();

        // Now only the caller remains, and self-demotion is already blocked —
        // so assert the last-admin guard directly with a second admin acting.
        $second = User::create(['name' => 'Second', 'email' => 'second@example.com', 'password' => 'Password123', 'role' => 'admin']);
        $this->patchJson("/api/v1/admin/users/{$this->admin->id}/role", ['role' => 'user'], $this->authHeaders($this->apiToken($second)))
            ->assertOk();

        // `second` is now the only administrator left.
        $this->patchJson("/api/v1/admin/users/{$second->id}/role", ['role' => 'user'], $this->authHeaders($this->apiToken($second)))
            ->assertStatus(422);

        $this->assertDatabaseHas('users', ['id' => $second->id, 'role' => 'admin']);
    }

    public function test_an_invalid_role_is_rejected(): void
    {
        $user = User::create(['name' => 'Grace', 'email' => 'grace@example.com', 'password' => 'Password123', 'role' => 'user']);

        $this->patchJson("/api/v1/admin/users/{$user->id}/role", ['role' => 'superuser'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('role');
    }
}
