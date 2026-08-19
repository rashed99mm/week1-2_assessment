<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Scheduled tasks
|--------------------------------------------------------------------------
|
| Run by the `scheduler` container (php artisan schedule:work).
|
*/

// Tickets held by an abandoned checkout are worth returning quickly — a
// sold-out event that is not really sold out costs a sale every minute.
// withoutOverlapping matters because a large backlog can take longer than the
// minute between runs, and two sweepers releasing the same order would be
// caught by the status re-check but would still waste the work.
Schedule::command('orders:expire-pending')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();

// The outbox safety net. Covers events whose publish job never ran — a worker
// that died between the commit and picking the job up, or one that exhausted
// its retries while the broker was down. Without this the read models silently
// drift from the system of record while orders keep succeeding.
Schedule::command('events:relay-unpublished')
    ->everyMinute()
    ->withoutOverlapping()
    ->runInBackground();
