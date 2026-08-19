using Analytics.Api.Infrastructure;
using Analytics.Api.Models;
using EphemeralMongo;
using MongoDB.Driver;
using Xunit;

namespace Analytics.Tests;

/// <summary>
/// A real MongoDB server, started as a child process for the test run.
/// </summary>
/// <remarks>
/// Not a fake and not a container. The aggregation pipelines are the thing
/// under test, and a substitute that only approximated <c>$dateTrunc</c> or
/// <c>$lookup</c> would let a test pass while the dashboard was wrong.
/// Running the genuine <c>mongod</c> binary means the pipelines are executed
/// by the same engine production uses, without needing a Docker daemon.
///
/// Shared across a test class — start-up costs a second or two — with each
/// test clearing the collections instead.
/// </remarks>
public sealed class MongoFixture : IAsyncLifetime
{
    private IMongoRunner? _runner;

    public MongoContext Context { get; private set; } = null!;

    public Task InitializeAsync()
    {
        // No replica set: nothing here uses transactions or change streams,
        // and single-node replica-set initiation adds seconds to every run.
        _runner = MongoRunner.Run(new MongoRunnerOptions
        {
            UseSingleNodeReplicaSet = false,
        });

        var client = new MongoClient(_runner.ConnectionString);
        Context = new MongoContext(client.GetDatabase("analytics_test"));

        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _runner?.Dispose();
        return Task.CompletedTask;
    }

    /// <summary>Empty every collection, so tests do not see each other's data.</summary>
    public async Task ResetAsync()
    {
        await Context.OrderFacts.DeleteManyAsync(FilterDefinition<OrderFact>.Empty);
        await Context.RevenueDaily.DeleteManyAsync(FilterDefinition<RevenueDaily>.Empty);
        await Context.EventDims.DeleteManyAsync(FilterDefinition<EventDim>.Empty);
        await Context.UserDims.DeleteManyAsync(FilterDefinition<UserDim>.Empty);
        await Context.ProcessedEvents.DeleteManyAsync(FilterDefinition<ProcessedEvent>.Empty);
    }
}

[CollectionDefinition(nameof(MongoCollection))]
public sealed class MongoCollection : ICollectionFixture<MongoFixture>;
