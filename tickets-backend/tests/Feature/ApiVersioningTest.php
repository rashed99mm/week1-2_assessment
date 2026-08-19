<?php

namespace Tests\Feature;

use App\Models\Event;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The versioned API and its unversioned compatibility mount.
 *
 * The same route file is registered twice. /api/v1 is the real API; /api exists
 * only so the React portal keeps working while it is migrated, and it carries
 * deprecation headers so nobody builds against it by accident.
 */
class ApiVersioningTest extends TestCase
{
    use RefreshDatabase;

    private function makeEvent(string $title = 'Aurora Live'): Event
    {
        return Event::create([
            'title' => $title,
            'venue' => 'Rooftop Arena',
            'starts_at' => now()->addDays(7)->toDateTimeString(),
            'total_tickets' => 100,
            'status' => 'published',
        ]);
    }

    public function test_the_versioned_route_serves_the_api(): void
    {
        $this->makeEvent();

        $this->getJson('/api/v1/events')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.total', 1);
    }

    public function test_the_legacy_route_still_serves_the_same_payload(): void
    {
        $this->makeEvent();

        $versioned = $this->getJson('/api/v1/events')->assertOk();
        $legacy = $this->getJson('/api/events')->assertOk();

        $this->assertSame(
            $versioned->json('data.data.0.title'),
            $legacy->json('data.data.0.title'),
            'The compatibility mount must serve the same data, not a fork of it.'
        );
    }

    public function test_the_legacy_route_is_marked_deprecated(): void
    {
        $this->makeEvent();

        $response = $this->getJson('/api/events')->assertOk();

        $response->assertHeader('Deprecation', 'true');
        $this->assertStringContainsString('successor-version', $response->headers->get('Link'));
        $this->assertNotNull($response->headers->get('Sunset'));
    }

    public function test_the_versioned_route_is_not_marked_deprecated(): void
    {
        $this->makeEvent();

        $this->getJson('/api/v1/events')
            ->assertOk()
            ->assertHeaderMissing('Deprecation');
    }

    public function test_errors_use_the_envelope_on_both_mounts(): void
    {
        foreach (['/api/events/999999', '/api/v1/events/999999'] as $path) {
            $this->getJson($path)
                ->assertNotFound()
                ->assertJsonPath('success', false)
                ->assertJsonPath('status_code', 404)
                ->assertJsonPath('data', null);
        }
    }

    /**
     * Validation errors used to bypass the envelope and return Laravel's own
     * {message, errors} shape, leaving clients to handle two formats.
     */
    public function test_validation_errors_use_the_envelope(): void
    {
        $this->postJson('/api/v1/auth/register', ['email' => 'not-an-email'])
            ->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('status_code', 422)
            ->assertJsonPath('data', null)
            ->assertJsonStructure(['success', 'message', 'status_code', 'data', 'errors'])
            ->assertJsonValidationErrors(['email', 'password', 'name']);
    }

    /**
     * The cutover switch has to actually remove the routes, not just stop
     * advertising them — otherwise "we turned the old API off" is a comment
     * rather than a fact.
     *
     * Routes are registered while the application boots, so the flag must be
     * in the environment before refreshApplication(), not set as config after.
     */
    public function test_the_legacy_mount_can_be_switched_off(): void
    {
        $original = getenv('LEGACY_API_ENABLED');

        try {
            putenv('LEGACY_API_ENABLED=false');
            $_ENV['LEGACY_API_ENABLED'] = 'false';
            $this->refreshApplication();

            $this->assertFalse(config('app.legacy_api_enabled'));

            $apiRoutes = collect(app('router')->getRoutes()->getRoutes())
                ->map(fn ($route) => $route->uri())
                ->filter(fn (string $uri) => str_starts_with($uri, 'api/'));

            $this->assertTrue($apiRoutes->isNotEmpty(), 'Expected the versioned routes to still be registered.');

            $leftover = $apiRoutes->reject(fn (string $uri) => str_starts_with($uri, 'api/v1/'));

            $this->assertTrue(
                $leftover->isEmpty(),
                'Disabling LEGACY_API_ENABLED must leave only the versioned routes. Still mounted: '
                .$leftover->implode(', ')
            );
        } finally {
            $original === false ? putenv('LEGACY_API_ENABLED') : putenv("LEGACY_API_ENABLED={$original}");
            unset($_ENV['LEGACY_API_ENABLED']);
            $this->refreshApplication();
        }
    }
}
