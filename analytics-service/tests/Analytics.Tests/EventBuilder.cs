using System.Text.Json;
using Analytics.Api.Contracts;

namespace Analytics.Tests;

/// <summary>
/// Builds well-formed domain event envelopes.
/// </summary>
/// <remarks>
/// Defaults are deliberately valid so a test states only the field it cares
/// about — and so a test meant to exercise a happy path cannot pass by
/// accident because something unrelated was malformed.
/// </remarks>
public static class EventBuilder
{
    public static DomainEventEnvelope Envelope(
        string type,
        object payload,
        DateTime? occurredAt = null,
        int version = 1,
        string? id = null) =>
        new()
        {
            Id = id ?? Guid.NewGuid().ToString(),
            Type = type,
            Version = version,
            OccurredAt = occurredAt ?? DateTime.UtcNow,
            Source = "tickets-backend",
            CorrelationId = null,
            Actor = new EventActor { UserId = 12, Role = "user" },
            Payload = JsonSerializer.SerializeToElement(payload, EventJson.Options),
        };

    public static object OrderCreated(
        int orderId = 501,
        int eventId = 17,
        int ticketTypeId = 44,
        int quantity = 2,
        string unitPrice = "75.00",
        string totalAmount = "150.00",
        DateTime? createdAt = null) => new
        {
            orderId,
            userId = (int?)12,
            eventId,
            eventTitle = "Aurora Live",
            ticketTypeId,
            ticketTypeName = "Floor A",
            customerName = "Ada Lovelace",
            customerEmail = "ada@example.com",
            quantity,
            unitPrice,
            totalAmount,
            currency = "USD",
            status = "pending",
            createdAt = createdAt ?? new DateTime(2026, 8, 16, 12, 30, 0, DateTimeKind.Utc),
            expiresAt = (DateTime?)null,
        };

    public static object OrderPaid(
        int orderId = 501,
        int eventId = 17,
        int ticketTypeId = 44,
        int quantity = 2,
        string totalAmount = "150.00",
        DateTime? paidAt = null) => new
        {
            orderId,
            userId = (int?)12,
            eventId,
            eventTitle = "Aurora Live",
            ticketTypeId,
            quantity,
            totalAmount,
            currency = "USD",
            paymentId = 88,
            gatewayReference = "TXN-ABC123",
            customerName = "Ada Lovelace",
            customerEmail = "ada@example.com",
            paidAt = paidAt ?? new DateTime(2026, 8, 16, 12, 32, 10, DateTimeKind.Utc),
        };

    public static object OrderRefunded(
        int orderId = 501,
        int eventId = 17,
        string refundedAmount = "150.00",
        DateTime? refundedAt = null) => new
        {
            orderId,
            userId = (int?)12,
            eventId,
            eventTitle = "Aurora Live",
            ticketTypeId = 44,
            quantity = 2,
            refundedAmount,
            currency = "USD",
            paymentId = 88,
            gatewayReference = "TXN-ABC123",
            customerName = "Ada Lovelace",
            customerEmail = "ada@example.com",
            reason = "Customer request",
            refundedAt = refundedAt ?? new DateTime(2026, 8, 17, 9, 15, 0, DateTimeKind.Utc),
        };

    public static object OrderCancelled(int orderId = 502, int eventId = 17) => new
    {
        orderId,
        userId = (int?)null,
        eventId,
        ticketTypeId = 44,
        quantity = 1,
        reason = EventTypes.ReasonReservationExpired,
        cancelledAt = new DateTime(2026, 8, 16, 12, 45, 1, DateTimeKind.Utc),
    };

    public static object EventPublished(int eventId = 17, int totalTickets = 500) => new
    {
        eventId,
        title = "Aurora Live",
        venue = "Rooftop Arena",
        eventTypeId = (int?)3,
        eventTypeName = "Concert",
        startsAt = new DateTime(2026, 9, 1, 19, 0, 0, DateTimeKind.Utc),
        endsAt = (DateTime?)null,
        totalTickets,
        coverImageUrl = (string?)null,
        publishedAt = new DateTime(2026, 8, 16, 10, 0, 0, DateTimeKind.Utc),
    };

    public static object UserRegistered(int userId = 12) => new
    {
        userId,
        name = "Ada Lovelace",
        email = "ada@example.com",
        role = "user",
        registeredAt = new DateTime(2026, 8, 16, 12, 0, 0, DateTimeKind.Utc),
    };
}
