<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\Order;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds the database with a demo user, event, ticket types and orders.
 */
class DatabaseSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        User::create([
            'name' => 'Demo Admin',
            'email' => 'admin@example.com',
            'password' => 'password',
        ]);

        $event = Event::create([
            'title' => 'Summer Music Festival',
            'description' => 'A weekend of live music, food and fun.',
            'venue' => 'Central Park Arena',
            'starts_at' => now()->addDays(14),
            'ends_at' => now()->addDays(16),
            'total_tickets' => 500,
            'status' => 'published',
        ]);

        $general = TicketType::create([
            'event_id' => $event->id,
            'name' => 'General Admission',
            'price' => 50.00,
            'quantity' => 300,
        ]);

        $vip = TicketType::create([
            'event_id' => $event->id,
            'name' => 'VIP',
            'price' => 150.00,
            'quantity' => 100,
        ]);

        Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $general->id,
            'customer_name' => 'Jane Doe',
            'customer_email' => 'jane@example.com',
            'quantity' => 2,
            'unit_price' => $general->price,
            'total_amount' => $general->price * 2,
            'status' => 'pending',
        ]);

        Order::create([
            'event_id' => $event->id,
            'ticket_type_id' => $vip->id,
            'customer_name' => 'John Smith',
            'customer_email' => 'john@example.com',
            'quantity' => 1,
            'unit_price' => $vip->price,
            'total_amount' => $vip->price,
            'status' => 'pending',
        ]);
    }
}
