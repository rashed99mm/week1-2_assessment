<?php

use App\Http\Middleware\AddLegacyApiHeaders;
use App\Http\Middleware\EnsureUserIsAdmin;
use App\Http\Responses\ApiResponse;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        then: function (): void {
            // One route file, mounted twice.
            //
            // /api/v1 is the real API and the only thing new code should
            // target. /api is a compatibility mount for the React portal,
            // which predates versioning; it serves the same routes with
            // deprecation headers attached, and switches off with
            // LEGACY_API_ENABLED once the portal's admin pages are gone.
            //
            // The distinct name prefixes are load-bearing: registering the
            // same named routes twice throws a duplicate-name exception at
            // boot.
            Route::middleware('api')
                ->prefix('api/v1')
                ->name('v1.')
                ->group(base_path('routes/api/v1.php'));

            if (config('app.legacy_api_enabled')) {
                Route::middleware(['api', AddLegacyApiHeaders::class])
                    ->prefix('api')
                    ->name('legacy.')
                    ->group(base_path('routes/api/v1.php'));
            }
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Allow the browser front-ends to call the API directly. Allowed
        // origins are env-driven; see config/cors.php.
        $middleware->api(prepend: [HandleCors::class]);

        $middleware->alias([
            'admin' => EnsureUserIsAdmin::class,
        ]);

        // Behind the nginx reverse proxy every request arrives from a
        // container address over plain HTTP. Without trusting the forwarded
        // headers, url()/asset() generate http:// links while the browser is
        // on https://, and every event cover image is blocked as mixed
        // content. Event::coverImageUrl() builds from the request, so this is
        // load-bearing rather than cosmetic.
        //
        // Trusting '*' is safe only because nothing but the proxy can reach
        // these containers — no service port is published to the host.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // JWT middleware throws this on missing / invalid / blacklisted tokens;
        // render it through the standard API envelope instead of the raw
        // Symfony exception payload.
        $exceptions->render(function (UnauthorizedHttpException $e, Request $request) {
            return ApiResponse::error(
                $e->getMessage() !== '' ? $e->getMessage() : 'Unauthorized.',
                null,
                401,
            );
        });

        // Validation failures otherwise return Laravel's own {message, errors}
        // shape, which is a second response format the clients have to special
        // case. Wrap it so every response the API can produce looks the same.
        $exceptions->render(function (ValidationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return ApiResponse::error(
                $e->getMessage(),
                $e->errors(),
                $e->status,
            );
        });

        // Policy denials would otherwise be a third shape.
        $exceptions->render(function (AuthorizationException $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }

            return ApiResponse::error(
                $e->getMessage() !== '' ? $e->getMessage() : 'This action is unauthorized.',
                null,
                403,
            );
        });

        // An oversized cover upload is rejected by ValidatePostSize before it
        // reaches validation; render it through the standard envelope so the
        // frontend can surface it against the cover_image field.
        $exceptions->render(function (PostTooLargeException $e, Request $request) {
            return ApiResponse::error(
                'The uploaded file is too large.',
                ['cover_image' => ['The uploaded file is too large.']],
                413,
            );
        });
    })->create();
