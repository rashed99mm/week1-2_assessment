<?php

namespace App\Http\Middleware;

use App\Http\Responses\ApiResponse;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restricts a route to administrator accounts.
 *
 * Always applied after `jwt.auth`, which is what rejects a missing or invalid
 * token. This middleware only answers "is this authenticated user allowed
 * here", so a request that reaches it already has a verified identity.
 *
 * The role is read from the database rather than from the token claim. Both
 * would work, but only the column reflects a demotion that happened after the
 * token was issued, and this service owns that data.
 */
class EnsureUserIsAdmin
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): Response  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $user = auth('api')->user();

        // Defensive: reaching here without a user means the route is missing
        // its jwt.auth middleware. Fail closed rather than dereferencing null.
        if ($user === null) {
            return ApiResponse::error('Unauthenticated.', null, 401);
        }

        if (! $user->isAdmin()) {
            return ApiResponse::error(
                'This action requires administrator privileges.',
                null,
                403,
            );
        }

        return $next($request);
    }
}
