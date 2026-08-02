<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\OrderController;
use App\Http\Controllers\TicketTypeController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| REST endpoints for the tickets mini-module. Events and ticket types are
| fully CRUD-able, orders support create/read plus a payment action that
| delegates to the FastAPI payment gateway.
|
| Authentication uses stateless JWT (HS256). Every route below except the
| public `auth/register` and `auth/login` endpoints requires a valid
| `Authorization: Bearer <token>` header.
|
*/

// Public authentication endpoints. Login is rate-limited to 5 attempts per
// minute to slow down brute-force attacks.
Route::prefix('auth')->group(function (): void {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:5,1');
});

// Everything else requires a valid JWT.
Route::middleware('jwt.auth')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::post('auth/refresh', [AuthController::class, 'refresh']);
    Route::get('auth/me', [AuthController::class, 'me']);

    Route::apiResource('events', EventController::class);
    Route::apiResource('ticket-types', TicketTypeController::class)->except(['create', 'edit']);
    Route::apiResource('orders', OrderController::class)->only(['index', 'show', 'store']);
    Route::post('orders/{id}/pay', [OrderController::class, 'pay']);
});
