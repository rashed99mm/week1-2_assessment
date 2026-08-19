using MongoDB.Bson.Serialization.Attributes;

namespace Analytics.Api.Models;

/// <summary>
/// An event that went on sale.
/// </summary>
/// <remarks>
/// Exists mainly for <see cref="TotalTickets"/>, which is the denominator of
/// the sell-through figure on the dashboard. Order facts alone can say how
/// many tickets sold but not what fraction of the room that was.
/// </remarks>
public sealed class EventDim
{
    /// <summary>The Laravel event id.</summary>
    [BsonId]
    public int Id { get; set; }

    public string Title { get; set; } = string.Empty;

    public string? Venue { get; set; }

    public int? EventTypeId { get; set; }

    public string? EventTypeName { get; set; }

    public DateTime StartsAt { get; set; }

    public DateTime? EndsAt { get; set; }

    public int TotalTickets { get; set; }

    public string? CoverImageUrl { get; set; }

    public DateTime PublishedAt { get; set; }
}
