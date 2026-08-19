import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { describeError } from '../../core/api/api-error'
import type { TicketEvent, TicketType } from '../../models'
import { ConfirmService } from '../../shared/services/confirm.service'
import { ToastService } from '../../shared/services/toast.service'
import { DataTable, initialTableState, type ColumnDef, type TableState } from '../../shared/ui/data-table'
import { TicketTypeFormDialog } from './ticket-type-form-dialog'
import { TicketTypesService } from './ticket-types.service'

@Component({
  selector: 'app-ticket-types-page',
  standalone: true,
  imports: [DataTable, TicketTypeFormDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared-page.css',
  template: `
    <header class="page-head">
      <div>
        <h1>Ticket types</h1>
        <p>Price tiers and capacity per event.</p>
      </div>
      <button type="button" class="primary" (click)="openCreate()">New ticket type</button>
    </header>

    <div class="filters">
      <select [value]="eventFilter()" (change)="filterByEvent($event)">
        <option value="">All events</option>
        @for (event of events(); track event.id) {
          <option [value]="event.id">{{ event.title }}</option>
        }
      </select>
    </div>

    <ng-template #rowActions let-type>
      <button type="button" (click)="openEdit(type)">Edit</button>
      <button type="button" class="danger" (click)="remove(type)">Delete</button>
    </ng-template>

    <app-data-table
      [columns]="columns"
      [rows]="visibleRows()"
      [total]="rows().length"
      [loading]="loading()"
      [actions]="rowActions"
      [(state)]="state"
      emptyMessage="No ticket types for this view."
    />

    @if (dialogOpen()) {
      <app-ticket-type-form-dialog
        [ticketType]="editing()"
        [events]="events()"
        [defaultEventId]="eventFilter()"
        (saved)="onSaved()"
        (closed)="dialogOpen.set(false)"
      />
    }
  `,
})
export class TicketTypesPage implements OnInit {
  private readonly service = inject(TicketTypesService)
  private readonly toast = inject(ToastService)
  private readonly confirm = inject(ConfirmService)

  readonly state = signal<TableState>({ ...initialTableState })
  readonly rows = signal<TicketType[]>([])
  readonly events = signal<TicketEvent[]>([])
  readonly loading = signal(false)
  readonly eventFilter = signal('')

  readonly dialogOpen = signal(false)
  readonly editing = signal<TicketType | null>(null)


  readonly columns: ColumnDef<TicketType>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    {
      key: 'event_id',
      header: 'Event',
      cell: (row) =>
        this.events().find((event) => event.id === row.event_id)?.title ?? `#${row.event_id}`,
    },
    // Shown as the decimal string the API returned, never re-parsed.
    { key: 'price', header: 'Price', align: 'right', cell: (row) => `$${row.price}` },
    { key: 'quantity', header: 'Remaining', align: 'right' },
  ]

  /**
   * The page of rows to show.
   *
   * Paged in the browser, unusually: this endpoint returns a flat array
   * because an event has a handful of tiers, so there is nothing to page on
   * the server and the table still wants a page.
   */
  visibleRows(): TicketType[] {
    const { page, perPage } = this.state()
    const start = (page - 1) * perPage

    return this.rows().slice(start, start + perPage)
  }

  ngOnInit(): void {
    void this.loadEvents()
    void this.load()
  }

  async load(): Promise<void> {
    this.loading.set(true)

    try {
      this.rows.set(await firstValueFrom(this.service.list(this.eventFilter() || undefined)))
    } catch (error) {
      this.toast.error(describeError(error))
    } finally {
      this.loading.set(false)
    }
  }

  private async loadEvents(): Promise<void> {
    try {
      const page = await firstValueFrom(this.service.events())
      this.events.set(page.data)
    } catch {
      // The filter and the form's dropdown degrade to ids; the page works.
    }
  }

  filterByEvent(event: Event): void {
    this.eventFilter.set((event.target as HTMLSelectElement).value)
    this.state.update((state) => ({ ...state, page: 1 }))
    void this.load()
  }

  openCreate(): void {
    this.editing.set(null)
    this.dialogOpen.set(true)
  }

  openEdit(type: TicketType): void {
    this.editing.set(type)
    this.dialogOpen.set(true)
  }

  onSaved(): void {
    this.dialogOpen.set(false)
    void this.load()
  }

  async remove(type: TicketType): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Delete this ticket type?',
      message: `"${type.name}" will be removed. If any orders reference it, the deletion is refused.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })

    if (!confirmed) return

    try {
      await this.service.destroy(type.id)
      this.toast.success(`Deleted "${type.name}".`)
      void this.load()
    } catch (error) {
      // A 409 here means orders exist against it — the message says so.
      this.toast.error(describeError(error))
    }
  }
}
