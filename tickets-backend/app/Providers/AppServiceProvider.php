<?php

namespace App\Providers;

use App\Repositories\Contracts\EventRepositoryInterface;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Repositories\Contracts\TicketTypeRepositoryInterface;
use App\Repositories\Eloquent\EventRepository;
use App\Repositories\Eloquent\OrderRepository;
use App\Repositories\Eloquent\TicketTypeRepository;
use Illuminate\Support\ServiceProvider;

/**
 * Registers application-wide services and repository bindings.
 */
class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->bind(EventRepositoryInterface::class, EventRepository::class);
        $this->app->bind(TicketTypeRepositoryInterface::class, TicketTypeRepository::class);
        $this->app->bind(OrderRepositoryInterface::class, OrderRepository::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
