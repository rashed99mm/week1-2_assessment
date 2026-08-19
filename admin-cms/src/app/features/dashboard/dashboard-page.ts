import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { describeError } from '../../core/api/api-error'
import { RealtimeService } from '../../core/realtime/realtime.service'
import type { KpiSummary, OrderFunnel, RevenuePoint, TopEvent } from '../../models'
import { ToastService } from '../../shared/services/toast.service'
import { DashboardService } from './dashboard.service'
import { RevenueChart } from './revenue-chart'

type Range = '7d' | '30d' | '90d'

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RevenueChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './dashboard-page.css',
  template: `
    <header class="page-head">
      <div>
        <h1>Dashboard</h1>
        <p>
          Sales and revenue
          @if (realtime.connected()) {
            <span class="live" title="Receiving live updates">● live</span>
          }
        </p>
      </div>

      <div class="ranges">
        @for (option of ranges; track option.value) {
          <button
            type="button"
            [class.active]="range() === option.value"
            (click)="setRange(option.value)"
          >
            {{ option.label }}
          </button>
        }
      </div>
    </header>

    @if (unavailable()) {
      <p class="notice">
        The analytics service is not reachable, so these figures are unavailable.
        Everything else in the CMS still works.
      </p>
    }

    <section class="tiles">
      <div class="tile">
        <span class="label">Net revenue</span>
        <strong>{{ money(kpis()?.net_revenue) }}</strong>
        <span class="sub">{{ money(kpis()?.total_revenue) }} gross</span>
      </div>
      <div class="tile">
        <span class="label">Tickets sold</span>
        <strong>{{ kpis()?.tickets_sold ?? 0 }}</strong>
        <span class="sub">{{ kpis()?.orders_paid ?? 0 }} paid orders</span>
      </div>
      <div class="tile">
        <span class="label">Conversion</span>
        <strong>{{ percent(kpis()?.conversion_rate) }}</strong>
        <span class="sub">of {{ kpis()?.orders_total ?? 0 }} placed</span>
      </div>
      <div class="tile">
        <span class="label">Average order</span>
        <strong>{{ money(kpis()?.avg_order_value) }}</strong>
        <span class="sub">{{ money(kpis()?.refunded_amount) }} refunded</span>
      </div>
    </section>

    <section class="panel">
      <h2>Revenue</h2>
      <app-revenue-chart [points]="revenue()" />
    </section>

    <div class="split">
      <section class="panel">
        <h2>Top events</h2>
        @if (topEvents().length === 0) {
          <p class="empty">No sales in this period.</p>
        } @else {
          <ul class="ranked">
            @for (event of topEvents(); track event.event_id) {
              <li>
                <span class="rank-title">{{ event.title }}</span>
                <span class="rank-meta">
                  {{ event.tickets_sold }} sold
                  @if (event.sell_through !== null) {
                    · {{ percent(event.sell_through) }} of capacity
                  }
                </span>
                <span class="rank-value">{{ money(event.revenue) }}</span>
              </li>
            }
          </ul>
        }
      </section>

      <section class="panel">
        <h2>Order outcomes</h2>
        @if (funnel(); as f) {
          <ul class="funnel">
            <li><span>Placed</span><strong>{{ f.created }}</strong></li>
            <li><span>Paid</span><strong>{{ f.paid }}</strong></li>
            <li><span>Awaiting payment</span><strong>{{ f.pending }}</strong></li>
            <li><span>Failed</span><strong>{{ f.failed }}</strong></li>
            <li><span>Cancelled or expired</span><strong>{{ f.cancelled }}</strong></li>
            <li><span>Refunded</span><strong>{{ f.refunded }}</strong></li>
          </ul>
        }
      </section>
    </div>
  `,
})
export class DashboardPage implements OnInit {
  private readonly service = inject(DashboardService)
  private readonly toast = inject(ToastService)
  protected readonly realtime = inject(RealtimeService)

  readonly range = signal<Range>('30d')
  readonly kpis = signal<KpiSummary | null>(null)
  readonly revenue = signal<RevenuePoint[]>([])
  readonly funnel = signal<OrderFunnel | null>(null)
  readonly topEvents = signal<TopEvent[]>([])
  readonly unavailable = signal(false)

  readonly ranges: { value: Range; label: string }[] = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
  ]

  constructor() {
    // A sale pushed over the socket refreshes the figures, so a dashboard left
    // on a wall stays current without polling.
    effect(() => {
      if (this.realtime.lastOrderPaid()) void this.load()
    })
  }

  ngOnInit(): void {
    void this.load()
  }

  setRange(range: Range): void {
    this.range.set(range)
    void this.load()
  }

  async load(): Promise<void> {
    const days = this.range() === '7d' ? 7 : this.range() === '30d' ? 30 : 90
    const to = new Date()
    const from = new Date(to.getTime() - days * 86_400_000)

    const fromIso = from.toISOString()
    const toIso = to.toISOString()

    try {
      // Fetched together: four sequential round-trips would show the panels
      // filling in one at a time, which reads as slowness.
      const [kpis, revenue, funnel, topEvents] = await Promise.all([
        firstValueFrom(this.service.kpis(fromIso, toIso)),
        firstValueFrom(this.service.revenueOverTime('day', fromIso, toIso)),
        firstValueFrom(this.service.funnel(fromIso, toIso)),
        firstValueFrom(this.service.topEvents(5, 'revenue', fromIso, toIso)),
      ])

      this.kpis.set(kpis)
      this.revenue.set(revenue)
      this.funnel.set(funnel)
      this.topEvents.set(topEvents)
      this.unavailable.set(false)
    } catch (error) {
      // Reported in place rather than as a toast: the panels are empty and
      // the reason belongs next to them.
      this.unavailable.set(true)
      this.toast.error(describeError(error))
    }
  }

  /** Money arrives as a decimal string; shown as-is, never re-parsed. */
  money(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '—'

    return `$${value}`
  }

  percent(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—'

    return `${Math.round(value * 1000) / 10}%`
  }
}
