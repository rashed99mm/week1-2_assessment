<?php

use App\Http\Controllers\Admin\EventTypeController as AdminEventTypeController;
use App\Http\Controllers\Admin\OrderController as AdminOrderController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\EventController;
use App\Http\Controllers\EventTypeController;
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
| Public browsing (event and ticket-type listings plus per-event seat
| availability) is available without authentication so the storefront can
| be explored before sign-up. Everything that mutates data — and every
| order/payment action — requires a valid `Authorization: Bearer <token>`
| (stateless JWT, HS256).
|
*/

// Public authentication endpoints. Login is rate-limited to 5 attempts per
// minute to slow down brute-force attacks.
Route::prefix('auth')->group(function (): void {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:5,1');
});

// Public read-only browsing: events, their ticket types and seat availability.
Route::get('events', [EventController::class, 'index'])->name('events.index');
Route::get('events/{id}', [EventController::class, 'show'])->name('events.show');
Route::get('events/{id}/availability', [EventController::class, 'availability'])->name('events.availability');
Route::get('ticket-types', [TicketTypeController::class, 'index'])->name('ticket-types.index');
Route::get('ticket-types/{id}', [TicketTypeController::class, 'show'])->name('ticket-types.show');
Route::get('event-types', [EventTypeController::class, 'index'])->name('event-types.index');
Route::get('event-types/{id}', [EventTypeController::class, 'show'])->name('event-types.show');

// Any authenticated user: their own session, and their own orders.
//
// `orders.index` is scoped to the caller inside OrderRepository rather than in
// the controller, so no future code path can accidentally return the whole
// table. Reading or paying an individual order is gated by OrderPolicy.
Route::middleware('jwt.auth')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::post('auth/refresh', [AuthController::class, 'refresh']);
    Route::get('auth/me', [AuthController::class, 'me']);

    Route::apiResource('orders', OrderController::class)->only(['index', 'show', 'store']);
    Route::post('orders/{id}/pay', [OrderController::class, 'pay']);
});

// Administrators only: the catalogue is editorial content, not user data.
//
// These were previously behind `jwt.auth` alone, which meant any account that
// completed the public registration form could edit or delete every event and
// ticket type in the system.
Route::middleware(['jwt.auth', 'admin'])->group(function (): void {
    Route::post('events', [EventController::class, 'store'])->name('events.store');
    Route::put('events/{id}', [EventController::class, 'update'])->name('events.update');
    Route::delete('events/{id}', [EventController::class, 'destroy'])->name('events.destroy');

    Route::post('ticket-types', [TicketTypeController::class, 'store'])->name('ticket-types.store');
    Route::put('ticket-types/{id}', [TicketTypeController::class, 'update'])->name('ticket-types.update');
    Route::delete('ticket-types/{id}', [TicketTypeController::class, 'destroy'])->name('ticket-types.destroy');

    // The back-office surface consumed by the Angular CMS. Grouped under
    // /admin so the privilege boundary is visible in the URL as well as in the
    // middleware — a route added to the wrong group is easier to spot.
    Route::prefix('admin')->name('admin.')->group(function (): void {
        Route::get('orders', [AdminOrderController::class, 'index'])->name('orders.index');
        Route::get('orders/{id}', [AdminOrderController::class, 'show'])->name('orders.show');
        Route::patch('orders/{id}/status', [AdminOrderController::class, 'updateStatus'])->name('orders.status');
        Route::post('orders/{id}/refund', [AdminOrderController::class, 'refund'])->name('orders.refund');

        Route::post('event-types', [AdminEventTypeController::class, 'store'])->name('event-types.store');
        Route::put('event-types/{id}', [AdminEventTypeController::class, 'update'])->name('event-types.update');
        Route::delete('event-types/{id}', [AdminEventTypeController::class, 'destroy'])->name('event-types.destroy');

        Route::get('users', [AdminUserController::class, 'index'])->name('users.index');
        Route::patch('users/{id}/role', [AdminUserController::class, 'updateRole'])->name('users.role');
    });
});
