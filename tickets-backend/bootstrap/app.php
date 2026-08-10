<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Middleware\HandleCors;
use Illuminate\Http\Request;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Allow the React frontend (Vite dev origin) to call the API directly.
        $middleware->api(prepend: [HandleCors::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*'),
        );

        // JWT middleware throws this on missing / invalid / blacklisted tokens;
        // render it through the standard API envelope instead of the raw
        // Symfony exception payload.
        $exceptions->render(function (UnauthorizedHttpException $e, Request $request) {
            return App\Http\Responses\ApiResponse::error(
                $e->getMessage() !== '' ? $e->getMessage() : 'Unauthorized.',
                null,
                401,
            );
        });

        // An oversized cover upload is rejected by ValidatePostSize before it
        // reaches validation; render it through the standard envelope so the
        // frontend can surface it against the cover_image field.
        $exceptions->render(function (PostTooLargeException $e, Request $request) {
            return App\Http\Responses\ApiResponse::error(
                'The uploaded file is too large.',
                ['cover_image' => ['The uploaded file is too large.']],
                413,
            );
        });
    })->create();
