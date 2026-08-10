<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Models\EventType;
use App\Models\Order;
use App\Models\TicketType;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Seeds the database with a demo user, event types, events, ticket types
 * and orders.
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

        $types = collect([
            ['name' => 'Concert', 'slug' => 'concert', 'is_online' => false, 'seating_model' => 'assigned'],
            ['name' => 'Conference', 'slug' => 'conference', 'is_online' => false, 'seating_model' => 'general'],
            ['name' => 'Workshop', 'slug' => 'workshop', 'is_online' => false, 'seating_model' => 'general'],
            ['name' => 'Sports', 'slug' => 'sports', 'is_online' => false, 'seating_model' => 'assigned'],
            ['name' => 'Theater', 'slug' => 'theater', 'is_online' => false, 'seating_model' => 'assigned'],
            ['name' => 'Festival', 'slug' => 'festival', 'is_online' => false, 'seating_model' => 'general'],
            ['name' => 'Webinar', 'slug' => 'webinar', 'is_online' => true, 'seating_model' => 'general'],
            ['name' => 'Meetup', 'slug' => 'meetup', 'is_online' => false, 'seating_model' => 'general'],
        ])->each(function (array $type): void {
            EventType::create($type);
        });

        $concert = EventType::where('slug', 'concert')->first();
        $conference = EventType::where('slug', 'conference')->first();
        $workshop = EventType::where('slug', 'workshop')->first();
        $sports = EventType::where('slug', 'sports')->first();
        $theater = EventType::where('slug', 'theater')->first();
        $webinar = EventType::where('slug', 'webinar')->first();

        $festival = Event::create([
            'title' => 'Summer Music Festival',
            'description' => 'A weekend of live music, food and fun across three stages.',
            'venue' => 'Central Park Arena',
            'event_type_id' => $concert->id,
            'starts_at' => now()->addDays(14),
            'ends_at' => now()->addDays(16),
            'total_tickets' => 500,
            'status' => 'published',
        ]);

        $conferenceEvent = Event::create([
            'title' => 'Tech Leaders Conference 2026',
            'description' => 'Two days of keynotes and panels on AI, platform engineering and product design.',
            'venue' => 'Metro Convention Center',
            'event_type_id' => $conference->id,
            'starts_at' => now()->addDays(21),
            'ends_at' => now()->addDays(22),
            'total_tickets' => 400,
            'status' => 'published',
        ]);

        $theaterEvent = Event::create([
            'title' => 'The Midnight Playhouse',
            'description' => 'An intimate evening of live theater with an acclaimed cast.',
            'venue' => 'Royal Opera House',
            'event_type_id' => $theater->id,
            'starts_at' => now()->addDays(9),
            'ends_at' => now()->addDays(9)->addHours(3),
            'total_tickets' => 120,
            'status' => 'published',
        ]);

        $sportsEvent = Event::create([
            'title' => 'City Derby — Football Final',
            'description' => 'The championship decider between the city’s two biggest clubs.',
            'venue' => 'National Stadium',
            'event_type_id' => $sports->id,
            'starts_at' => now()->addDays(30),
            'ends_at' => now()->addDays(30)->addHours(4),
            'total_tickets' => 3000,
            'status' => 'published',
        ]);

        $workshopEvent = Event::create([
            'title' => 'Hands-on Rust Workshop',
            'description' => 'A full-day guided workshop moving from zero to a working CLI tool.',
            'venue' => 'Dev Hub Studio',
            'event_type_id' => $workshop->id,
            'starts_at' => now()->addDays(6),
            'ends_at' => now()->addDays(6)->addHours(8),
            'total_tickets' => 40,
            'status' => 'published',
        ]);

        $webinarEvent = Event::create([
            'title' => 'Scaling APIs: Free Live Webinar',
            'description' => 'A free online session on designing APIs that scale gracefully.',
            'venue' => 'Online',
            'event_type_id' => $webinar->id,
            'starts_at' => now()->addDays(5),
            'ends_at' => now()->addDays(5)->addHours(1)->addMinutes(30),
            'total_tickets' => 1000,
            'status' => 'published',
        ]);

        $draftEvent = Event::create([
            'title' => 'Winter Jazz Nights',
            'description' => 'Cozy jazz performances across the downtown district.',
            'venue' => 'Blue Note Lounge',
            'event_type_id' => $concert->id,
            'starts_at' => now()->addDays(45),
            'ends_at' => now()->addDays(47),
            'total_tickets' => 200,
            'status' => 'draft',
        ]);

        $general = TicketType::create([
            'event_id' => $festival->id,
            'name' => 'General Admission',
            'price' => 50.00,
            'quantity' => 300,
        ]);

        $vip = TicketType::create([
            'event_id' => $festival->id,
            'name' => 'VIP',
            'price' => 150.00,
            'quantity' => 100,
        ]);

        $earlyBird = TicketType::create([
            'event_id' => $conferenceEvent->id,
            'name' => 'Early Bird',
            'price' => 199.00,
            'quantity' => 150,
        ]);

        $standard = TicketType::create([
            'event_id' => $conferenceEvent->id,
            'name' => 'Standard Pass',
            'price' => 299.00,
            'quantity' => 250,
        ]);

        $stalls = TicketType::create([
            'event_id' => $theaterEvent->id,
            'name' => 'Stalls',
            'price' => 75.00,
            'quantity' => 60,
        ]);

        $circle = TicketType::create([
            'event_id' => $theaterEvent->id,
            'name' => 'Upper Circle',
            'price' => 45.00,
            'quantity' => 60,
        ]);

        $southStand = TicketType::create([
            'event_id' => $sportsEvent->id,
            'name' => 'South Stand',
            'price' => 40.00,
            'quantity' => 2000,
        ]);

        $northStand = TicketType::create([
            'event_id' => $sportsEvent->id,
            'name' => 'North Stand',
            'price' => 25.00,
            'quantity' => 1000,
        ]);

        $workshopSeat = TicketType::create([
            'event_id' => $workshopEvent->id,
            'name' => 'Participant Seat',
            'price' => 120.00,
            'quantity' => 40,
        ]);

        $webinarSeat = TicketType::create([
            'event_id' => $webinarEvent->id,
            'name' => 'Free Ticket',
            'price' => 0.00,
            'quantity' => 1000,
        ]);

        Order::create([
            'event_id' => $festival->id,
            'ticket_type_id' => $general->id,
            'customer_name' => 'Jane Doe',
            'customer_email' => 'jane@example.com',
            'quantity' => 2,
            'unit_price' => $general->price,
            'total_amount' => $general->price * 2,
            'status' => 'pending',
        ]);

        Order::create([
            'event_id' => $festival->id,
            'ticket_type_id' => $vip->id,
            'customer_name' => 'John Smith',
            'customer_email' => 'john@example.com',
            'quantity' => 1,
            'unit_price' => $vip->price,
            'total_amount' => $vip->price,
            'status' => 'pending',
        ]);

        Order::create([
            'event_id' => $theaterEvent->id,
            'ticket_type_id' => $stalls->id,
            'customer_name' => 'Alice Brown',
            'customer_email' => 'alice@example.com',
            'quantity' => 3,
            'unit_price' => $stalls->price,
            'total_amount' => $stalls->price * 3,
            'status' => 'paid',
        ]);

        Order::create([
            'event_id' => $workshopEvent->id,
            'ticket_type_id' => $workshopSeat->id,
            'customer_name' => 'Bob Wilson',
            'customer_email' => 'bob@example.com',
            'quantity' => 1,
            'unit_price' => $workshopSeat->price,
            'total_amount' => $workshopSeat->price,
            'status' => 'paid',
        ]);

        $this->seedExtraEvents();

        // Topical cover photos for every event, chosen from its type.
        $this->call(EventCoverSeeder::class);
    }

    /**
     * A broader catalogue so every event type, seating model and venue size is
     * represented — the seat map adapts to the stage type and switches to
     * tiered sections past 600 seats, and none of that is visible with only a
     * handful of events.
     */
    private function seedExtraEvents(): void
    {
        $typeIds = EventType::pluck('id', 'slug');

        $catalogue = [
            ['Neon Skyline Live', 'concert', 'The Warehouse', 22, 3, 900, [
                ['Front Standing', 65.00, 400], ['Balcony', 95.00, 300], ['VIP Lounge', 180.00, 200],
            ]],
            ['Acoustic Sessions: Winter', 'concert', 'Old Chapel Hall', 33, 2, 260, [
                ['Unreserved', 38.00, 180], ['Front Rows', 62.00, 80],
            ]],
            ['DesignOps Summit', 'conference', 'Riverside Convention Centre', 27, 8, 700, [
                ['Standard Pass', 249.00, 480], ['Premium Pass', 429.00, 220],
            ]],
            ['State of Frontend 2026', 'conference', 'Metro Tech Campus', 51, 4, 420, [
                ['General', 149.00, 320], ['Workshop Add-on', 259.00, 100],
            ]],
            ['Pottery for Absolute Beginners', 'workshop', 'Kiln Street Studio', 11, 1, 40, [
                ['Bench Seat', 55.00, 40],
            ]],
            ['Championship Semi-Final', 'sports', 'National Stadium', 19, 6, 1800, [
                ['East Stand', 45.00, 800], ['West Stand', 45.00, 700], ['Club Seats', 140.00, 300],
            ]],
            ['Courtside: City vs Rivals', 'sports', 'Dome Arena', 40, 5, 1200, [
                ['Upper Tier', 30.00, 700], ['Lower Tier', 70.00, 400], ['Courtside', 220.00, 100],
            ]],
            ['A Midsummer Night\'s Dream', 'theater', 'The Rosewood Theatre', 29, 7, 520, [
                ['Stalls', 68.00, 260], ['Dress Circle', 88.00, 180], ['Box', 165.00, 80],
            ]],
            ['Harbour Lights Festival', 'festival', 'Dockside Grounds', 60, 9, 1500, [
                ['Day Pass', 55.00, 900], ['Weekend Pass', 120.00, 600],
            ]],
            ['Testing Legacy PHP: Live Q&A', 'webinar', 'Online', 8, 2, 800, [
                ['Free Seat', 0.00, 800],
            ]],
            ['Laravel & React Meetup', 'meetup', 'Foundry Coworking', 6, 1, 120, [
                ['Standard', 0.00, 100], ['Supporter', 15.00, 20],
            ]],
        ];

        foreach ($catalogue as [$title, $slug, $venue, $startsInDays, $lengthHours, $capacity, $tickets]) {
            $event = Event::create([
                'title' => $title,
                'description' => "{$title} at {$venue}.",
                'venue' => $venue,
                'event_type_id' => $typeIds[$slug] ?? null,
                'starts_at' => now()->addDays($startsInDays),
                'ends_at' => now()->addDays($startsInDays)->addHours($lengthHours),
                'total_tickets' => $capacity,
                'status' => 'published',
            ]);

            foreach ($tickets as [$name, $price, $quantity]) {
                TicketType::create([
                    'event_id' => $event->id,
                    'name' => $name,
                    'price' => $price,
                    'quantity' => $quantity,
                ]);
            }
        }
    }
}
