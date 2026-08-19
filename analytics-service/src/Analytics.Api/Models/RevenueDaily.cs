using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Analytics.Api.Models;

/// <summary>
/// Pre-aggregated revenue for one event on one day.
/// </summary>
/// <remarks>
/// Exists so the KPI tiles and the revenue chart do not scan every order fact
/// on each dashboard load. A shop with a year of trading has far more orders
/// than day-event pairs, and the dashboard is the most-refreshed page in the
/// CMS.
///
/// Maintained with <c>$inc</c>, which is <b>not</b> idempotent — applying an
/// event twice permanently overstates the figures, and nothing downstream
/// would notice. That is the whole reason the consumer records an event as
/// processed before the projector runs rather than after, and why a nightly
/// recompute from <see cref="OrderFact"/> is worth having as a safety net.
/// </remarks>
public sealed class RevenueDaily
{
    /// <summary>Composite key: "2026-08-16|17" (UTC date, event id).</summary>
    [BsonId]
    public string Id { get; set; } = string.Empty;

    /// <summary>The UTC day. Bucketing is always UTC — see the contract.</summary>
    public DateTime Date { get; set; }

    public int EventId { get; set; }

    /// <summary>Total charged, before refunds.</summary>
    [BsonRepresentation(BsonType.Decimal128)]
    public decimal GrossRevenue { get; set; }

    [BsonRepresentation(BsonType.Decimal128)]
    public decimal RefundedAmount { get; set; }

    public int TicketsSold { get; set; }

    public int OrdersCreated { get; set; }

    public int OrdersPaid { get; set; }

    /// <summary>
    /// Gross less refunds.
    /// </summary>
    /// <remarks>
    /// Computed on read rather than stored: a stored value maintained by two
    /// separate <c>$inc</c> operations can disagree with its own components,
    /// and then there is no way to tell which is right.
    /// </remarks>
    [BsonIgnore]
    public decimal NetRevenue => GrossRevenue - RefundedAmount;

    /// <summary>Build the composite key for a given day and event.</summary>
    public static string KeyFor(DateTime utcDate, int eventId) =>
        $"{utcDate:yyyy-MM-dd}|{eventId}";
}
