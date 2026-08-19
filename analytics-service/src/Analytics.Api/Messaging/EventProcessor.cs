using Analytics.Api.Contracts;
using Analytics.Api.Infrastructure;
using Analytics.Api.Models;
using MongoDB.Driver;

namespace Analytics.Api.Messaging;

/// <summary>The outcome of handling one message, which decides ack or nack.</summary>
public enum ProcessResult
{
    /// <summary>Projected, or already had been. Acknowledge.</summary>
    Handled,

    /// <summary>Nothing here understands it. Acknowledge and move on.</summary>
    Ignored,

    /// <summary>Malformed or an unknown version. Dead-letter without requeueing.</summary>
    Poison,

    /// <summary>Transient failure. Requeue and try again.</summary>
    Retry,
}

/// <summary>
/// Decides what to do with one domain event, and projects it.
/// </summary>
/// <remarks>
/// Separate from the RabbitMQ plumbing so the rules — what counts as poison,
/// what counts as a duplicate — can be tested without a broker.
/// </remarks>
public sealed class EventProcessor(
    MongoContext context,
    Projectors.OrderProjector orders,
    Projectors.DimensionProjector dimensions,
    ILogger<EventProcessor> logger)
{
    public async Task<ProcessResult> ProcessAsync(
        DomainEventEnvelope envelope,
        CancellationToken cancellationToken)
    {
        // An unrecognised version means the payload shape changed under us.
        // Guessing produces silently wrong revenue figures, which is worse
        // than a message sitting in a dead-letter queue for someone to read.
        if (envelope.Version != DomainEventEnvelope.SupportedVersion)
        {
            logger.LogError(
                "Unsupported version {Version} for {Type}; dead-lettering.",
                envelope.Version,
                envelope.Type);

            return ProcessResult.Poison;
        }

        if (!IsKnown(envelope.Type))
        {
            // Adding an event type upstream must not break this service.
            logger.LogDebug("No projector for {Type}; ignoring.", envelope.Type);
            return ProcessResult.Ignored;
        }

        // The insert is the check, and it happens before any projection.
        // revenue_daily is maintained with $inc, which is not idempotent —
        // recording afterwards would let a crash mid-projection turn into
        // double-counted revenue on the redelivery.
        try
        {
            await context.ProcessedEvents.InsertOneAsync(
                new ProcessedEvent
                {
                    Id = envelope.Id,
                    Type = envelope.Type,
                    ProcessedAt = DateTime.UtcNow,
                },
                cancellationToken: cancellationToken);
        }
        catch (MongoWriteException e) when (e.WriteError.Category == ServerErrorCategory.DuplicateKey)
        {
            logger.LogDebug("Duplicate delivery of {Id}; already projected.", envelope.Id);
            return ProcessResult.Handled;
        }

        try
        {
            await DispatchAsync(envelope, cancellationToken);
            return ProcessResult.Handled;
        }
        catch (Exception e)
        {
            logger.LogError(e, "Projecting {Type} ({Id}) failed.", envelope.Type, envelope.Id);

            // Remove the dedupe row, or the retry is swallowed by the check
            // above and the event is silently dropped after one failure.
            await context.ProcessedEvents
                .DeleteOneAsync(p => p.Id == envelope.Id, CancellationToken.None);

            return ProcessResult.Retry;
        }
    }

    private Task DispatchAsync(DomainEventEnvelope envelope, CancellationToken cancellationToken) =>
        envelope.Type switch
        {
            EventTypes.OrderCreated => orders.ProjectCreatedAsync(envelope, cancellationToken),
            EventTypes.OrderPaid => orders.ProjectPaidAsync(envelope, cancellationToken),
            EventTypes.OrderRefunded => orders.ProjectRefundedAsync(envelope, cancellationToken),
            EventTypes.OrderCancelled => orders.ProjectCancelledAsync(envelope, cancellationToken),
            EventTypes.EventPublished =>
                dimensions.ProjectEventPublishedAsync(envelope, cancellationToken),
            EventTypes.UserRegistered =>
                dimensions.ProjectUserRegisteredAsync(envelope, cancellationToken),
            _ => Task.CompletedTask,
        };

    private static bool IsKnown(string type) => type switch
    {
        EventTypes.OrderCreated or EventTypes.OrderPaid or EventTypes.OrderRefunded
            or EventTypes.OrderCancelled or EventTypes.EventPublished
            or EventTypes.UserRegistered => true,
        _ => false,
    };
}
