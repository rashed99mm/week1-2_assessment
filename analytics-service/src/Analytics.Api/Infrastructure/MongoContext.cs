using Analytics.Api.Models;
using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Analytics.Api.Infrastructure;

public sealed class MongoOptions
{
    public const string SectionName = "Mongo";

    public string ConnectionString { get; set; } = "mongodb://localhost:27017";

    public string Database { get; set; } = "analytics";
}

/// <summary>
/// Typed access to the read-model collections.
/// </summary>
/// <remarks>
/// Registered as a singleton: <c>IMongoClient</c> owns a connection pool, and
/// constructing one per request would open a new pool per request.
/// </remarks>
public sealed class MongoContext
{
    private readonly IMongoDatabase _database;

    public MongoContext(IOptions<MongoOptions> options)
    {
        var settings = MongoClientSettings.FromConnectionString(options.Value.ConnectionString);

        // The driver's default is 30 seconds, which is far too long for a
        // health probe — the orchestrator's own timeout fires first and the
        // container is reported as failed rather than degraded. Five seconds
        // is long enough to ride out a brief blip and short enough to answer.
        settings.ServerSelectionTimeout = TimeSpan.FromSeconds(5);
        settings.ConnectTimeout = TimeSpan.FromSeconds(5);

        _database = new MongoClient(settings).GetDatabase(options.Value.Database);
    }

    /// <summary>Test seam: bind to an already-configured database.</summary>
    public MongoContext(IMongoDatabase database) => _database = database;

    public IMongoDatabase Database => _database;

    public IMongoCollection<OrderFact> OrderFacts =>
        _database.GetCollection<OrderFact>("order_facts");

    public IMongoCollection<EventDim> EventDims =>
        _database.GetCollection<EventDim>("event_dims");

    public IMongoCollection<UserDim> UserDims =>
        _database.GetCollection<UserDim>("user_dims");

    public IMongoCollection<RevenueDaily> RevenueDaily =>
        _database.GetCollection<RevenueDaily>("revenue_daily");

    public IMongoCollection<ProcessedEvent> ProcessedEvents =>
        _database.GetCollection<ProcessedEvent>("processed_events");

    public IMongoCollection<BackfillState> BackfillState =>
        _database.GetCollection<BackfillState>("backfill_state");
}
