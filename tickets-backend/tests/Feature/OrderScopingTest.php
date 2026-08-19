<?php

namespace Tests\Feature;

use App\Enums\UserRole;
use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\AuthenticatesApi;
use Tests\TestCase;

/**
 * Who can see which orders.
 *
 * GET /api/orders used to return every order in the system — with the customer
 * name and email address on each — to anyone holding a valid token. Registering
 * an account was enough to download the shop's entire customer list.
 */
class OrderScopingTest extends TestCase
{
    use AuthenticatesApi;
    use RefreshDatabase;

    private TicketType $ticketType;

    protected function setUp(): void
    {
        parent::setUp();

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
            'price' => 50.00,
            'quantity' => 100,
        ]);
    }

    /**
     * Persist an order belonging to the given user (or to nobody).
     */
    private function orderFor(?User $user, string $email): Order
    {
        return Order::create([
            'user_id' => $user?->id,
            'event_id' => $this->ticketType->event_id,
            'ticket_type_id' => $this->ticketType->id,
            'customer_name' => 'Customer '.$email,
            'customer_email' => $email,
            'quantity' => 1,
            'unit_price' => 50.00,
            'total_amount' => 50.00,
            'status' => Order::STATUS_PENDING,
        ]);
    }

    public function test_a_user_sees_only_their_own_orders(): void
    {
        $mine = $this->createApiUser();
        $theirs = $this->createApiUser();

        $this->orderFor($mine, 'mine@example.com');
        $this->orderFor($theirs, 'theirs@example.com');
        $this->orderFor(null, 'legacy@example.com');

        $this->withHeaders($this->authHeaders($this->apiToken($mine)))
            ->getJson('/api/orders')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.customer_email', 'mine@example.com')
            // The concrete leak: another customer's address must not appear.
            ->assertJsonMissing(['customer_email' => 'theirs@example.com'])
            ->assertJsonMissing(['customer_email' => 'legacy@example.com']);
    }

    public function test_an_admin_sees_every_order(): void
    {
        $admin = $this->createApiUser(UserRole::Admin);
        $someone = $this->createApiUser();

        $this->orderFor($someone, 'theirs@example.com');
        $this->orderFor(null, 'legacy@example.com');

        $this->withHeaders($this->authHeaders($this->apiToken($admin)))
            ->getJson('/api/orders')
            ->assertOk()
            ->assertJsonPath('data.total', 2);
    }

    public function test_unowned_orders_are_invisible_to_regular_users(): void
    {
        $user = $this->createApiUser();
        $legacy = $this->orderFor(null, 'legacy@example.com');

        // `user_id` is null on both sides of the comparison here; the policy
        // must not treat null === null as ownership.
        $this->withHeaders($this->authHeaders($this->apiToken($user)))
            ->getJson("/api/orders/{$legacy->id}")
            ->assertNotFound();
    }

    public function test_a_user_cannot_read_another_users_order(): void
    {
        $mine = $this->createApiUser();
        $theirs = $this->createApiUser();
        $order = $this->orderFor($theirs, 'theirs@example.com');

        // 404 rather than 403: a 403 would confirm the order exists, turning
        // this endpoint into a way to count the shop's sales.
        $this->withHeaders($this->authHeaders($this->apiToken($mine)))
            ->getJson("/api/orders/{$order->id}")
            ->assertNotFound();
    }

    public function test_a_user_can_read_their_own_order(): void
    {
        $mine = $this->createApiUser();
        $order = $this->orderFor($mine, 'mine@example.com');

        $this->withHeaders($this->authHeaders($this->apiToken($mine)))
            ->getJson("/api/orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $order->id);
    }

    public function test_an_admin_can_read_any_order(): void
    {
        $admin = $this->createApiUser(UserRole::Admin);
        $order = $this->orderFor($this->createApiUser(), 'theirs@example.com');

        $this->withHeaders($this->authHeaders($this->apiToken($admin)))
            ->getJson("/api/orders/{$order->id}")
            ->assertOk();
    }

    public function test_a_user_cannot_pay_another_users_order(): void
    {
        $mine = $this->createApiUser();
        $order = $this->orderFor($this->createApiUser(), 'theirs@example.com');

        $this->withHeaders($this->authHeaders($this->apiToken($mine)))
            ->postJson("/api/orders/{$order->id}/pay", ['card_token' => '4242424242424242'])
            ->assertNotFound();

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'status' => Order::STATUS_PENDING]);
    }

    public function test_listing_is_paginated_and_capped(): void
    {
        $admin = $this->createApiUser(UserRole::Admin);

        for ($i = 0; $i < 20; $i++) {
            $this->orderFor(null, "bulk{$i}@example.com");
        }

        $headers = $this->authHeaders($this->apiToken($admin));

        $this->withHeaders($headers)->getJson('/api/orders')
            ->assertOk()
            ->assertJsonPath('data.per_page', 15)
            ->assertJsonPath('data.total', 20)
            ->assertJsonCount(15, 'data.data');

        // An unbounded page size would defeat the point of paginating at all.
        $this->withHeaders($headers)->getJson('/api/orders?per_page=100000')
            ->assertOk()
            ->assertJsonPath('data.per_page', 100);
    }

    public function test_admin_filters_narrow_the_listing(): void
    {
        $admin = $this->createApiUser(UserRole::Admin);
        $this->orderFor(null, 'alice@example.com');
        $paid = $this->orderFor(null, 'bob@example.com');
        $paid->update(['status' => Order::STATUS_PAID]);

        $headers = $this->authHeaders($this->apiToken($admin));

        $this->withHeaders($headers)->getJson('/api/orders?filters[status]=paid')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.customer_email', 'bob@example.com');

        $this->withHeaders($headers)->getJson('/api/orders?filters[search]=ALICE')
            ->assertOk()
            ->assertJsonPath('data.total', 1)
            ->assertJsonPath('data.data.0.customer_email', 'alice@example.com');
    }

    public function test_unknown_order_filter_keys_are_ignored(): void
    {
        $admin = $this->createApiUser(UserRole::Admin);
        $this->orderFor(null, 'alice@example.com');

        $this->withHeaders($this->authHeaders($this->apiToken($admin)))
            ->getJson('/api/orders?filters[user_id]=1&filters[password]=x')
            ->assertOk()
            ->assertJsonPath('data.total', 1);
    }

    public function test_a_users_own_listing_ignores_a_user_id_filter(): void
    {
        $mine = $this->createApiUser();
        $theirs = $this->createApiUser();
        $this->orderFor($theirs, 'theirs@example.com');

        // Supplying someone else's id must not widen the scope — the filter is
        // not on the allow-list, and the scope is applied by the repository.
        $this->withHeaders($this->authHeaders($this->apiToken($mine)))
            ->getJson("/api/orders?filters[user_id]={$theirs->id}")
            ->assertOk()
            ->assertJsonPath('data.total', 0);
    }
}
