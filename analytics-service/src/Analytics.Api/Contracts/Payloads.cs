using System.Text.Json.Serialization;

namespace Analytics.Api.Contracts;

/// <summary>
/// Domain event payloads. See docs/contracts/domain-events.md.
/// </summary>
/// <remarks>
/// Money is a <c>string</c> on every one of these, not a decimal. Letting
/// System.Text.Json bind it directly to a decimal would work, but it would
/// also quietly accept a JSON number — and the point of the string contract is
/// that a number never appears. Parsing explicitly through
/// <see cref="EventJson.Money"/> keeps that deliberate.
/// </remarks>
public sealed record UserRegisteredPayload
{
    [JsonPropertyName("userId")] public required int UserId { get; init; }
    [JsonPropertyName("name")] public required string Name { get; init; }
    [JsonPropertyName("email")] public required string Email { get; init; }
    [JsonPropertyName("role")] public required string Role { get; init; }
    [JsonPropertyName("registeredAt")] public required DateTime RegisteredAt { get; init; }
}

public sealed record OrderCreatedPayload
{
    [JsonPropertyName("orderId")] public required int OrderId { get; init; }
    [JsonPropertyName("userId")] public int? UserId { get; init; }
    [JsonPropertyName("eventId")] public required int EventId { get; init; }
    [JsonPropertyName("eventTitle")] public required string EventTitle { get; init; }
    [JsonPropertyName("ticketTypeId")] public required int TicketTypeId { get; init; }
    [JsonPropertyName("ticketTypeName")] public required string TicketTypeName { get; init; }
    [JsonPropertyName("customerName")] public required string CustomerName { get; init; }
    [JsonPropertyName("customerEmail")] public required string CustomerEmail { get; init; }
    [JsonPropertyName("quantity")] public required int Quantity { get; init; }
    [JsonPropertyName("unitPrice")] public required string UnitPrice { get; init; }
    [JsonPropertyName("totalAmount")] public required string TotalAmount { get; init; }
    [JsonPropertyName("currency")] public required string Currency { get; init; }
    [JsonPropertyName("status")] public required string Status { get; init; }
    [JsonPropertyName("createdAt")] public required DateTime CreatedAt { get; init; }
    [JsonPropertyName("expiresAt")] public DateTime? ExpiresAt { get; init; }
}

public sealed record OrderPaidPayload
{
    [JsonPropertyName("orderId")] public required int OrderId { get; init; }
    [JsonPropertyName("userId")] public int? UserId { get; init; }
    [JsonPropertyName("eventId")] public required int EventId { get; init; }
    [JsonPropertyName("eventTitle")] public required string EventTitle { get; init; }
    [JsonPropertyName("ticketTypeId")] public required int TicketTypeId { get; init; }
    [JsonPropertyName("quantity")] public required int Quantity { get; init; }
    [JsonPropertyName("totalAmount")] public required string TotalAmount { get; init; }
    [JsonPropertyName("currency")] public required string Currency { get; init; }
    [JsonPropertyName("paymentId")] public required int PaymentId { get; init; }
    [JsonPropertyName("gatewayReference")] public string? GatewayReference { get; init; }
    [JsonPropertyName("customerName")] public required string CustomerName { get; init; }
    [JsonPropertyName("customerEmail")] public required string CustomerEmail { get; init; }
    [JsonPropertyName("paidAt")] public required DateTime PaidAt { get; init; }
}

public sealed record OrderRefundedPayload
{
    [JsonPropertyName("orderId")] public required int OrderId { get; init; }
    [JsonPropertyName("userId")] public int? UserId { get; init; }
    [JsonPropertyName("eventId")] public required int EventId { get; init; }
    [JsonPropertyName("eventTitle")] public required string EventTitle { get; init; }
    [JsonPropertyName("ticketTypeId")] public required int TicketTypeId { get; init; }
    [JsonPropertyName("quantity")] public required int Quantity { get; init; }
    [JsonPropertyName("refundedAmount")] public required string RefundedAmount { get; init; }
    [JsonPropertyName("currency")] public required string Currency { get; init; }
    [JsonPropertyName("paymentId")] public required int PaymentId { get; init; }
    [JsonPropertyName("gatewayReference")] public string? GatewayReference { get; init; }
    [JsonPropertyName("customerName")] public required string CustomerName { get; init; }
    [JsonPropertyName("customerEmail")] public required string CustomerEmail { get; init; }
    [JsonPropertyName("reason")] public string? Reason { get; init; }
    [JsonPropertyName("refundedAt")] public required DateTime RefundedAt { get; init; }
}

public sealed record OrderCancelledPayload
{
    [JsonPropertyName("orderId")] public required int OrderId { get; init; }
    [JsonPropertyName("userId")] public int? UserId { get; init; }
    [JsonPropertyName("eventId")] public required int EventId { get; init; }
    [JsonPropertyName("ticketTypeId")] public required int TicketTypeId { get; init; }
    [JsonPropertyName("quantity")] public required int Quantity { get; init; }
    [JsonPropertyName("reason")] public string? Reason { get; init; }
    [JsonPropertyName("cancelledAt")] public required DateTime CancelledAt { get; init; }
}

public sealed record EventPublishedPayload
{
    [JsonPropertyName("eventId")] public required int EventId { get; init; }
    [JsonPropertyName("title")] public required string Title { get; init; }
    [JsonPropertyName("venue")] public string? Venue { get; init; }
    [JsonPropertyName("eventTypeId")] public int? EventTypeId { get; init; }
    [JsonPropertyName("eventTypeName")] public string? EventTypeName { get; init; }
    [JsonPropertyName("startsAt")] public required DateTime StartsAt { get; init; }
    [JsonPropertyName("endsAt")] public DateTime? EndsAt { get; init; }
    [JsonPropertyName("totalTickets")] public required int TotalTickets { get; init; }
    [JsonPropertyName("coverImageUrl")] public string? CoverImageUrl { get; init; }
    [JsonPropertyName("publishedAt")] public required DateTime PublishedAt { get; init; }
}

/// <summary>Event type names, so handlers and tests cannot disagree on spelling.</summary>
public static class EventTypes
{
    public const string UserRegistered = "user.registered";
    public const string OrderCreated = "order.created";
    public const string OrderPaid = "order.paid";
    public const string OrderRefunded = "order.refunded";
    public const string OrderCancelled = "order.cancelled";
    public const string EventPublished = "event.published";

    /// <summary>The reason carried when the expiry sweeper reclaims a reservation.</summary>
    public const string ReasonReservationExpired = "reservation_expired";
}
