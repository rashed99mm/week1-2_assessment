using Analytics.Api.Common;
using Analytics.Api.Models.Dtos;
using Analytics.Api.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Analytics.Api.Controllers;

/// <summary>
/// The dashboard read API, consumed by the Angular CMS.
/// </summary>
/// <remarks>
/// Administrators only, and read-only throughout: this service owns a
/// projection, not a system of record. Nothing here can change a fact — the
/// only way data enters is through the event stream.
/// </remarks>
[ApiController]
[Route("api/v1/analytics")]
[Authorize(Policy = "AdminOnly")]
public sealed class AnalyticsController(IAnalyticsRepository repository) : ControllerBase
{
    private const int MaxLimit = 100;

    [HttpGet("kpis")]
    public async Task<ActionResult<ApiResponse<KpiSummaryDto>>> Kpis(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken cancellationToken)
    {
        var query = AnalyticsQuery.Resolve(from, to);

        return Ok(ApiResponse<KpiSummaryDto>.Ok(
            await repository.GetKpisAsync(query, cancellationToken),
            "KPIs fetched successfully."));
    }

    [HttpGet("revenue-over-time")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<RevenuePointDto>>>> RevenueOverTime(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string granularity = "day",
        CancellationToken cancellationToken = default)
    {
        var query = AnalyticsQuery.Resolve(from, to);

        return Ok(ApiResponse<IReadOnlyList<RevenuePointDto>>.Ok(
            await repository.GetRevenueOverTimeAsync(query, granularity, cancellationToken),
            "Revenue fetched successfully."));
    }

    [HttpGet("sales-by-event")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<EventSalesDto>>>> SalesByEvent(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int limit = 20,
        CancellationToken cancellationToken = default)
    {
        var query = AnalyticsQuery.Resolve(from, to);

        return Ok(ApiResponse<IReadOnlyList<EventSalesDto>>.Ok(
            await repository.GetSalesByEventAsync(query, Clamp(limit), cancellationToken),
            "Sales fetched successfully."));
    }

    [HttpGet("sales-by-ticket-type")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<TicketTypeSalesDto>>>> SalesByTicketType(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery(Name = "event_id")] int? eventId = null,
        CancellationToken cancellationToken = default)
    {
        var query = AnalyticsQuery.Resolve(from, to);

        return Ok(ApiResponse<IReadOnlyList<TicketTypeSalesDto>>.Ok(
            await repository.GetSalesByTicketTypeAsync(query, eventId, cancellationToken),
            "Sales fetched successfully."));
    }

    [HttpGet("order-status-funnel")]
    public async Task<ActionResult<ApiResponse<FunnelDto>>> Funnel(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        CancellationToken cancellationToken = default)
    {
        var query = AnalyticsQuery.Resolve(from, to);

        return Ok(ApiResponse<FunnelDto>.Ok(
            await repository.GetFunnelAsync(query, cancellationToken),
            "Funnel fetched successfully."));
    }

    [HttpGet("top-events")]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<TopEventDto>>>> TopEvents(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int limit = 5,
        [FromQuery] string metric = "revenue",
        CancellationToken cancellationToken = default)
    {
        var query = AnalyticsQuery.Resolve(from, to);

        return Ok(ApiResponse<IReadOnlyList<TopEventDto>>.Ok(
            await repository.GetTopEventsAsync(query, Clamp(limit), metric, cancellationToken),
            "Top events fetched successfully."));
    }

    /// <summary>Keep a client-supplied limit within bounds.</summary>
    private static int Clamp(int limit) => Math.Max(1, Math.Min(limit, MaxLimit));
}
