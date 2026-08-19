import { Injectable, inject } from '@angular/core'
import { environment } from '../../../environments/environment'
import { ApiService } from '../../core/api/api.service'
import type { EventSales, KpiSummary, OrderFunnel, RevenuePoint, TopEvent } from '../../models'

/**
 * The dashboard's data, from the .NET analytics service.
 *
 * A separate read model rather than aggregating over the Laravel database:
 * these are the most-refreshed figures in the CMS, and computing them from
 * order rows on every load would put a growing group-by in front of a page
 * somebody leaves open all day.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService)

  private url(path: string): string {
    return `${environment.analyticsBaseUrl}/${path}`
  }

  kpis(from?: string, to?: string) {
    return this.api.get<KpiSummary>(this.url('kpis'), { from, to })
  }

  revenueOverTime(granularity: 'day' | 'week' | 'month', from?: string, to?: string) {
    return this.api.get<RevenuePoint[]>(this.url('revenue-over-time'), {
      granularity,
      from,
      to,
    })
  }

  salesByEvent(limit = 10, from?: string, to?: string) {
    return this.api.get<EventSales[]>(this.url('sales-by-event'), { limit, from, to })
  }

  funnel(from?: string, to?: string) {
    return this.api.get<OrderFunnel>(this.url('order-status-funnel'), { from, to })
  }

  topEvents(limit = 5, metric: 'revenue' | 'tickets' = 'revenue', from?: string, to?: string) {
    return this.api.get<TopEvent[]>(this.url('top-events'), { limit, metric, from, to })
  }
}
