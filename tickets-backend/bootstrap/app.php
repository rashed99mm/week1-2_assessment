<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
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
        //
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
    })->create();
