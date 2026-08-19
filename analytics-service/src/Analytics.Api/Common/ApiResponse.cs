using System.Text.Json.Serialization;

namespace Analytics.Api.Common;

/// <summary>
/// The response envelope shared by every HTTP API in the system.
/// </summary>
/// <remarks>
/// Mirrors tickets-backend's <c>ApiResponse</c> and the payment gateway's
/// <c>ApiResponse[T]</c>, so a client that can parse one can parse all of them.
/// See docs/contracts/api-response.md.
///
/// Property names are serialised as snake_case by the policy configured in
/// Program.cs. Without it this service would emit <c>statusCode</c> where every
/// other emits <c>status_code</c>, and clients would silently read null.
/// </remarks>
public sealed record ApiResponse<T>
{
    public required bool Success { get; init; }

    public required string Message { get; init; }

    public required int StatusCode { get; init; }

    public T? Data { get; init; }

    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public IDictionary<string, string[]>? Errors { get; init; }

    public static ApiResponse<T> Ok(T data, string message = "Success", int statusCode = 200) =>
        new()
        {
            Success = true,
            Message = message,
            StatusCode = statusCode,
            Data = data,
            Errors = null,
        };

    public static ApiResponse<T> Fail(
        string message,
        int statusCode = 400,
        IDictionary<string, string[]>? errors = null) =>
        new()
        {
            Success = false,
            Message = message,
            StatusCode = statusCode,
            Data = default,
            Errors = errors,
        };
}

/// <summary>Envelope helpers for responses that carry no payload.</summary>
public static class ApiResponse
{
    public static ApiResponse<object> Fail(
        string message,
        int statusCode = 400,
        IDictionary<string, string[]>? errors = null) =>
        ApiResponse<object>.Fail(message, statusCode, errors);
}
