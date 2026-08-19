using Analytics.Api.Infrastructure;
using Analytics.Api.Models;
using Analytics.Api.Models.Dtos;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Analytics.Api.Repositories;

public interface IAnalyticsRepository
{
    Task<KpiSummaryDto> GetKpisAsync(AnalyticsQuery query, CancellationToken cancellationToken);

    Task<IReadOnlyList<RevenuePointDto>> GetRevenueOverTimeAsync(
        AnalyticsQuery query, string granularity, CancellationToken cancellationToken);

    Task<IReadOnlyList<EventSalesDto>> GetSalesByEventAsync(
        AnalyticsQuery query, int limit, CancellationToken cancellationToken);

    Task<IReadOnlyList<TicketTypeSalesDto>> GetSalesByTicketTypeAsync(
        AnalyticsQuery query, int? eventId, CancellationToken cancellationToken);

    Task<FunnelDto> GetFunnelAsync(AnalyticsQuery query, CancellationToken cancellationToken);

    Task<IReadOnlyList<TopEventDto>> GetTopEventsAsync(
        AnalyticsQuery query, int limit, string metric, CancellationToken cancellationToken);

    Task<DateTime?> GetLastEventAtAsync(CancellationToken cancellationToken);
}

/// <summary>
/// Dashboard queries, as MongoDB aggregation pipelines.
/// </summary>
/// <remarks>
/// Every pipeline starts with a date <c>$match</c> so the indexes are usable —
/// a <c>$group</c> before the filter reads the whole collection.
///
/// Aggregation is done in the database, not by pulling documents into memory
/// and using LINQ. Grouping a year of orders in the application means shipping
/// a year of orders over the wire first, which is the cost this read model
/// exists to avoid.
/// </remarks>
public sealed class MongoAnalyticsRepository(MongoContext context) : IAnalyticsRepository
{
    public async Task<KpiSummaryDto> GetKpisAsync(
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        // Reads the pre-aggregated daily buckets, not order_facts. There are
        // far fewer day-event pairs than orders, and this is the most
        // frequently refreshed panel in the CMS.
        var result = await context.RevenueDaily
            .Aggregate()
            .Match(r => r.Date >= query.From.Date && r.Date <= query.To.Date)
            .Group(
                _ => 1,
                g => new
                {
                    GrossRevenue = g.Sum(r => r.GrossRevenue),
                    RefundedAmount = g.Sum(r => r.RefundedAmount),
                    TicketsSold = g.Sum(r => r.TicketsSold),
                    OrdersCreated = g.Sum(r => r.OrdersCreated),
                    OrdersPaid = g.Sum(r => r.OrdersPaid),
                })
            .FirstOrDefaultAsync(cancellationToken);

        if (result is null)
        {
            return new KpiSummaryDto
            {
                TotalRevenue = 0, NetRevenue = 0, RefundedAmount = 0,
                TicketsSold = 0, OrdersTotal = 0, OrdersPaid = 0,
                ConversionRate = 0, AvgOrderValue = 0, Currency = "USD",
            };
        }

        var net = result.GrossRevenue - result.RefundedAmount;

        return new KpiSummaryDto
        {
            TotalRevenue = result.GrossRevenue,
            NetRevenue = net,
            RefundedAmount = result.RefundedAmount,
            TicketsSold = result.TicketsSold,
            OrdersTotal = result.OrdersCreated,
            OrdersPaid = result.OrdersPaid,
            ConversionRate = result.OrdersCreated == 0
                ? 0
                : Math.Round((decimal)result.OrdersPaid / result.OrdersCreated, 4),
            AvgOrderValue = result.OrdersPaid == 0
                ? 0
                : Math.Round(result.GrossRevenue / result.OrdersPaid, 2),
            Currency = "USD",
        };
    }

    public async Task<IReadOnlyList<RevenuePointDto>> GetRevenueOverTimeAsync(
        AnalyticsQuery query,
        string granularity,
        CancellationToken cancellationToken)
    {
        var unit = granularity switch
        {
            "week" => "week",
            "month" => "month",
            _ => "day",
        };

        // $dateTrunc rather than formatting to a string and grouping on that:
        // it keeps the result a real date, so $sort orders chronologically
        // instead of lexically — which would put October before February.
        var pipeline = new BsonDocument[]
        {
            new("$match", new BsonDocument("Date", new BsonDocument
            {
                { "$gte", query.From.Date },
                { "$lte", query.To.Date },
            })),
            new("$group", new BsonDocument
            {
                { "_id", new BsonDocument("$dateTrunc", new BsonDocument
                    {
                        { "date", "$Date" },
                        { "unit", unit },
                    })
                },
                { "gross", new BsonDocument("$sum", "$GrossRevenue") },
                { "refunded", new BsonDocument("$sum", "$RefundedAmount") },
                { "tickets", new BsonDocument("$sum", "$TicketsSold") },
                { "ordersPaid", new BsonDocument("$sum", "$OrdersPaid") },
            }),
            new("$sort", new BsonDocument("_id", 1)),
        };

        var rows = await context.RevenueDaily
            .Aggregate<BsonDocument>(pipeline, cancellationToken: cancellationToken)
            .ToListAsync(cancellationToken);

        return rows.Select(row =>
        {
            var gross = ToDecimal(row["gross"]);
            var refunded = ToDecimal(row["refunded"]);

            return new RevenuePointDto
            {
                Period = row["_id"].ToUniversalTime().ToString("yyyy-MM-dd"),
                GrossRevenue = gross,
                NetRevenue = gross - refunded,
                RefundedAmount = refunded,
                TicketsSold = row["tickets"].ToInt32(),
                OrdersPaid = row["ordersPaid"].ToInt32(),
            };
        }).ToList();
    }

    public async Task<IReadOnlyList<EventSalesDto>> GetSalesByEventAsync(
        AnalyticsQuery query,
        int limit,
        CancellationToken cancellationToken)
    {
        // From order_facts rather than the daily rollup, because the rollup
        // does not carry the event title and this list is read far less often
        // than the KPI tiles.
        var pipeline = new BsonDocument[]
        {
            new("$match", new BsonDocument
            {
                { "Status", new BsonDocument("$in", new BsonArray { "paid", "refunded" }) },
                { "PaidAt", new BsonDocument { { "$gte", query.From }, { "$lte", query.To } } },
            }),
            new("$group", new BsonDocument
            {
                { "_id", "$EventId" },
                { "eventTitle", new BsonDocument("$first", "$EventTitle") },
                { "tickets", new BsonDocument("$sum", "$Quantity") },
                { "gross", new BsonDocument("$sum", "$TotalAmount") },
                { "refunded", new BsonDocument("$sum", "$RefundedAmount") },
                { "orders", new BsonDocument("$sum", 1) },
            }),
            new("$sort", new BsonDocument("gross", -1)),
            new("$limit", limit),
        };

        var rows = await context.OrderFacts
            .Aggregate<BsonDocument>(pipeline, cancellationToken: cancellationToken)
            .ToListAsync(cancellationToken);

        return rows.Select(row =>
        {
            var gross = ToDecimal(row["gross"]);
            var refunded = ToDecimal(row["refunded"]);

            return new EventSalesDto
            {
                EventId = row["_id"].ToInt32(),
                EventTitle = row["eventTitle"].AsString,
                TicketsSold = row["tickets"].ToInt32(),
                GrossRevenue = gross,
                NetRevenue = gross - refunded,
                Orders = row["orders"].ToInt32(),
            };
        }).ToList();
    }

    public async Task<IReadOnlyList<TicketTypeSalesDto>> GetSalesByTicketTypeAsync(
        AnalyticsQuery query,
        int? eventId,
        CancellationToken cancellationToken)
    {
        var match = new BsonDocument
        {
            { "Status", new BsonDocument("$in", new BsonArray { "paid", "refunded" }) },
            { "PaidAt", new BsonDocument { { "$gte", query.From }, { "$lte", query.To } } },
        };

        if (eventId is not null)
        {
            match.Add("EventId", eventId.Value);
        }

        var pipeline = new BsonDocument[]
        {
            new("$match", match),
            new("$group", new BsonDocument
            {
                { "_id", "$TicketTypeId" },
                { "name", new BsonDocument("$first", "$TicketTypeName") },
                { "eventId", new BsonDocument("$first", "$EventId") },
                { "tickets", new BsonDocument("$sum", "$Quantity") },
                { "revenue", new BsonDocument("$sum", "$TotalAmount") },
            }),
            new("$sort", new BsonDocument("revenue", -1)),
        };

        var rows = await context.OrderFacts
            .Aggregate<BsonDocument>(pipeline, cancellationToken: cancellationToken)
            .ToListAsync(cancellationToken);

        // Share is computed here rather than with $setWindowFields: the result
        // set is one row per ticket type, which is small, and the pipeline
        // stays readable.
        var total = rows.Sum(row => ToDecimal(row["revenue"]));

        return rows.Select(row =>
        {
            var revenue = ToDecimal(row["revenue"]);

            return new TicketTypeSalesDto
            {
                TicketTypeId = row["_id"].ToInt32(),
                Name = row["name"].AsString,
                EventId = row["eventId"].ToInt32(),
                TicketsSold = row["tickets"].ToInt32(),
                Revenue = revenue,
                Share = total == 0 ? 0 : Math.Round(revenue / total, 4),
            };
        }).ToList();
    }

    public async Task<FunnelDto> GetFunnelAsync(
        AnalyticsQuery query,
        CancellationToken cancellationToken)
    {
        var pipeline = new BsonDocument[]
        {
            new("$match", new BsonDocument("CreatedAt", new BsonDocument
            {
                { "$gte", query.From },
                { "$lte", query.To },
            })),
            new("$group", new BsonDocument
            {
                { "_id", "$Status" },
                { "count", new BsonDocument("$sum", 1) },
            }),
        };

        var rows = await context.OrderFacts
            .Aggregate<BsonDocument>(pipeline, cancellationToken: cancellationToken)
            .ToListAsync(cancellationToken);

        var counts = rows.ToDictionary(
            row => row["_id"].IsBsonNull ? "unknown" : row["_id"].AsString,
            row => row["count"].ToInt32());

        int Count(string status) => counts.GetValueOrDefault(status, 0);

        var created = counts.Values.Sum();
        var paid = Count("paid") + Count("refunded");
        var failed = Count("failed");

        return new FunnelDto
        {
            Created = created,
            Pending = Count("pending"),
            // A refunded order was paid: excluding it would make the paid rate
            // fall whenever a refund is issued, which reads as a drop in sales.
            Paid = paid,
            Failed = failed,
            Refunded = Count("refunded"),
            Cancelled = Count("cancelled"),
            PaidRate = created == 0 ? 0 : Math.Round((decimal)paid / created, 4),
            FailureRate = created == 0 ? 0 : Math.Round((decimal)failed / created, 4),
        };
    }

    public async Task<IReadOnlyList<TopEventDto>> GetTopEventsAsync(
        AnalyticsQuery query,
        int limit,
        string metric,
        CancellationToken cancellationToken)
    {
        var sortKey = metric == "tickets" ? "tickets" : "revenue";

        var pipeline = new BsonDocument[]
        {
            new("$match", new BsonDocument
            {
                { "Status", new BsonDocument("$in", new BsonArray { "paid", "refunded" }) },
                { "PaidAt", new BsonDocument { { "$gte", query.From }, { "$lte", query.To } } },
            }),
            new("$group", new BsonDocument
            {
                { "_id", "$EventId" },
                { "title", new BsonDocument("$first", "$EventTitle") },
                { "tickets", new BsonDocument("$sum", "$Quantity") },
                { "revenue", new BsonDocument("$sum", "$TotalAmount") },
            }),
            new("$sort", new BsonDocument(sortKey, -1)),
            new("$limit", limit),
            // Capacity lives on the dimension, so sell-through needs the join.
            new("$lookup", new BsonDocument
            {
                { "from", "event_dims" },
                { "localField", "_id" },
                { "foreignField", "_id" },
                { "as", "event" },
            }),
            // preserveNullAndEmptyArrays: an order can exist for an event this
            // read model never saw published — a backfilled historical order,
            // for instance. Dropping those rows would understate the totals.
            new("$unwind", new BsonDocument
            {
                { "path", "$event" },
                { "preserveNullAndEmptyArrays", true },
            }),
        };

        var rows = await context.OrderFacts
            .Aggregate<BsonDocument>(pipeline, cancellationToken: cancellationToken)
            .ToListAsync(cancellationToken);

        return rows.Select(row =>
        {
            var dimension = row.Contains("event") && !row["event"].IsBsonNull
                ? row["event"].AsBsonDocument
                : null;

            var capacity = dimension?.GetValue("TotalTickets", 0).ToInt32() ?? 0;
            var tickets = row["tickets"].ToInt32();

            return new TopEventDto
            {
                EventId = row["_id"].ToInt32(),
                // Falls back to the denormalised title, then to a placeholder,
                // rather than rendering an empty cell.
                Title = dimension?.GetValue("Title", BsonNull.Value) is { IsString: true } t
                    ? t.AsString
                    : row.GetValue("title", $"Event #{row["_id"]}").AsString,
                Venue = dimension?.GetValue("Venue", BsonNull.Value) is { IsString: true } v
                    ? v.AsString
                    : null,
                StartsAt = dimension?.GetValue("StartsAt", BsonNull.Value) is { IsValidDateTime: true } s
                    ? s.ToUniversalTime()
                    : null,
                TicketsSold = tickets,
                Revenue = ToDecimal(row["revenue"]),
                // Null, not zero, when capacity is unknown — zero would read
                // as "sold nothing".
                SellThrough = capacity > 0
                    ? Math.Round((decimal)tickets / capacity, 4)
                    : null,
            };
        }).ToList();
    }

    public async Task<DateTime?> GetLastEventAtAsync(CancellationToken cancellationToken)
    {
        var latest = await context.ProcessedEvents
            .Find(FilterDefinition<ProcessedEvent>.Empty)
            .SortByDescending(p => p.ProcessedAt)
            .Limit(1)
            .FirstOrDefaultAsync(cancellationToken);

        return latest?.ProcessedAt;
    }

    /// <summary>
    /// Read a money value out of an aggregation result.
    /// </summary>
    /// <remarks>
    /// $sum over Decimal128 returns Decimal128, but an empty group returns the
    /// integer 0, and a mixed collection can yield a double. Going via
    /// ToDecimal handles all three without ever passing through a float.
    /// </remarks>
    private static decimal ToDecimal(BsonValue value) => value.BsonType switch
    {
        BsonType.Decimal128 => (decimal)value.AsDecimal128,
        BsonType.Int32 => value.AsInt32,
        BsonType.Int64 => value.AsInt64,
        BsonType.Double => (decimal)value.AsDouble,
        _ => 0m,
    };
}
