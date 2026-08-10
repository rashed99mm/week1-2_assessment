<?php

namespace Database\Seeders;

use App\Models\Event;
use App\Services\EventCoverService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Generate demo cover images for a few seeded events.
 *
 * Images are drawn with GD at seed time rather than committed to the repo, so
 * no binary assets live in git and `migrate:fresh --seed` works offline. Events
 * left without a cover fall back to the procedural poster in the frontend,
 * which keeps that path exercised in development.
 */
class EventCoverSeeder extends Seeder
{
    private const WIDTH = 1280;

    private const HEIGHT = 800;

    private const TIMEOUT_SECONDS = 25;

    /** Fallback service when an event has no recognised type. */
    private const RANDOM_ENDPOINT = 'https://picsum.photos';

    /**
     * Curated Unsplash photo ids per event type, so every event gets an image
     * that actually relates to it. Several per type keep a listing page from
     * looking like the same picture repeated; the choice is made from the event
     * id, so re-seeding is deterministic.
     *
     * @var array<string, array<int, string>>
     */
    private const PHOTOS_BY_TYPE = [
        'concert' => [
            'photo-1470229722913-7c0e2dbbafd3',
            'photo-1493225457124-a3eb161ffa5f',
            'photo-1415201364774-f6f0bb35f28f',
        ],
        'conference' => [
            'photo-1540575467063-178a50c2df87',
            'photo-1505373877841-8d25f7d46678',
            'photo-1451187580459-43490279c0fa',
        ],
        'workshop' => [
            'photo-1517245386807-bb43f82c33c4',
            'photo-1505373877841-8d25f7d46678',
        ],
        'sports' => [
            'photo-1522778119026-d647f0596c20',
            'photo-1459865264687-595d652de67e',
            'photo-1546519638-68e109498ffc',
        ],
        'theater' => [
            'photo-1503095396549-807759245b35',
            'photo-1507924538820-ede94a04019d',
            'photo-1580809361436-42a7ec204889',
        ],
        'festival' => [
            'photo-1533174072545-7a4b6ad7a6c3',
            'photo-1514525253161-7a46d19cd819',
        ],
        'webinar' => [
            'photo-1587614382346-4ec70e388b28',
            'photo-1451187580459-43490279c0fa',
        ],
        'meetup' => [
            'photo-1511578314322-379afb476865',
            'photo-1516450360452-9312f5e86fc7',
        ],
    ];

    /**
     * Run against every event by default, so
     * `php artisan db:seed --class=EventCoverSeeder` fills in any event that is
     * still missing a cover. Pass explicit titles to narrow it.
     *
     * @var array<int, string>
     */
    private const DEFAULT_TITLES = ['*'];

    /**
     * @param  array<int, string>  $titles  Titles of the events that get a cover.
     */
    public function run(array $titles = []): void
    {
        $titles = $titles === [] ? self::DEFAULT_TITLES : $titles;

        if (app()->runningUnitTests()) {
            return;
        }

        $events = $titles === ['*']
            ? Event::query()->get()
            : Event::whereIn('title', $titles)->get();

        foreach ($events as $event) {
            [$bytes, $extension] = $this->cover($event);

            if ($bytes === null) {
                $this->command?->warn("No cover generated for \"{$event->title}\".");

                continue;
            }

            $path = EventCoverService::DIRECTORY.'/'.Str::random(40).'.'.$extension;

            Storage::disk(EventCoverService::DISK)->put($path, $bytes);

            // forceFill keeps this working even if cover_image_path is later
            // removed from the model's fillable list.
            $event->forceFill(['cover_image_path' => $path])->save();
        }
    }

    /**
     * Fetch a photograph related to the event, falling back to a drawn gradient.
     *
     * The choice is derived from the event's id, so re-running the seeder gives
     * each event the same photo. If the machine is offline the download simply
     * fails and the GD fallback keeps the demo working.
     *
     * @return array{0: string|null, 1: string}
     */
    private function cover(Event $event): array
    {
        try {
            $response = Http::timeout(self::TIMEOUT_SECONDS)->get($this->photoUrl($event));

            if ($response->successful() && $response->body() !== '') {
                return [$response->body(), 'jpg'];
            }
        } catch (\Throwable $e) {
            $this->command?->warn("Could not download a photo for \"{$event->title}\": {$e->getMessage()}");
        }

        return [extension_loaded('gd') ? $this->render($event->title) : null, 'png'];
    }

    /**
     * Pick a topical photo for the event's type, or a random one if the type is
     * unrecognised.
     */
    private function photoUrl(Event $event): string
    {
        $photos = self::PHOTOS_BY_TYPE[$event->eventType?->slug] ?? null;

        if ($photos === null) {
            $seed = Str::slug($event->title) ?: (string) crc32($event->title);

            return sprintf('%s/seed/%s/%d/%d', self::RANDOM_ENDPOINT, $seed, self::WIDTH, self::HEIGHT);
        }

        $photo = $photos[$event->id % count($photos)];

        return sprintf(
            'https://images.unsplash.com/%s?w=%d&h=%d&fit=crop&q=80',
            $photo,
            self::WIDTH,
            self::HEIGHT,
        );
    }

    /**
     * Draw a dark gradient poster seeded from the event title, so each cover
     * differs while staying inside the product's near-black palette.
     */
    private function render(string $title): string
    {
        $image = imagecreatetruecolor(self::WIDTH, self::HEIGHT);
        $seed = crc32($title);

        for ($y = 0; $y < self::HEIGHT; $y++) {
            $shade = (int) (18 + ($y / self::HEIGHT) * 42);
            $colour = imagecolorallocate(
                $image,
                min(255, $shade + ($seed % 46)),
                min(255, $shade + (($seed >> 8) % 26)),
                min(255, $shade + (($seed >> 16) % 34)),
            );
            imageline($image, 0, $y, self::WIDTH, $y, $colour);
        }

        $accent = imagecolorallocatealpha($image, 198, 57, 63, 84);
        imagefilledellipse(
            $image,
            (int) (self::WIDTH * (0.3 + ($seed % 40) / 100)),
            (int) (self::HEIGHT * 0.32),
            (int) (self::WIDTH * 0.7),
            (int) (self::HEIGHT * 0.5),
            $accent,
        );

        imagestring(
            $image,
            5,
            60,
            self::HEIGHT - 90,
            substr($title, 0, 48),
            imagecolorallocate($image, 255, 255, 255),
        );

        ob_start();
        imagepng($image);
        imagedestroy($image);

        return (string) ob_get_clean();
    }
}
