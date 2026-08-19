import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { describeError } from '../../core/api/api-error'
import { RealtimeService } from '../../core/realtime/realtime.service'
import type { Order } from '../../models'
import { ConfirmService } from '../../shared/services/confirm.service'
import { ToastService } from '../../shared/services/toast.service'
import { DataTable, initialTableState, type ColumnDef, type TableState } from '../../shared/ui/data-table'
import { OrdersService } from './orders.service'

/**
 * Order management.
 *
 * The screen the React admin never had. Refunds in particular were impossible
 * before: the gateway has always exposed the endpoint, but nothing stored the
 * identifier it needs, so there was no way to call it.
 */
@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared-page.css',
  template: `
    <header class="page-head">
      <div>
        <h1>Orders</h1>
        <p>Every order placed, with payment state and refunds.</p>
      </div>
    </header>

    <div class="filters">
      <input
        type="search"
        placeholder="Order number, name or email…"
        [value]="state().filters['search'] ?? ''"
        (input)="setFilter('search', $event)"
      />

      <select [value]="state().filters['status'] ?? ''" (change)="setFilter('status', $event)">
        <option value="">All statuses</option>
        <option value="pending">Pending</option>
        <option value="paid">Paid</option>
        <option value="failed">Failed</option>
        <option value="refunded">Refunded</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <ng-template #rowActions let-order>
      @if (order.status === 'paid') {
        <button type="button" class="danger" (click)="refund(order)">Refund</button>
      }
      @if (order.status === 'pending') {
        <button type="button" class="danger" (click)="cancel(order)">Cancel</button>
      }
    </ng-template>

    <app-data-table
      [columns]="columns"
      [rows]="rows()"
      [total]="total()"
      [loading]="loading()"
      [actions]="rowActions"
      [(state)]="state"
      emptyMessage="No orders match this view."
    />
  `,
})
export class OrdersPage implements OnInit {
  private readonly service = inject(OrdersService)
  private readonly toast = inject(ToastService)
  private readonly confirm = inject(ConfirmService)
  private readonly realtime = inject(RealtimeService)

  readonly state = signal<TableState>({ ...initialTableState })
  readonly rows = signal<Order[]>([])
  readonly total = signal(0)
  readonly loading = signal(false)


  private searchDebounce: ReturnType<typeof setTimeout> | null = null

  readonly columns: ColumnDef<Order>[] = [
    { key: 'id', header: 'Order' },
    { key: 'customer_name', header: 'Customer' },
    { key: 'customer_email', header: 'Email' },
    { key: 'event', header: 'Event', cell: (row) => row.event?.title ?? `#${row.event_id}` },
    { key: 'quantity', header: 'Qty', align: 'right' },
    {
      key: 'total_amount',
      header: 'Total',
      align: 'right',
      // Displayed as the decimal string it arrived as. Parsing it into a
      // number to reformat is where cent-level drift enters.
      cell: (row) => `$${row.total_amount}`,
    },
    { key: 'status', header: 'Status' },
    {
      key: 'created_at',
      header: 'Placed',
      sortable: true,
      cell: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'),
    },
  ]

  constructor() {
    // A sale confirmed elsewhere should appear here without a manual refresh.
    effect(() => {
      if (this.realtime.lastOrderPaid()) void this.load()
    })
  }

  ngOnInit(): void {
    void this.load()
  }

  async load(): Promise<void> {
    this.loading.set(true)

    try {
      const current = this.state()

      const page = await firstValueFrom(
        this.service.list({
          page: current.page,
          per_page: current.perPage,
          status: current.filters['status'],
          search: current.filters['search'],
        }),
      )

      this.rows.set(page.data)
      this.total.set(page.total)
    } catch (error) {
      this.toast.error(describeError(error))
    } finally {
      this.loading.set(false)
    }
  }

  setFilter(key: string, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value

    this.state.update((state) => ({
      ...state,
      page: 1,
      filters: { ...state.filters, [key]: value },
    }))

    if (this.searchDebounce) clearTimeout(this.searchDebounce)
    this.searchDebounce = setTimeout(() => void this.load(), key === 'search' ? 300 : 0)
  }

  async refund(order: Order): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Refund order #${order.id}?`,
      message:
        `$${order.total_amount} will be returned to ${order.customer_name}, and ` +
        `${order.quantity} ticket(s) go back on sale. This cannot be undone from here.`,
      confirmLabel: 'Refund order',
      tone: 'danger',
    })

    if (!confirmed) return

    try {
      await this.service.refund(order.id)
      this.toast.success(`Refunded order #${order.id}.`)
      void this.load()
    } catch (error) {
      // The gateway's own message matters here — "already refunded" and
      // "gateway unreachable" call for different next steps.
      this.toast.error(describeError(error))
    }
  }

  async cancel(order: Order): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: `Cancel order #${order.id}?`,
      message: `${order.quantity} reserved ticket(s) will go back on sale.`,
      confirmLabel: 'Cancel order',
      tone: 'danger',
    })

    if (!confirmed) return

    try {
      await this.service.cancel(order.id)
      this.toast.success(`Cancelled order #${order.id}.`)
      void this.load()
    } catch (error) {
      this.toast.error(describeError(error))
    }
  }
}
