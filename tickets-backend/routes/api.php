<?php

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
*/

Route::apiResource('events', EventController::class);
Route::apiResource('ticket-types', TicketTypeController::class)->except(['create', 'edit']);
Route::apiResource('orders', OrderController::class)->only(['index', 'show', 'store']);
Route::post('orders/{id}/pay', [OrderController::class, 'pay']);
