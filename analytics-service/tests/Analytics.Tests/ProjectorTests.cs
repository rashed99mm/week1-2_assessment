using Analytics.Api.Contracts;
using Analytics.Api.Messaging;
using Analytics.Api.Messaging.Projectors;
using Analytics.Api.Models;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using MongoDB.Driver;
using Xunit;

namespace Analytics.Tests;

/// <summary>
/// Projection behaviour.
/// </summary>
/// <remarks>
/// The two properties that matter here are both invisible until they go wrong.
///
/// Idempotency, because <c>revenue_daily</c> is maintained with <c>$inc</c>:
/// applying an event twice permanently overstates revenue, and there is
/// nothing to reconcile it against.
///
/// Order independence, because ordering is genuinely not guaranteed —
/// <c>order.paid</c> can arrive before <c>order.created</c> after a
/// redelivery, and a projector that assumed otherwise would drop the payment.
/// </remarks>
[Collection(nameof(MongoCollection))]
public sealed class ProjectorTests(MongoFixture mongo) : IAsyncLifetime
{
    private EventProcessor _processor = null!;

    public async Task InitializeAsync()
    {
        await mongo.ResetAsync();

        _processor = new EventProcessor(
            mongo.Context,
            new OrderProjector(mongo.Context),
            new DimensionProjector(mongo.Context),
            NullLogger<EventProcessor>.Instance);
    }

    public Task DisposeAsync() => Task.CompletedTask;

    private Task<ProcessResult> Process(DomainEventEnvelope envelope) =>
        _processor.ProcessAsync(envelope, CancellationToken.None);

    private async Task<OrderFact?> Fact(int orderId) =>
        await mongo.Context.OrderFacts.Find(f => f.Id == orderId).FirstOrDefaultAsync();

    private async Task<RevenueDaily?> Daily(DateTime day, int eventId) =>
        await mongo.Context.RevenueDaily
            .Find(r => r.Id == RevenueDaily.KeyFor(day, eventId))
            .FirstOrDefaultAsync();

    // -----------------------------------------------------------------------
    // Basics
    // -----------------------------------------------------------------------

    [Fact]
    public async Task Order_created_is_projected_with_exact_money()
    {
        await Process(EventBuilder.Envelope(EventTypes.OrderCreated, EventBuilder.OrderCreated()));

        var fact = await Fact(501);

        fact.Should().NotBeNull();
        // Exact decimals, never floats — the whole reason money crosses the
        // wire as a string.
        fact!.TotalAmount.Should().Be(150.00m);
        fact.UnitPrice.Should().Be(75.00m);
        fact.Status.Should().Be("pending");
        fact.EventTitle.Should().Be("Aurora Live");
    }

    [Fact]
    public async Task Order_paid_records_revenue_against_the_payment_date()
    {
        await Process(EventBuilder.Envelope(EventTypes.OrderCreated, EventBuilder.OrderCreated()));
        await Process(EventBuilder.Envelope(EventTypes.OrderPaid, EventBuilder.OrderPaid()));

        var fact = await Fact(501);
        fact!.Status.Should().Be("paid");

        var daily = await Daily(new DateTime(2026, 8, 16, 0, 0, 0, DateTimeKind.Utc), 17);
        daily.Should().NotBeNull();
        daily!.GrossRevenue.Should().Be(150.00m);
        daily.TicketsSold.Should().Be(2);
        daily.OrdersPaid.Should().Be(1);
        daily.OrdersCreated.Should().Be(1);
    }

    [Fact]
    public async Task Refund_is_booked_on_the_refund_date_not_the_sale_date()
    {
        await Process(EventBuilder.Envelope(EventTypes.OrderCreated, EventBuilder.OrderCreated()));
        await Process(EventBuilder.Envelope(EventTypes.OrderPaid, EventBuilder.OrderPaid()));
        await Process(EventBuilder.Envelope(EventTypes.OrderRefunded, EventBuilder.OrderRefunded()));

        var saleDay = await Daily(new DateTime(2026, 8, 16, 0, 0, 0, DateTimeKind.Utc), 17);
        var refundDay = await Daily(new DateTime(2026, 8, 17, 0, 0, 0, DateTimeKind.Utc), 17);

        // A refund in September is not a reduction in August's takings.
        // Rewriting a closed period would make the chart change under a
        // viewer's feet.
        saleDay!.GrossRevenue.Should().Be(150.00m);
        saleDay.RefundedAmount.Should().Be(0m);

        refundDay!.RefundedAmount.Should().Be(150.00m);
        refundDay.NetRevenue.Should().Be(-150.00m);

        (await Fact(501))!.Status.Should().Be("refunded");
    }

    // -----------------------------------------------------------------------
    // Idempotency
    // -----------------------------------------------------------------------

    [Fact]
    public async Task The_same_event_delivered_twice_counts_once()
    {
        var paid = EventBuilder.Envelope(EventTypes.OrderPaid, EventBuilder.OrderPaid());

        var first = await Process(paid);
        var second = await Process(paid);

        first.Should().Be(ProcessResult.Handled);
        second.Should().Be(ProcessResult.Handled);

        // $inc is not idempotent. Without the dedupe check this would read
        // 300.00, and nothing downstream would ever notice.
        var daily = await Daily(new DateTime(2026, 8, 16, 0, 0, 0, DateTimeKind.Utc), 17);
        daily!.GrossRevenue.Should().Be(150.00m);
        daily.TicketsSold.Should().Be(2);
    }

    [Fact]
    public async Task Distinct_events_are_counted_separately()
    {
        await Process(EventBuilder.Envelope(EventTypes.OrderPaid, EventBuilder.OrderPaid(orderId: 501)));
        await Process(EventBuilder.Envelope(EventTypes.OrderPaid, EventBuilder.OrderPaid(orderId: 502)));

        var daily = await Daily(new DateTime(2026, 8, 16, 0, 0, 0, DateTimeKind.Utc), 17);
        daily!.GrossRevenue.Should().Be(300.00m);
        daily.OrdersPaid.Should().Be(2);
    }

    // -----------------------------------------------------------------------
    // Ordering
    // -----------------------------------------------------------------------

    [Fact]
    public async Task Paid_arriving_before_created_still_records_the_payment()
    {
        // The redelivery case. A projector that updated an existing row rather
        // than upserting would silently drop this payment.
        await Process(EventBuilder.Envelope(
            EventTypes.OrderPaid,
            EventBuilder.OrderPaid(),
            occurredAt: new DateTime(2026, 8, 16, 12, 32, 10, DateTimeKind.Utc)));

        await Process(EventBuilder.Envelope(
            EventTypes.OrderCreated,
            EventBuilder.OrderCreated(),
            occurredAt: new DateTime(2026, 8, 16, 12, 30, 0, DateTimeKind.Utc)));

        var fact = await Fact(501);

        fact.Should().NotBeNull();
        // Still paid: the late-arriving create must not reset the status.
        fact!.Status.Should().Be("paid");
        fact.PaidAt.Should().NotBeNull();
        // The create still filled in the descriptive fields it owns.
        fact.TicketTypeName.Should().Be("Floor A");
    }

    [Fact]
    public async Task A_stale_event_cannot_move_a_paid_order_backwards()
    {
        await Process(EventBuilder.Envelope(
            EventTypes.OrderPaid,
            EventBuilder.OrderPaid(),
            occurredAt: new DateTime(2026, 8, 16, 12, 32, 10, DateTimeKind.Utc)));

        var before = await Fact(501);
        before!.LastEventAt.Should().Be(new DateTime(2026, 8, 16, 12, 32, 10, DateTimeKind.Utc));

        await Process(EventBuilder.Envelope(
            EventTypes.OrderCreated,
            EventBuilder.OrderCreated(),
            occurredAt: new DateTime(2026, 8, 16, 12, 30, 0, DateTimeKind.Utc)));

        (await Fact(501))!.Status.Should().Be("paid");
    }

    // -----------------------------------------------------------------------
    // Routing
    // -----------------------------------------------------------------------

    [Fact]
    public async Task An_unknown_event_type_is_ignored_not_rejected()
    {
        // Adding an event type upstream must not break this service.
        var result = await Process(EventBuilder.Envelope("billing.invoiced", new { anything = 1 }));

        result.Should().Be(ProcessResult.Ignored);
        (await mongo.Context.ProcessedEvents.CountDocumentsAsync(FilterDefinition<ProcessedEvent>.Empty))
            .Should().Be(0);
    }

    [Fact]
    public async Task An_unsupported_version_is_dead_lettered()
    {
        // Guessing at a changed payload produces silently wrong revenue, which
        // is worse than a message someone has to look at.
        var result = await Process(EventBuilder.Envelope(
            EventTypes.OrderPaid,
            EventBuilder.OrderPaid(),
            version: 2));

        result.Should().Be(ProcessResult.Poison);
        (await Fact(501)).Should().BeNull();
    }

    [Fact]
    public async Task Event_published_records_the_capacity_used_for_sell_through()
    {
        await Process(EventBuilder.Envelope(
            EventTypes.EventPublished,
            EventBuilder.EventPublished(totalTickets: 500)));

        var dimension = await mongo.Context.EventDims.Find(e => e.Id == 17).FirstOrDefaultAsync();

        dimension.Should().NotBeNull();
        dimension!.TotalTickets.Should().Be(500);
        dimension.EventTypeName.Should().Be("Concert");
    }

    [Fact]
    public async Task User_registered_is_recorded()
    {
        await Process(EventBuilder.Envelope(EventTypes.UserRegistered, EventBuilder.UserRegistered()));

        var user = await mongo.Context.UserDims.Find(u => u.Id == 12).FirstOrDefaultAsync();

        user.Should().NotBeNull();
        user!.Email.Should().Be("ada@example.com");
    }

    [Fact]
    public async Task A_cancelled_order_records_no_revenue()
    {
        await Process(EventBuilder.Envelope(EventTypes.OrderCancelled, EventBuilder.OrderCancelled()));

        (await Fact(502))!.Status.Should().Be("cancelled");

        // Nothing was ever paid, so nothing moves. It still matters to the
        // funnel, which reads order_facts directly.
        var daily = await Daily(new DateTime(2026, 8, 16, 0, 0, 0, DateTimeKind.Utc), 17);
        (daily?.GrossRevenue ?? 0m).Should().Be(0m);
    }
}
