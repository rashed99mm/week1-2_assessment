using Analytics.Api.Contracts;
using Analytics.Api.Infrastructure;
using Analytics.Api.Models;
using MongoDB.Driver;

namespace Analytics.Api.Messaging.Projectors;

/// <summary>
/// Projects order events into <see cref="OrderFact"/> and
/// <see cref="RevenueDaily"/>.
/// </summary>
/// <remarks>
/// Every write is an upsert, and no method assumes an earlier event has been
/// seen. Ordering is genuinely not guaranteed: after a redelivery,
/// <c>order.paid</c> can arrive before <c>order.created</c>. A projector that
/// updated an existing row would silently drop the payment.
/// </remarks>
public sealed class OrderProjector(MongoContext context)
{
    public async Task ProjectCreatedAsync(
        DomainEventEnvelope envelope,
        CancellationToken cancellationToken)
    {
        var payload = envelope.PayloadAs<OrderCreatedPayload>();

        var update = Builders<OrderFact>.Update
            // Immutable facts, applied only if this is the row's first write.
            // If order.paid arrived first it already created the row, and its
            // status must not be reset to pending by a late-arriving create.
            .SetOnInsert(f => f.Id, payload.OrderId)
            .SetOnInsert(f => f.CreatedAt, payload.CreatedAt)
            .SetOnInsert(f => f.Status, payload.Status)
            .SetOnInsert(f => f.RefundedAmount, 0m)
            // Descriptive fields, safe to refresh whenever they arrive.
            .Set(f => f.EventId, payload.EventId)
            .Set(f => f.EventTitle, payload.EventTitle)
            .Set(f => f.TicketTypeId, payload.TicketTypeId)
            .Set(f => f.TicketTypeName, payload.TicketTypeName)
            .Set(f => f.UserId, payload.UserId)
            .Set(f => f.CustomerEmail, payload.CustomerEmail)
            .Set(f => f.Quantity, payload.Quantity)
            .Set(f => f.UnitPrice, EventJson.Money(payload.UnitPrice))
            .Set(f => f.TotalAmount, EventJson.Money(payload.TotalAmount))
            .Set(f => f.Currency, payload.Currency)
            .Set(f => f.UpdatedAt, DateTime.UtcNow)
            .Max(f => f.LastEventAt, envelope.OccurredAt);

        await context.OrderFacts.UpdateOneAsync(
            f => f.Id == payload.OrderId,
            update,
            new UpdateOptions { IsUpsert = true },
            cancellationToken);

        await IncrementDailyAsync(
            payload.CreatedAt,
            payload.EventId,
            Builders<RevenueDaily>.Update.Inc(r => r.OrdersCreated, 1),
            cancellationToken);
    }

    public async Task ProjectPaidAsync(
        DomainEventEnvelope envelope,
        CancellationToken cancellationToken)
    {
        var payload = envelope.PayloadAs<OrderPaidPayload>();
        var amount = EventJson.Money(payload.TotalAmount);

        // Applied only when this event is at least as recent as the last one
        // seen for the row. Without the guard, a redelivered order.created
        // arriving after the payment would move a paid order back to pending.
        var filter = Builders<OrderFact>.Filter.And(
            Builders<OrderFact>.Filter.Eq(f => f.Id, payload.OrderId),
            Builders<OrderFact>.Filter.Lte(f => f.LastEventAt, envelope.OccurredAt));

        var update = Builders<OrderFact>.Update
            .SetOnInsert(f => f.Id, payload.OrderId)
            .SetOnInsert(f => f.CreatedAt, payload.PaidAt)
            .SetOnInsert(f => f.RefundedAmount, 0m)
            .Set(f => f.Status, "paid")
            .Set(f => f.PaidAt, payload.PaidAt)
            .Set(f => f.EventId, payload.EventId)
            .Set(f => f.EventTitle, payload.EventTitle)
            .Set(f => f.TicketTypeId, payload.TicketTypeId)
            .Set(f => f.UserId, payload.UserId)
            .Set(f => f.CustomerEmail, payload.CustomerEmail)
            .Set(f => f.Quantity, payload.Quantity)
            .Set(f => f.TotalAmount, amount)
            .Set(f => f.Currency, payload.Currency)
            .Set(f => f.UpdatedAt, DateTime.UtcNow)
            .Max(f => f.LastEventAt, envelope.OccurredAt);

        await context.OrderFacts.UpdateOneAsync(
            filter,
            update,
            new UpdateOptions { IsUpsert = true },
            cancellationToken);

        await IncrementDailyAsync(
            payload.PaidAt,
            payload.EventId,
            Builders<RevenueDaily>.Update
                .Inc(r => r.GrossRevenue, amount)
                .Inc(r => r.TicketsSold, payload.Quantity)
                .Inc(r => r.OrdersPaid, 1),
            cancellationToken);
    }

    public async Task ProjectRefundedAsync(
        DomainEventEnvelope envelope,
        CancellationToken cancellationToken)
    {
        var payload = envelope.PayloadAs<OrderRefundedPayload>();
        var amount = EventJson.Money(payload.RefundedAmount);

        var update = Builders<OrderFact>.Update
            .SetOnInsert(f => f.Id, payload.OrderId)
            .SetOnInsert(f => f.CreatedAt, payload.RefundedAt)
            .Set(f => f.Status, "refunded")
            .Set(f => f.RefundedAt, payload.RefundedAt)
            .Set(f => f.RefundedAmount, amount)
            .Set(f => f.EventId, payload.EventId)
            .Set(f => f.EventTitle, payload.EventTitle)
            .Set(f => f.TicketTypeId, payload.TicketTypeId)
            .Set(f => f.UserId, payload.UserId)
            .Set(f => f.CustomerEmail, payload.CustomerEmail)
            .Set(f => f.Quantity, payload.Quantity)
            .Set(f => f.Currency, payload.Currency)
            .Set(f => f.UpdatedAt, DateTime.UtcNow)
            .Max(f => f.LastEventAt, envelope.OccurredAt);

        await context.OrderFacts.UpdateOneAsync(
            f => f.Id == payload.OrderId,
            update,
            new UpdateOptions { IsUpsert = true },
            cancellationToken);

        // Booked against the refund date, not the original sale: a refund in
        // September is not a reduction in August's takings, and rewriting a
        // closed period would make the chart change under a viewer's feet.
        await IncrementDailyAsync(
            payload.RefundedAt,
            payload.EventId,
            Builders<RevenueDaily>.Update.Inc(r => r.RefundedAmount, amount),
            cancellationToken);
    }

    public async Task ProjectCancelledAsync(
        DomainEventEnvelope envelope,
        CancellationToken cancellationToken)
    {
        var payload = envelope.PayloadAs<OrderCancelledPayload>();

        var update = Builders<OrderFact>.Update
            .SetOnInsert(f => f.Id, payload.OrderId)
            .SetOnInsert(f => f.CreatedAt, payload.CancelledAt)
            .SetOnInsert(f => f.RefundedAmount, 0m)
            .Set(f => f.Status, "cancelled")
            .Set(f => f.CancelledAt, payload.CancelledAt)
            .Set(f => f.EventId, payload.EventId)
            .Set(f => f.TicketTypeId, payload.TicketTypeId)
            .Set(f => f.UserId, payload.UserId)
            .Set(f => f.Quantity, payload.Quantity)
            .Set(f => f.UpdatedAt, DateTime.UtcNow)
            .Max(f => f.LastEventAt, envelope.OccurredAt);

        // No revenue movement: a cancelled order never paid. It matters to the
        // funnel, which reads order_facts directly.
        await context.OrderFacts.UpdateOneAsync(
            f => f.Id == payload.OrderId,
            update,
            new UpdateOptions { IsUpsert = true },
            cancellationToken);
    }

    /// <summary>
    /// Apply an increment to the daily bucket for a given event.
    /// </summary>
    /// <remarks>
    /// Bucketed by UTC day, always. The contract fixes UTC precisely so a sale
    /// at 23:30 local does not land in a different day depending on where the
    /// server happens to be.
    /// </remarks>
    private async Task IncrementDailyAsync(
        DateTime occurredAt,
        int eventId,
        UpdateDefinition<RevenueDaily> increment,
        CancellationToken cancellationToken)
    {
        var day = DateTime.SpecifyKind(occurredAt.ToUniversalTime().Date, DateTimeKind.Utc);
        var id = Models.RevenueDaily.KeyFor(day, eventId);

        var update = Builders<RevenueDaily>.Update
            .Combine(increment)
            .SetOnInsert(r => r.Date, day)
            .SetOnInsert(r => r.EventId, eventId);

        await context.RevenueDaily.UpdateOneAsync(
            r => r.Id == id,
            update,
            new UpdateOptions { IsUpsert = true },
            cancellationToken);
    }
}
