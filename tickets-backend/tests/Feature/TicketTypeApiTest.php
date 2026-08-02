<?php

namespace Tests\Feature;

use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Feature tests for the TicketType REST endpoints.
 */
class TicketTypeApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Create a seeded event.
     */
    private function makeEvent(): Event
    {
        return Event::create([
            'title' => 'Test Event',
            'venue' => 'Main Hall',
            'starts_at' => now()->addDay(),
            'total_tickets' => 100,
        ]);
    }

    /**
     * Verify POST /api/ticket-types creates a ticket type.
     */
    public function test_store_creates_ticket_type(): void
    {
        $event = $this->makeEvent();

        $response = $this->postJson('/api/ticket-types', [
            'event_id' => $event->id,
            'name' => 'VIP',
            'price' => 150.00,
            'quantity' => 20,
        ]);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.name', 'VIP');

        $this->assertDatabaseHas('ticket_types', ['event_id' => $event->id, 'name' => 'VIP']);
    }

    /**
     * Verify POST /api/ticket-types rejects a non-existent event id.
     */
    public function test_store_validates_event_exists(): void
    {
        $response = $this->postJson('/api/ticket-types', [
            'event_id' => 999,
            'name' => 'VIP',
            'price' => 150.00,
            'quantity' => 20,
        ]);

        $response->assertStatus(422);
    }

    /**
     * Verify GET /api/ticket-types can be filtered by event id.
     */
    public function test_index_filters_by_event(): void
    {
        $eventA = $this->makeEvent();
        $eventB = $this->makeEvent();

        TicketType::create(['event_id' => $eventA->id, 'name' => 'GA', 'price' => 50.00, 'quantity' => 10]);
        TicketType::create(['event_id' => $eventB->id, 'name' => 'GA', 'price' => 60.00, 'quantity' => 10]);

        $response = $this->getJson("/api/ticket-types?event_id={$eventA->id}");

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonCount(1, 'data');
    }

    /**
     * Verify GET /api/ticket-types/{id} returns a single ticket type.
     */
    public function test_show_returns_ticket_type(): void
    {
        $event = $this->makeEvent();
        $ticket = TicketType::create(['event_id' => $event->id, 'name' => 'GA', 'price' => 50.00, 'quantity' => 10]);

        $this->getJson("/api/ticket-types/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('data.id', $ticket->id);
    }

    /**
     * Verify PUT /api/ticket-types/{id} updates a ticket type.
     */
    public function test_update_updates_ticket_type(): void
    {
        $event = $this->makeEvent();
        $ticket = TicketType::create(['event_id' => $event->id, 'name' => 'GA', 'price' => 50.00, 'quantity' => 10]);

        $this->putJson("/api/ticket-types/{$ticket->id}", ['price' => 75.00])
            ->assertOk()
            ->assertJsonPath('data.price', '75.00');
    }

    /**
     * Verify DELETE /api/ticket-types/{id} deletes a ticket type.
     */
    public function test_destroy_deletes_ticket_type(): void
    {
        $event = $this->makeEvent();
        $ticket = TicketType::create(['event_id' => $event->id, 'name' => 'GA', 'price' => 50.00, 'quantity' => 10]);

        $this->deleteJson("/api/ticket-types/{$ticket->id}")
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('ticket_types', ['id' => $ticket->id]);
    }

    /**
     * Verify DELETE /api/ticket-types/{id} returns 409 when the ticket type has orders.
     */
    public function test_destroy_with_orders_returns_conflict(): void
    {
        $event = $this->makeEvent();
        $ticket = TicketType::create(['event_id' => $event->id, 'name' => 'GA', 'price' => 50.00, 'quantity' => 10]);
        Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $ticket->id,
            'customer_name' => 'Jane Doe',
            'customer_email' => 'jane@example.com',
            'quantity' => 1,
            'unit_price' => 50.00,
            'total_amount' => 50.00,
            'status' => 'pending',
        ]);

        $this->deleteJson("/api/ticket-types/{$ticket->id}")
            ->assertStatus(409)
            ->assertJsonPath('success', false);

        $this->assertDatabaseHas('ticket_types', ['id' => $ticket->id]);
    }
}
