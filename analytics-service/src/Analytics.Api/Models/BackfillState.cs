using MongoDB.Bson.Serialization.Attributes;

namespace Analytics.Api.Models;

/// <summary>
/// Where the one-off historical import got to.
/// </summary>
/// <remarks>
/// The read model only sees events published after this service first ran, so
/// without a backfill the dashboard would report nothing for a shop that has
/// been trading for months.
/// </remarks>
public sealed class BackfillState
{
    /// <summary>The resource being imported, e.g. "orders".</summary>
    [BsonId]
    public string Id { get; set; } = string.Empty;

    public int LastPage { get; set; }

    public DateTime? CompletedAt { get; set; }
}
