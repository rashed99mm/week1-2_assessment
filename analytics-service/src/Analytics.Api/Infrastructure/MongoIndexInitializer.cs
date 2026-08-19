using Analytics.Api.Models;
using MongoDB.Driver;

namespace Analytics.Api.Infrastructure;

/// <summary>
/// Creates the indexes the aggregation pipelines depend on.
/// </summary>
/// <remarks>
/// Run at start-up rather than left to grow organically. Every dashboard
/// query begins with a date <c>$match</c>, and without these indexes each one
/// is a collection scan — invisible on a seeded demo dataset, and the first
/// thing to fall over once a shop has been trading for a few months.
///
/// Index creation is idempotent: an existing index with the same
/// specification is a no-op.
/// </remarks>
public sealed class MongoIndexInitializer(MongoContext context, ILogger<MongoIndexInitializer> logger)
    : IHostedService
{
    private CancellationTokenSource? _cts;

    /// <summary>
    /// Kick index creation off in the background and return immediately.
    /// </summary>
    /// <remarks>
    /// Deliberately does not block start-up on MongoDB being reachable.
    /// Blocking here means the container fails to boot whenever the database
    /// is a few seconds behind it, turning an ordinary start-up ordering
    /// question into a crash loop — and the health endpoint already reports
    /// the database as down, which is the honest signal.
    /// </remarks>
    public Task StartAsync(CancellationToken cancellationToken)
    {
        _cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);

        _ = Task.Run(() => EnsureWithRetryAsync(_cts.Token), CancellationToken.None);

        return Task.CompletedTask;
    }

    private async Task EnsureWithRetryAsync(CancellationToken cancellationToken)
    {
        var delay = TimeSpan.FromSeconds(2);

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await EnsureIndexesAsync(cancellationToken);
                return;
            }
            catch (OperationCanceledException)
            {
                return;
            }
            catch (Exception e)
            {
                logger.LogWarning(
                    e,
                    "Could not create read-model indexes; retrying in {Delay}.",
                    delay);
            }

            try
            {
                await Task.Delay(delay, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }

            delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 2, 60));
        }
    }

    private async Task EnsureIndexesAsync(CancellationToken cancellationToken)
    {
        await context.OrderFacts.Indexes.CreateManyAsync(
            [
                // The order list and the funnel, both bounded by creation date.
                new CreateIndexModel<OrderFact>(
                    Builders<OrderFact>.IndexKeys.Descending(f => f.CreatedAt)),

                // Revenue queries: paid orders in a date range.
                new CreateIndexModel<OrderFact>(
                    Builders<OrderFact>.IndexKeys
                        .Ascending(f => f.Status)
                        .Descending(f => f.PaidAt)),

                // Sales grouped by event, and by ticket type within an event.
                new CreateIndexModel<OrderFact>(
                    Builders<OrderFact>.IndexKeys
                        .Ascending(f => f.EventId)
                        .Ascending(f => f.Status)),

                new CreateIndexModel<OrderFact>(
                    Builders<OrderFact>.IndexKeys
                        .Ascending(f => f.TicketTypeId)
                        .Ascending(f => f.Status)),
            ],
            cancellationToken);

        await context.RevenueDaily.Indexes.CreateManyAsync(
            [
                new CreateIndexModel<RevenueDaily>(
                    Builders<RevenueDaily>.IndexKeys.Ascending(r => r.Date)),

                new CreateIndexModel<RevenueDaily>(
                    Builders<RevenueDaily>.IndexKeys
                        .Ascending(r => r.EventId)
                        .Ascending(r => r.Date)),
            ],
            cancellationToken);

        await context.EventDims.Indexes.CreateOneAsync(
            new CreateIndexModel<EventDim>(
                Builders<EventDim>.IndexKeys.Ascending(e => e.StartsAt)),
            cancellationToken: cancellationToken);

        await context.UserDims.Indexes.CreateOneAsync(
            new CreateIndexModel<UserDim>(
                Builders<UserDim>.IndexKeys.Descending(u => u.RegisteredAt)),
            cancellationToken: cancellationToken);

        // Redelivery windows are measured in minutes, so keeping these forever
        // would grow a collection nothing reads. Thirty days is generous.
        await context.ProcessedEvents.Indexes.CreateOneAsync(
            new CreateIndexModel<ProcessedEvent>(
                Builders<ProcessedEvent>.IndexKeys.Ascending(p => p.ProcessedAt),
                new CreateIndexOptions { ExpireAfter = TimeSpan.FromDays(30) }),
            cancellationToken: cancellationToken);

        logger.LogInformation("Read-model indexes ensured.");
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        _cts?.Cancel();
        return Task.CompletedTask;
    }
}
