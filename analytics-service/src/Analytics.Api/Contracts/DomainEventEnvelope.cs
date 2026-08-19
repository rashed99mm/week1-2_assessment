using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Analytics.Api.Contracts;

/// <summary>
/// The domain event envelope, as consumed by this service.
/// </summary>
/// <remarks>
/// Hand-written from docs/contracts/domain-events.schema.json rather than
/// generated: the schema is the agreement, this is one party's reading of it,
/// and the tests validate real envelopes against the schema so the two cannot
/// drift silently.
///
/// Note the casing. Envelope and payload fields are camelCase, unlike the
/// snake_case used in HTTP responses — a deliberate difference, since events
/// are a hand-authored contract read by TypeScript and C#, while the HTTP
/// responses are Eloquent attributes serialised directly.
/// </remarks>
public sealed record DomainEventEnvelope
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("version")]
    public required int Version { get; init; }

    [JsonPropertyName("occurredAt")]
    public required DateTime OccurredAt { get; init; }

    [JsonPropertyName("source")]
    public required string Source { get; init; }

    [JsonPropertyName("correlationId")]
    public string? CorrelationId { get; init; }

    [JsonPropertyName("actor")]
    public EventActor? Actor { get; init; }

    /// <summary>
    /// The type-specific body, left as raw JSON.
    /// </summary>
    /// <remarks>
    /// Deferred rather than parsed up front so an envelope carrying an
    /// unrecognised type still deserialises — the consumer acknowledges and
    /// ignores those, because adding an event type upstream must not break
    /// this service.
    /// </remarks>
    [JsonPropertyName("payload")]
    public required JsonElement Payload { get; init; }

    /// <summary>The only payload version this service understands.</summary>
    public const int SupportedVersion = 1;

    /// <summary>Deserialise the payload as a known type.</summary>
    public T PayloadAs<T>() =>
        Payload.Deserialize<T>(EventJson.Options)
        ?? throw new InvalidOperationException($"Payload of {Type} deserialised to null.");
}

public sealed record EventActor
{
    [JsonPropertyName("userId")]
    public int? UserId { get; init; }

    [JsonPropertyName("role")]
    public string Role { get; init; } = "user";
}

/// <summary>Serializer settings for the event wire format.</summary>
public static class EventJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
    };

    /// <summary>
    /// Parse a monetary value from the wire.
    /// </summary>
    /// <remarks>
    /// Money arrives as a decimal string. InvariantCulture is not optional: on
    /// a machine whose locale uses a comma as the decimal separator,
    /// <c>decimal.Parse("150.00")</c> reads fifteen thousand. That failure is
    /// silent, environment-dependent, and would only ever appear in
    /// production.
    /// </remarks>
    public static decimal Money(string value) =>
        decimal.Parse(value, NumberStyles.Number, CultureInfo.InvariantCulture);
}
