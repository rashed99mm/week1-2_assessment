<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marks responses served from the unversioned /api/* compatibility mount.
 *
 * The React portal predates versioning and calls `/api/events` directly. Rather
 * than rewriting call sites in code that is scheduled for partial deletion, the
 * same routes are mounted twice and the old prefix is flagged as deprecated.
 *
 * Clients see standard signalling (RFC 8594 `Sunset`, RFC 9745 `Deprecation`)
 * instead of a silent difference in behaviour, and `LEGACY_API_ENABLED=false`
 * turns the mount off entirely once nothing depends on it.
 */
class AddLegacyApiHeaders
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $response->headers->set('Deprecation', 'true');
        $response->headers->set('Link', '</api/v1>; rel="successor-version"');

        if ($sunset = config('app.legacy_api_sunset')) {
            // RFC 8594 requires an HTTP-date here, not an ISO 8601 string.
            $response->headers->set('Sunset', gmdate('D, d M Y H:i:s \G\M\T', strtotime($sunset)));
        }

        return $response;
    }
}
