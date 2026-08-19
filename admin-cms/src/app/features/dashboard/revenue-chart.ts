import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core'
import type { RevenuePoint } from '../../models'

interface Plotted {
  x: number
  y: number
  point: RevenuePoint
}

/**
 * Revenue over time, as inline SVG.
 *
 * Hand-drawn rather than pulling in a charting library. This is one line with
 * a filled area; a library would add several hundred kilobytes to the bundle,
 * its own theming system, and a second set of accessibility conventions, to
 * draw a polyline.
 *
 * A library earns its place once the dashboard wants brushing, zooming or
 * stacked series. It does not yet.
 */
@Component({
  selector: 'app-revenue-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .chart { width: 100%; overflow-x: auto; }
    svg { display: block; width: 100%; height: auto; }
    .area { fill: var(--accent); opacity: 0.12; }
    .line { fill: none; stroke: var(--accent); stroke-width: 2; stroke-linejoin: round; }
    .dot { fill: var(--accent); }
    .grid { stroke: var(--border); stroke-width: 1; }
    .tick { fill: var(--muted); font-size: 10px; }
    .empty { color: var(--muted); text-align: center; padding: 2.5rem 0; font-size: 0.88rem; }
  `],
  template: `
    @if (points().length === 0) {
      <p class="empty">No revenue recorded in this period.</p>
    } @else {
      <div class="chart">
        <!-- A table equivalent for screen readers: an SVG polyline conveys
             nothing without one. -->
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="none"
          role="img"
          [attr.aria-label]="summary()"
        >
          @for (line of gridLines(); track line) {
            <line class="grid" x1="0" [attr.y1]="line" [attr.x2]="width" [attr.y2]="line" />
          }

          <path class="area" [attr.d]="areaPath()" />
          <path class="line" [attr.d]="linePath()" />

          @for (plot of plotted(); track plot.point.period) {
            <circle class="dot" [attr.cx]="plot.x" [attr.cy]="plot.y" r="2.5" />
          }
        </svg>

        <div class="axis">
          <span class="tick">{{ firstLabel() }}</span>
          <span class="tick">{{ maxLabel() }}</span>
          <span class="tick">{{ lastLabel() }}</span>
        </div>
      </div>
    }
  `,
})
export class RevenueChart {
  readonly points = input.required<RevenuePoint[]>()

  protected readonly width = 800
  protected readonly height = 220
  private readonly padding = 24

  /** Net revenue per point, as a number only for plotting geometry. */
  private readonly values = computed(() =>
    this.points().map((point) => Number(point.net_revenue) || 0),
  )

  private readonly max = computed(() => Math.max(1, ...this.values()))

  readonly plotted = computed<Plotted[]>(() => {
    const points = this.points()
    const values = this.values()
    const max = this.max()

    if (points.length === 0) return []

    const usableWidth = this.width - this.padding * 2
    const usableHeight = this.height - this.padding * 2
    const step = points.length === 1 ? 0 : usableWidth / (points.length - 1)

    return points.map((point, index) => ({
      point,
      x: this.padding + step * index,
      y: this.padding + usableHeight - ((values[index] ?? 0) / max) * usableHeight,
    }))
  })

  readonly linePath = computed(() =>
    this.plotted()
      .map((plot, index) => `${index === 0 ? 'M' : 'L'}${plot.x.toFixed(1)},${plot.y.toFixed(1)}`)
      .join(' '),
  )

  readonly areaPath = computed(() => {
    const plots = this.plotted()

    const first = plots[0]
    const last = plots.at(-1)

    if (!first || !last) return ''

    const baseline = this.height - this.padding

    return `M${first.x},${baseline} ${this.linePath().slice(1)} L${last.x},${baseline} Z`
  })

  readonly gridLines = computed(() => {
    const usableHeight = this.height - this.padding * 2

    return [0, 0.25, 0.5, 0.75, 1].map((fraction) => this.padding + usableHeight * fraction)
  })

  readonly firstLabel = computed(() => this.points()[0]?.period ?? '')
  readonly lastLabel = computed(() => this.points().at(-1)?.period ?? '')
  readonly maxLabel = computed(() => `peak $${this.max().toFixed(2)}`)

  /** The chart's content, for anyone who cannot see it. */
  readonly summary = computed(() => {
    const points = this.points()

    if (points.length === 0) return 'No revenue recorded.'

    const total = this.values().reduce((sum, value) => sum + value, 0)

    return (
      `Net revenue across ${points.length} days, ` +
      `from ${this.firstLabel()} to ${this.lastLabel()}, totalling $${total.toFixed(2)}.`
    )
  })
}
