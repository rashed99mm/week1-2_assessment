import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { describeError } from '../../core/api/api-error'
import type { TicketEvent, TicketType } from '../../models'
import { ToastService } from '../../shared/services/toast.service'
import { TicketTypesService } from './ticket-types.service'

@Component({
  selector: 'app-ticket-type-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../events/event-form-dialog.css',
  template: `
    <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="tt-form-title">
      <div class="dialog">
        <header>
          <h2 id="tt-form-title">{{ ticketType() ? 'Edit ticket type' : 'New ticket type' }}</h2>
          <button type="button" (click)="closed.emit()" aria-label="Close">×</button>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>
            <span>Event *</span>
            <select formControlName="event_id" required>
              <option value="">Choose an event…</option>
              @for (event of events(); track event.id) {
                <option [value]="event.id">{{ event.title }}</option>
              }
            </select>
          </label>

          <label>
            <span>Name *</span>
            <input type="text" formControlName="name" placeholder="Floor A, Balcony…" required />
          </label>

          <div class="grid">
            <label>
              <span>Price *</span>
              <input type="number" formControlName="price" step="0.01" min="0" required />
            </label>

            <label>
              <span>Quantity *</span>
              <input type="number" formControlName="quantity" min="1" required />
            </label>
          </div>

          @if (ticketType()) {
            <p class="field-error" style="color: var(--muted)">
              Quantity is the number still available, not the original allocation —
              it goes down as tickets sell and back up on a refund.
            </p>
          }

          <footer>
            <button type="button" (click)="closed.emit()">Cancel</button>
            <button type="submit" class="primary" [disabled]="form.invalid || saving()">
              {{ saving() ? 'Saving…' : 'Save ticket type' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  `,
})
export class TicketTypeFormDialog {
  private readonly fb = inject(FormBuilder)
  private readonly service = inject(TicketTypesService)
  private readonly toast = inject(ToastService)

  readonly ticketType = input<TicketType | null>(null)
  readonly events = input<TicketEvent[]>([])
  readonly defaultEventId = input('')

  readonly saved = output<void>()
  readonly closed = output<void>()

  readonly saving = signal(false)

  readonly form = this.fb.nonNullable.group({
    event_id: ['', [Validators.required]],
    name: ['', [Validators.required, Validators.maxLength(255)]],
    price: ['0', [Validators.required, Validators.min(0)]],
    quantity: ['1', [Validators.required, Validators.min(1)]],
  })

  constructor() {
    effect(() => {
      const type = this.ticketType()

      this.form.reset({
        // Pre-selects whatever event the list was filtered to, which is
        // almost always the one being worked on.
        event_id: type ? String(type.event_id) : this.defaultEventId(),
        name: type?.name ?? '',
        price: type?.price ?? '0',
        quantity: String(type?.quantity ?? 1),
      })
    })
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.saving()) return

    this.saving.set(true)

    try {
      const value = this.form.getRawValue()
      const existing = this.ticketType()

      if (existing) {
        await this.service.update(existing.id, value)
        this.toast.success(`Updated "${value.name}".`)
      } else {
        await this.service.create(value)
        this.toast.success(`Created "${value.name}".`)
      }

      this.saved.emit()
    } catch (error) {
      this.toast.error(describeError(error))
    } finally {
      this.saving.set(false)
    }
  }
}
