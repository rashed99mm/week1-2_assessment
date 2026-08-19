using Analytics.Api.Contracts;
using Analytics.Api.Infrastructure;
using Analytics.Api.Models;
using MongoDB.Driver;

namespace Analytics.Api.Messaging.Projectors;

/// <summary>
/// Projects the dimension events — events and users.
/// </summary>
public sealed class DimensionProjector(MongoContext context)
{
    public async Task ProjectEventPublishedAsync(
        DomainEventEnvelope envelope,
        CancellationToken cancellationToken)
    {
        var payload = envelope.PayloadAs<EventPublishedPayload>();

        var update = Builders<EventDim>.Update
            .SetOnInsert(e => e.Id, payload.EventId)
            .Set(e => e.Title, payload.Title)
            .Set(e => e.Venue, payload.Venue)
            .Set(e => e.EventTypeId, payload.EventTypeId)
            .Set(e => e.EventTypeName, payload.EventTypeName)
            .Set(e => e.StartsAt, payload.StartsAt)
            .Set(e => e.EndsAt, payload.EndsAt)
            // The denominator of the sell-through figure on the dashboard.
            .Set(e => e.TotalTickets, payload.TotalTickets)
            .Set(e => e.CoverImageUrl, payload.CoverImageUrl)
            .Set(e => e.PublishedAt, payload.PublishedAt);

        await context.EventDims.UpdateOneAsync(
            e => e.Id == payload.EventId,
            update,
            new UpdateOptions { IsUpsert = true },
            cancellationToken);
    }

    public async Task ProjectUserRegisteredAsync(
        DomainEventEnvelope envelope,
        CancellationToken cancellationToken)
    {
        var payload = envelope.PayloadAs<UserRegisteredPayload>();

        var update = Builders<UserDim>.Update
            .SetOnInsert(u => u.Id, payload.UserId)
            .Set(u => u.Name, payload.Name)
            .Set(u => u.Email, payload.Email)
            .Set(u => u.Role, payload.Role)
            .Set(u => u.RegisteredAt, payload.RegisteredAt);

        await context.UserDims.UpdateOneAsync(
            u => u.Id == payload.UserId,
            update,
            new UpdateOptions { IsUpsert = true },
            cancellationToken);
    }
}
