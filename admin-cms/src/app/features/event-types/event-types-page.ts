import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { firstValueFrom } from 'rxjs'
import { ApiService } from '../../core/api/api.service'
import { describeError } from '../../core/api/api-error'
import type { EventType } from '../../models'
import { ConfirmService } from '../../shared/services/confirm.service'
import { ToastService } from '../../shared/services/toast.service'
import { DataTable, initialTableState, type ColumnDef, type TableState } from '../../shared/ui/data-table'

/**
 * Event-type management.
 *
 * The public API exposes these read-only — the storefront lists them to build
 * filter chips. Creating and deleting them is editorial work, so it lives
 * behind the admin routes.
 */
@Component({
  selector: 'app-event-types-page',
  standalone: true,
  imports: [DataTable, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared-page.css',
  template: `
    <header class="page-head">
      <div>
        <h1>Event types</h1>
        <p>Categories, and the seat map each one implies.</p>
      </div>
    </header>

    <form class="filters" [formGroup]="form" (ngSubmit)="save()">
      <input type="text" formControlName="name" placeholder="Name, e.g. Comedy Night" required />
      <input type="text" formControlName="slug" placeholder="Slug (optional)" />
      <select formControlName="seating_model">
        <option value="assigned">Assigned seating</option>
        <option value="general">General admission</option>
      </select>
      <label class="inline-check">
        <input type="checkbox" formControlName="is_online" />
        <span>Online event</span>
      </label>
      <button type="submit" class="primary" [disabled]="form.invalid || saving()">
        {{ editingId() ? 'Save changes' : 'Add type' }}
      </button>
      @if (editingId()) {
        <button type="button" (click)="cancelEdit()">Cancel</button>
      }
    </form>

    <ng-template #rowActions let-type>
      <button type="button" (click)="edit(type)">Edit</button>
      <button type="button" class="danger" (click)="remove(type)">Delete</button>
    </ng-template>

    <app-data-table
      [columns]="columns"
      [rows]="rows()"
      [total]="rows().length"
      [loading]="loading()"
      [actions]="rowActions"
      [(state)]="state"
      emptyMessage="No event types yet."
    />
  `,
  styles: [`
    .inline-check { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; }
    .inline-check input { min-width: auto; width: auto; }
  `],
})
export class EventTypesPage implements OnInit {
  private readonly api = inject(ApiService)
  private readonly fb = inject(FormBuilder)
  private readonly toast = inject(ToastService)
  private readonly confirm = inject(ConfirmService)

  readonly state = signal<TableState>({ ...initialTableState, perPage: 50 })
  readonly rows = signal<EventType[]>([])
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly editingId = signal<number | null>(null)


  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    slug: [''],
    seating_model: ['assigned' as 'assigned' | 'general'],
    is_online: [false],
  })

  readonly columns: ColumnDef<EventType>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'slug', header: 'Slug' },
    { key: 'seating_model', header: 'Seating' },
    { key: 'is_online', header: 'Online', cell: (row) => (row.is_online ? 'Yes' : 'No') },
  ]

  ngOnInit(): void {
    void this.load()
  }

  async load(): Promise<void> {
    this.loading.set(true)

    try {
      this.rows.set(await firstValueFrom(this.api.get<EventType[]>('event-types')))
    } catch (error) {
      this.toast.error(describeError(error))
    } finally {
      this.loading.set(false)
    }
  }

  edit(type: EventType): void {
    this.editingId.set(type.id)
    this.form.setValue({
      name: type.name,
      slug: type.slug,
      seating_model: type.seating_model,
      is_online: type.is_online,
    })
  }

  cancelEdit(): void {
    this.editingId.set(null)
    this.form.reset({ name: '', slug: '', seating_model: 'assigned', is_online: false })
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving()) return

    this.saving.set(true)
    const value = this.form.getRawValue()
    const id = this.editingId()

    try {
      // The slug is derived server-side when left blank, so an empty string is
      // omitted rather than sent.
      const payload = { ...value, slug: value.slug || undefined }

      if (id) {
        await firstValueFrom(this.api.put(`admin/event-types/${id}`, payload))
        this.toast.success(`Updated "${value.name}".`)
      } else {
        await firstValueFrom(this.api.post('admin/event-types', payload))
        this.toast.success(`Added "${value.name}".`)
      }

      this.cancelEdit()
      void this.load()
    } catch (error) {
      this.toast.error(describeError(error))
    } finally {
      this.saving.set(false)
    }
  }

  async remove(type: EventType): Promise<void> {
    const confirmed = await this.confirm.confirm({
      title: 'Delete this event type?',
      message: `"${type.name}" will be removed. If any events use it, the deletion is refused rather than silently stripping their category.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    })

    if (!confirmed) return

    try {
      await firstValueFrom(this.api.delete(`admin/event-types/${type.id}`))
      this.toast.success(`Deleted "${type.name}".`)
      void this.load()
    } catch (error) {
      this.toast.error(describeError(error))
    }
  }
}
