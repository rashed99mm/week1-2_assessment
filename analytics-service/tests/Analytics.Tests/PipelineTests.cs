using Analytics.Api.Models;
using Analytics.Api.Models.Dtos;
using Analytics.Api.Repositories;
using FluentAssertions;
using Xunit;

namespace Analytics.Tests;

/// <summary>
/// The dashboard aggregation pipelines.
/// </summary>
/// <remarks>
/// These are the product. A pipeline that returns plausible-but-wrong numbers
/// fails silently — the dashboard renders, the chart has a shape, and nobody
/// notices until someone reconciles it against the orders behind it. So the
/// assertions are exact figures, not "greater than zero".
///
/// Run against a real mongod, because <c>$dateTrunc</c> and <c>$lookup</c>
/// only behave like themselves in the real engine.
/// </remarks>
[Collection(nameof(MongoCollection))]
public sealed class PipelineTests(MongoFixture mongo) : IAsyncLifetime
{
    private IAnalyticsRepository _repository = null!;

    private static readonly DateTime Day1 = new(2026, 8, 10, 0, 0, 0, DateTimeKind.Utc);
    private static readonly DateTime Day2 = new(2026, 8, 11, 0, 0, 0, DateTimeKind.Utc);

    public async Task InitializeAsync()
    {
        await mongo.ResetAsync();
        _repository = new MongoAnalyticsRepository(mongo.Context);
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private static AnalyticsQuery Window => AnalyticsQuery.Resolve(
        new DateTime(2026, 8, 1, 0, 0, 0, DateTimeKind.Utc),
        new DateTime(2026, 8, 31, 23, 59, 59, DateTimeKind.Utc));

    private async Task SeedDailyAsync(
        DateTime date,
        int eventId,
        decimal gross,
        decimal refunded = 0,
        int tickets = 0,
        int created = 0,
        int paid = 0)
    {
        await mongo.Context.RevenueDaily.InsertOneAsync(new RevenueDaily
        {
            Id = RevenueDaily.KeyFor(date, eventId),
            Date = date,
            EventId = eventId,
            GrossRevenue = gross,
            RefundedAmount = refunded,
            TicketsSold = tickets,
            OrdersCreated = created,
            OrdersPaid = paid,
        });
    }

    private async Task SeedOrderAsync(
        int id,
        int eventId,
        string status,
        decimal total,
        int quantity = 1,
        DateTime? paidAt = null,
        DateTime? createdAt = null,
        int ticketTypeId = 44,
        string ticketTypeName = "Floor A",
        decimal refunded = 0)
    {
        await mongo.Context.OrderFacts.InsertOneAsync(new OrderFact
        {
            Id = id,
            EventId = eventId,
            EventTitle = $"Event {eventId}",
            TicketTypeId = ticketTypeId,
            TicketTypeName = ticketTypeName,
            Quantity = quantity,
            TotalAmount = total,
            RefundedAmount = refunded,
            UnitPrice = total / quantity,
            Status = status,
            CreatedAt = createdAt ?? Day1,
            PaidAt = paidAt ?? (status is "paid" or "refunded" ? Day1 : null),
            Currency = "USD",
        });
    }

    // -----------------------------------------------------------------------
    // KPIs
    // -----------------------------------------------------------------------

    [Fact]
    public async Task Kpis_are_zero_when_there_is_no_data()
    {
        var kpis = await _repository.GetKpisAsync(Window, CancellationToken.None);

        // An empty shop must render zeros, not throw and not blank the panel.
        kpis.TotalRevenue.Should().Be(0);
        kpis.ConversionRate.Should().Be(0);
        kpis.AvgOrderValue.Should().Be(0);
    }

    [Fact]
    public async Task Kpis_sum_the_daily_buckets_exactly()
    {
        await SeedDailyAsync(Day1, 17, gross: 300.00m, refunded: 50.00m, tickets: 4, created: 5, paid: 3);
        await SeedDailyAsync(Day2, 17, gross: 150.00m, tickets: 2, created: 2, paid: 1);

        var kpis = await _repository.GetKpisAsync(Window, CancellationToken.None);

        kpis.TotalRevenue.Should().Be(450.00m);
        kpis.RefundedAmount.Should().Be(50.00m);
        kpis.NetRevenue.Should().Be(400.00m);
        kpis.TicketsSold.Should().Be(6);
        kpis.OrdersTotal.Should().Be(7);
        kpis.OrdersPaid.Should().Be(4);
        // 4 paid of 7 placed.
        kpis.ConversionRate.Should().Be(0.5714m);
        // 450 over 4 paid orders.
        kpis.AvgOrderValue.Should().Be(112.50m);
    }

    [Fact]
    public async Task Kpis_exclude_days_outside_the_window()
    {
        await SeedDailyAsync(Day1, 17, gross: 100.00m, paid: 1, created: 1);
        await SeedDailyAsync(new DateTime(2026, 7, 1, 0, 0, 0, DateTimeKind.Utc), 17, gross: 999.00m);

        var kpis = await _repository.GetKpisAsync(Window, CancellationToken.None);

        kpis.TotalRevenue.Should().Be(100.00m);
    }

    // -----------------------------------------------------------------------
    // Revenue over time
    // -----------------------------------------------------------------------

    [Fact]
    public async Task Revenue_over_time_returns_one_point_per_day_in_order()
    {
        await SeedDailyAsync(Day2, 17, gross: 150.00m, tickets: 2, paid: 1);
        await SeedDailyAsync(Day1, 17, gross: 300.00m, refunded: 50.00m, tickets: 4, paid: 3);

        var points = await _repository.GetRevenueOverTimeAsync(Window, "day", CancellationToken.None);

        points.Should().HaveCount(2);
        // Chronological, not insertion order. $dateTrunc keeps the group key a
        // real date so $sort orders by time rather than lexically.
        points[0].Period.Should().Be("2026-08-10");
        points[0].GrossRevenue.Should().Be(300.00m);
        points[0].NetRevenue.Should().Be(250.00m);
        points[1].Period.Should().Be("2026-08-11");
        points[1].GrossRevenue.Should().Be(150.00m);
    }

    [Fact]
    public async Task Revenue_over_time_collapses_days_into_months()
    {
        await SeedDailyAsync(Day1, 17, gross: 300.00m, paid: 2);
        await SeedDailyAsync(Day2, 17, gross: 150.00m, paid: 1);

        var points = await _repository.GetRevenueOverTimeAsync(Window, "month", CancellationToken.None);

        points.Should().HaveCount(1);
        points[0].Period.Should().Be("2026-08-01");
        points[0].GrossRevenue.Should().Be(450.00m);
    }

    [Fact]
    public async Task Revenue_over_time_sums_across_events_within_a_day()
    {
        await SeedDailyAsync(Day1, 17, gross: 300.00m, paid: 2);
        await SeedDailyAsync(Day1, 18, gross: 200.00m, paid: 1);

        var points = await _repository.GetRevenueOverTimeAsync(Window, "day", CancellationToken.None);

        points.Should().HaveCount(1);
        points[0].GrossRevenue.Should().Be(500.00m);
    }

    // -----------------------------------------------------------------------
    // Sales by event and ticket type
    // -----------------------------------------------------------------------

    [Fact]
    public async Task Sales_by_event_groups_and_orders_by_revenue()
    {
        await SeedOrderAsync(1, eventId: 17, status: "paid", total: 150.00m, quantity: 2);
        await SeedOrderAsync(2, eventId: 17, status: "paid", total: 75.00m);
        await SeedOrderAsync(3, eventId: 18, status: "paid", total: 500.00m, quantity: 5);
        // Never paid, so it contributes nothing.
        await SeedOrderAsync(4, eventId: 17, status: "pending", total: 999.00m);

        var sales = await _repository.GetSalesByEventAsync(Window, 10, CancellationToken.None);

        sales.Should().HaveCount(2);
        sales[0].EventId.Should().Be(18);
        sales[0].GrossRevenue.Should().Be(500.00m);
        sales[1].EventId.Should().Be(17);
        sales[1].GrossRevenue.Should().Be(225.00m);
        sales[1].TicketsSold.Should().Be(3);
        sales[1].Orders.Should().Be(2);
    }

    [Fact]
    public async Task Sales_by_event_counts_a_refunded_order_as_a_sale_with_a_refund()
    {
        await SeedOrderAsync(1, eventId: 17, status: "refunded", total: 150.00m, refunded: 150.00m);

        var sales = await _repository.GetSalesByEventAsync(Window, 10, CancellationToken.None);

        // It was paid, then given back. Excluding it from gross would make the
        // figure disagree with the payment provider's.
        sales[0].GrossRevenue.Should().Be(150.00m);
        sales[0].NetRevenue.Should().Be(0m);
    }

    [Fact]
    public async Task Sales_by_ticket_type_reports_each_type_share_of_revenue()
    {
        await SeedOrderAsync(1, 17, "paid", 300.00m, ticketTypeId: 44, ticketTypeName: "Floor A");
        await SeedOrderAsync(2, 17, "paid", 100.00m, ticketTypeId: 45, ticketTypeName: "Balcony");

        var sales = await _repository.GetSalesByTicketTypeAsync(Window, null, CancellationToken.None);

        sales.Should().HaveCount(2);
        sales[0].Name.Should().Be("Floor A");
        sales[0].Revenue.Should().Be(300.00m);
        sales[0].Share.Should().Be(0.75m);
        sales[1].Share.Should().Be(0.25m);
    }

    [Fact]
    public async Task Sales_by_ticket_type_can_be_scoped_to_one_event()
    {
        await SeedOrderAsync(1, 17, "paid", 300.00m, ticketTypeId: 44);
        await SeedOrderAsync(2, 18, "paid", 100.00m, ticketTypeId: 46, ticketTypeName: "Other");

        var sales = await _repository.GetSalesByTicketTypeAsync(Window, 17, CancellationToken.None);

        sales.Should().HaveCount(1);
        sales[0].EventId.Should().Be(17);
        // Share is of the filtered set, so a single type is all of it.
        sales[0].Share.Should().Be(1m);
    }

    // -----------------------------------------------------------------------
    // Funnel
    // -----------------------------------------------------------------------

    [Fact]
    public async Task Funnel_counts_each_status_and_derives_the_rates()
    {
        await SeedOrderAsync(1, 17, "paid", 100m);
        await SeedOrderAsync(2, 17, "paid", 100m);
        await SeedOrderAsync(3, 17, "pending", 100m);
        await SeedOrderAsync(4, 17, "failed", 100m);
        await SeedOrderAsync(5, 17, "cancelled", 100m);
        await SeedOrderAsync(6, 17, "refunded", 100m, refunded: 100m);

        var funnel = await _repository.GetFunnelAsync(Window, CancellationToken.None);

        funnel.Created.Should().Be(6);
        funnel.Pending.Should().Be(1);
        // A refunded order was paid. Excluding it would make the paid rate
        // drop whenever a refund is issued, reading as a fall in sales.
        funnel.Paid.Should().Be(3);
        funnel.Failed.Should().Be(1);
        funnel.Refunded.Should().Be(1);
        funnel.Cancelled.Should().Be(1);
        funnel.PaidRate.Should().Be(0.5m);
        funnel.FailureRate.Should().BeApproximately(0.1667m, 0.0001m);
    }

    [Fact]
    public async Task Funnel_is_empty_rather_than_dividing_by_zero()
    {
        var funnel = await _repository.GetFunnelAsync(Window, CancellationToken.None);

        funnel.Created.Should().Be(0);
        funnel.PaidRate.Should().Be(0);
        funnel.FailureRate.Should().Be(0);
    }

    // -----------------------------------------------------------------------
    // Top events
    // -----------------------------------------------------------------------

    [Fact]
    public async Task Top_events_joins_capacity_to_compute_sell_through()
    {
        await mongo.Context.EventDims.InsertOneAsync(new EventDim
        {
            Id = 17,
            Title = "Aurora Live",
            Venue = "Rooftop Arena",
            StartsAt = new DateTime(2026, 9, 1, 19, 0, 0, DateTimeKind.Utc),
            TotalTickets = 100,
            PublishedAt = Day1,
        });

        await SeedOrderAsync(1, 17, "paid", 750.00m, quantity: 10);
        await SeedOrderAsync(2, 17, "paid", 750.00m, quantity: 15);

        var top = await _repository.GetTopEventsAsync(Window, 5, "revenue", CancellationToken.None);

        top.Should().HaveCount(1);
        top[0].Title.Should().Be("Aurora Live");
        top[0].Venue.Should().Be("Rooftop Arena");
        top[0].TicketsSold.Should().Be(25);
        top[0].SellThrough.Should().Be(0.25m);
    }

    [Fact]
    public async Task Top_events_reports_unknown_capacity_as_null_not_zero()
    {
        // An order for an event this read model never saw published — a
        // backfilled historical order, for instance.
        await SeedOrderAsync(1, 99, "paid", 100.00m, quantity: 2);

        var top = await _repository.GetTopEventsAsync(Window, 5, "revenue", CancellationToken.None);

        top.Should().HaveCount(1);
        // Null is honest; zero would read as "sold nothing".
        top[0].SellThrough.Should().BeNull();
        // Falls back to the title denormalised on the order fact.
        top[0].Title.Should().Be("Event 99");
    }

    [Fact]
    public async Task Top_events_can_rank_by_tickets_instead_of_revenue()
    {
        await SeedOrderAsync(1, 17, "paid", 1000.00m, quantity: 2);
        await SeedOrderAsync(2, 18, "paid", 100.00m, quantity: 50);

        var byRevenue = await _repository.GetTopEventsAsync(Window, 5, "revenue", CancellationToken.None);
        var byTickets = await _repository.GetTopEventsAsync(Window, 5, "tickets", CancellationToken.None);

        byRevenue[0].EventId.Should().Be(17);
        byTickets[0].EventId.Should().Be(18);
    }

    [Fact]
    public async Task Top_events_respects_the_limit()
    {
        for (var i = 1; i <= 5; i++)
        {
            await SeedOrderAsync(i, eventId: i, status: "paid", total: i * 100m);
        }

        var top = await _repository.GetTopEventsAsync(Window, 2, "revenue", CancellationToken.None);

        top.Should().HaveCount(2);
        top[0].EventId.Should().Be(5);
    }
}
