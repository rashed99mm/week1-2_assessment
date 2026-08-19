using MongoDB.Bson.Serialization.Attributes;

namespace Analytics.Api.Models;

/// <summary>
/// Records which domain events have already been projected.
/// </summary>
/// <remarks>
/// Delivery is at-least-once, and <c>revenue_daily</c> is maintained with
/// <c>$inc</c> — which is not idempotent. Applying the same event twice
/// silently overstates revenue, with nothing to reconcile it against.
///
/// The insert is the check, and it happens *before* the projector runs. The
/// other order turns any crash into an event reprocessed forever.
/// </remarks>
public sealed class ProcessedEvent
{
    /// <summary>The envelope id.</summary>
    [BsonId]
    public string Id { get; set; } = string.Empty;

    public string Type { get; set; } = string.Empty;

    public DateTime ProcessedAt { get; set; }
}
