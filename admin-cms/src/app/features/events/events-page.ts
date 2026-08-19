import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { describeError } from '../../core/api/api-error'
import type { EventType, TicketEvent } from '../../models'
import { ConfirmService } from '../../shared/services/confirm.service'
import { ToastService } from '../../shared/services/toast.service'
import { DataTable, initialTableState, type ColumnDef, type TableState } from '../../shared/ui/data-table'
import { EventFormDialog } from './event-form-dialog'
import { EventsService } from './events.service'

/**
 * Event management.
 *
 * The React portal rendered these as cards; a CMS wants a table — an operator
 * scanning for one event among two hundred needs rows, not a gallery.
 */
@Component({
  selector: 'app-events-page',
  standalone: true,
  imports: [DataTable, EventFormDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared-page.css',
  template: `
    <header class="page-head">
      <div>
        <h1>Events</h1>
        <p>Everything in the catalogue, including drafts.</p>
      </div>
      <button type="button" class="primary" (click)="openCreate()">New event</button>
    </header>

    <div class="filters">
      <input
        type="search"
        placeholder="Search title or venue…"
        [value]="state().filters['search'] ?? ''"
        (input)="setFilter('search', $event)"
      />

      <select [value]="state().filters['status'] ?? ''" (change)="setFilter('status', $event)">
        <option value="">All statuses</option>
        <option value="draft">Draft</option>
        <option value="published">Published</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>

    <ng-template #rowActions let-event>
      <button type="button" (click)="openEdit(event)">Edit</button>
      <button type="button" class="danger" (click)="remove(event)">Delete</button>
    </ng-template>

    <app-data-table
      [columns]="columns"
      [rows]="rows()"
      [total]="total()"
      [loading]="loading()"
      [actions]="rowActions"
      [(state)]="state"
      emptyMessage="No events match this view."
    />

    @if (dialogOpen()) {
      <app-event-form-dialog
        [event]="editing()"
        [eventTypes]="eventTypes()"
        (saved)="onSaved()"
        (closed)="dialogOpen.set(false)"
      />
    }
  `,
})
export class EventsPage implements OnInit {
  private readonly service = inject(EventsService)
  private readonly toast = inject(ToastService)
  private readonly confirm = inject(ConfirmService)

  readonly state = signal<TableState>({ ...initialTableState, perPage: 15 })
  readonly rows = signal<TicketEvent[]>([])
  readonly eventTypes = signal<EventType[]>([])
  readonly total = signal(0)
  readonly loading = signal(false)

  readonly dialogOpen = signal(false)
  readonly editing = signal<TicketEvent | null>(null)


  private searchDebounce: ReturnType<typeof setTimeout> | null = null

  readonly columns: ColumnDef<TicketEvent>[] = [
    { key: 'id', header: 'ID' },
    { key: 'title', header: 'Title', sortable: true },
    { key: 'venue', header: 'Venue' },
    {
      key: 'starts_at',
      header: 'Starts',
      sortable: true,
      cell: (row) => formatDateTime(row.starts_at),
    },
    { key: 'total_tickets', header: 'Capacity', align: 'right' },
    { key: 'status', header: 'Status' },
  ]

  ngOnInit(): void {
    void this.loadEventTypes()
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
          search: current.filters['search'],
          status: current.filters['status'],
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

  private async loadEventTypes(): Promise<void> {
    try {
      this.eventTypes.set(await firstValueFrom(this.service.eventTypes()))
    } catch {
      // The dropdown degrades to "None"; the page is still usable.
    }
  }

  /**
   * Update a filter and reload.
   *
   * Search is debounced: reloading on every keystroke would fire a request per
   * character and let a slow earlier response overwrite a newer one.
   */
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

  openCreate(): void {
    this.editing.set(null)
    this.dialogOpen.set(true)
  }

  openEdit(event: TicketEvent): void {
    this.editing.set(event)
    this.dialogOpen.set(true)
  }

  onSaved(): void {
    this.dialogOpen.set(false)
    void this.load()
  }

  async remove(event: TicketEvent): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Delete this event?',
      // Names the event rather than asking abstractly — window.confirm could
      // not, which is how the wrong row gets deleted.
      message: `"${event.title}" will be removed from the catalogue. Orders already placed against it are kept.`,
      confirmLabel: 'Delete event',
      tone: 'danger',
    })

    if (!confirmed) return

    try {
      await this.service.destroy(event.id)
      this.toast.success(`Deleted "${event.title}".`)
      void this.load()
    } catch (error) {
      this.toast.error(describeError(error))
    }
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—'

  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
