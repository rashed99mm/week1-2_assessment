using MongoDB.Bson;
using MongoDB.Bson.Serialization.Attributes;

namespace Analytics.Api.Models;

/// <summary>
/// One order, denormalised for reporting.
/// </summary>
/// <remarks>
/// Keyed on the Laravel order id so every projection is an upsert and
/// therefore safe to apply more than once — which matters because delivery is
/// at-least-once.
///
/// Denormalised deliberately: the dashboard groups by event and ticket type,
/// and a read model that had to join back to a dimension collection on every
/// query would be a slower version of the database it exists to avoid
/// querying.
/// </remarks>
public sealed class OrderFact
{
    /// <summary>The Laravel order id.</summary>
    [BsonId]
    public int Id { get; set; }

    public int EventId { get; set; }

    public string EventTitle { get; set; } = string.Empty;

    public int TicketTypeId { get; set; }

    public string TicketTypeName { get; set; } = string.Empty;

    public int? UserId { get; set; }

    public string CustomerEmail { get; set; } = string.Empty;

    public int Quantity { get; set; }

    /// <summary>
    /// Money as an exact decimal.
    /// </summary>
    /// <remarks>
    /// Decimal128, never double. Events carry money as a decimal string
    /// precisely so it never passes through a binary float; storing it as one
    /// here would give that away again, and the drift only becomes visible
    /// when someone reconciles a revenue figure against the orders behind it.
    /// </remarks>
    [BsonRepresentation(BsonType.Decimal128)]
    public decimal UnitPrice { get; set; }

    [BsonRepresentation(BsonType.Decimal128)]
    public decimal TotalAmount { get; set; }

    [BsonRepresentation(BsonType.Decimal128)]
    public decimal RefundedAmount { get; set; }

    public string Currency { get; set; } = "USD";

    /// <summary>pending | paid | failed | refunded | cancelled</summary>
    public string Status { get; set; } = "pending";

    public DateTime CreatedAt { get; set; }

    public DateTime? PaidAt { get; set; }

    public DateTime? RefundedAt { get; set; }

    public DateTime? CancelledAt { get; set; }

    /// <summary>
    /// The <c>occurredAt</c> of the most recent event applied to this row.
    /// </summary>
    /// <remarks>
    /// Ordering is not guaranteed: <c>order.paid</c> genuinely can arrive
    /// before <c>order.created</c> after a redelivery. A status transition is
    /// only applied when the incoming event is at least as recent as this, so
    /// a late-arriving earlier event cannot move a paid order back to pending.
    /// </remarks>
    public DateTime LastEventAt { get; set; }

    public DateTime UpdatedAt { get; set; }
}
