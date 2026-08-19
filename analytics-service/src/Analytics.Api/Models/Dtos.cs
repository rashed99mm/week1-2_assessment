namespace Analytics.Api.Models.Dtos;

/// <summary>
/// The date window every dashboard query is bounded by.
/// </summary>
/// <remarks>
/// Bounded by default, and never unbounded: an open-ended range scans the
/// whole read model, which is fine on a seeded demo and ruinous after a year
/// of trading.
/// </remarks>
public sealed record AnalyticsQuery
{
    public DateTime From { get; init; }
    public DateTime To { get; init; }

    /// <summary>Default window: the last 30 days, in UTC.</summary>
    public static AnalyticsQuery Resolve(DateTime? from, DateTime? to)
    {
        var end = (to ?? DateTime.UtcNow).ToUniversalTime();
        var start = (from ?? end.AddDays(-30)).ToUniversalTime();

        // Tolerate a reversed range rather than returning an empty result the
        // caller has to work out the cause of.
        return start <= end
            ? new AnalyticsQuery { From = start, To = end }
            : new AnalyticsQuery { From = end, To = start };
    }
}

public sealed record KpiSummaryDto
{
    public required decimal TotalRevenue { get; init; }
    public required decimal NetRevenue { get; init; }
    public required decimal RefundedAmount { get; init; }
    public required int TicketsSold { get; init; }
    public required int OrdersTotal { get; init; }
    public required int OrdersPaid { get; init; }

    /// <summary>Paid orders as a fraction of orders placed, 0–1.</summary>
    public required decimal ConversionRate { get; init; }

    public required decimal AvgOrderValue { get; init; }
    public required string Currency { get; init; }
}

public sealed record RevenuePointDto
{
    /// <summary>Bucket start, ISO date. Always UTC.</summary>
    public required string Period { get; init; }

    public required decimal GrossRevenue { get; init; }
    public required decimal NetRevenue { get; init; }
    public required decimal RefundedAmount { get; init; }
    public required int TicketsSold { get; init; }
    public required int OrdersPaid { get; init; }
}

public sealed record EventSalesDto
{
    public required int EventId { get; init; }
    public required string EventTitle { get; init; }
    public required int TicketsSold { get; init; }
    public required decimal GrossRevenue { get; init; }
    public required decimal NetRevenue { get; init; }
    public required int Orders { get; init; }
}

public sealed record TicketTypeSalesDto
{
    public required int TicketTypeId { get; init; }
    public required string Name { get; init; }
    public required int EventId { get; init; }
    public required int TicketsSold { get; init; }
    public required decimal Revenue { get; init; }

    /// <summary>This type's share of the queried revenue, 0–1.</summary>
    public required decimal Share { get; init; }
}

public sealed record FunnelDto
{
    public required int Created { get; init; }
    public required int Pending { get; init; }
    public required int Paid { get; init; }
    public required int Failed { get; init; }
    public required int Refunded { get; init; }
    public required int Cancelled { get; init; }
    public required decimal PaidRate { get; init; }
    public required decimal FailureRate { get; init; }
}

public sealed record TopEventDto
{
    public required int EventId { get; init; }
    public required string Title { get; init; }
    public string? Venue { get; init; }
    public DateTime? StartsAt { get; init; }
    public required int TicketsSold { get; init; }
    public required decimal Revenue { get; init; }

    /// <summary>
    /// Tickets sold as a fraction of the event's capacity, 0–1.
    /// </summary>
    /// <remarks>
    /// Null when the event's capacity is unknown — the read model only learns
    /// it from an <c>event.published</c> event, which a backfilled order may
    /// predate. Null is honest; zero would read as "sold nothing".
    /// </remarks>
    public decimal? SellThrough { get; init; }
}
