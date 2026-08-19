<?php

namespace App\Providers;

use App\Models\Event;
use App\Models\Order;
use App\Observers\EventObserver;
use App\Policies\OrderPolicy;
use App\Repositories\Contracts\EventRepositoryInterface;
use App\Repositories\Contracts\EventTypeRepositoryInterface;
use App\Repositories\Contracts\OrderRepositoryInterface;
use App\Repositories\Contracts\TicketTypeRepositoryInterface;
use App\Repositories\Contracts\UserRepositoryInterface;
use App\Repositories\Eloquent\EventRepository;
use App\Repositories\Eloquent\EventTypeRepository;
use App\Repositories\Eloquent\OrderRepository;
use App\Repositories\Eloquent\TicketTypeRepository;
use App\Repositories\Eloquent\UserRepository;
use App\Support\Messaging\EventPublisher;
use App\Support\Messaging\NullPublisher;
use App\Support\Messaging\RabbitMqPublisher;
use Illuminate\Support\Facades\Gate;
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
        $this->app->bind(EventTypeRepositoryInterface::class, EventTypeRepository::class);
        $this->app->bind(TicketTypeRepositoryInterface::class, TicketTypeRepository::class);
        $this->app->bind(OrderRepositoryInterface::class, OrderRepository::class);
        $this->app->bind(UserRepositoryInterface::class, UserRepository::class);

        // Singleton so a queue worker reuses one AMQP connection across the
        // many events it publishes rather than reconnecting per message.
        $this->app->singleton(EventPublisher::class, function (): EventPublisher {
            return config('messaging.enabled')
                ? new RabbitMqPublisher(config('messaging.rabbitmq'))
                : new NullPublisher;
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Registered explicitly rather than by naming convention so the
        // mapping is greppable — an authorization rule that silently stops
        // applying because a class moved is not a failure mode worth having.
        Gate::policy(Order::class, OrderPolicy::class);

        // An observer rather than a check inside EventService::update(): the
        // repository returns the model after the change, so the previous
        // status is no longer available there. wasChanged() is unambiguous and
        // cannot be bypassed by a future code path that writes events directly.
        Event::observe(EventObserver::class);
    }
}
