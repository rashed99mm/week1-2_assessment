import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core'
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type ValidationErrors,
} from '@angular/forms'
import { describeError } from '../../core/api/api-error'
import type { EventStatus, EventType, TicketEvent } from '../../models'
import { ToastService } from '../../shared/services/toast.service'
import { toLocalInputValue } from '../../shared/util/datetime'
import { EventsService } from './events.service'

/** The cover-image rules, mirroring StoreEventRequest. */
const MAX_COVER_BYTES = 4 * 1024 * 1024
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp']

@Component({
  selector: 'app-event-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './event-form-dialog.css',
  template: `
    <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="event-form-title">
      <div class="dialog">
        <header>
          <h2 id="event-form-title">{{ event() ? 'Edit event' : 'New event' }}</h2>
          <button type="button" (click)="closed.emit()" aria-label="Close">×</button>
        </header>

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>
            <span>Title *</span>
            <input type="text" formControlName="title" required />
          </label>

          <label>
            <span>Description</span>
            <textarea formControlName="description" rows="3"></textarea>
          </label>

          <div class="grid">
            <label>
              <span>Venue</span>
              <input type="text" formControlName="venue" />
            </label>

            <label>
              <span>Event type</span>
              <select formControlName="event_type_id">
                <option value="">None</option>
                @for (type of eventTypes(); track type.id) {
                  <option [value]="type.id">{{ type.name }}</option>
                }
              </select>
            </label>
          </div>

          <div class="grid">
            <label>
              <span>Starts *</span>
              <input type="datetime-local" formControlName="starts_at" required />
            </label>

            <label>
              <span>Ends</span>
              <input type="datetime-local" formControlName="ends_at" />
            </label>
          </div>

          @if (form.hasError('endsBeforeStarts')) {
            <p class="field-error">The end time must be after the start time.</p>
          }

          <div class="grid">
            <label>
              <span>Capacity</span>
              <input type="number" formControlName="total_tickets" min="0" />
            </label>

            <label>
              <span>Status</span>
              <select formControlName="status">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
          </div>

          <label class="cover">
            <span>Cover image</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" (change)="pickCover($event)" />
            <small>JPEG, PNG or WebP, up to 4 MB.</small>
          </label>

          @if (coverError(); as message) {
            <p class="field-error">{{ message }}</p>
          }

          @if (event()?.cover_image_url && !coverFile()) {
            <label class="inline">
              <input type="checkbox" [checked]="removeCover()" (change)="toggleRemoveCover()" />
              <span>Remove the current cover image</span>
            </label>
          }

          <footer>
            <button type="button" (click)="closed.emit()">Cancel</button>
            <button type="submit" class="primary" [disabled]="form.invalid || saving()">
              {{ saving() ? 'Saving…' : 'Save event' }}
            </button>
          </footer>
        </form>
      </div>
    </div>
  `,
})
export class EventFormDialog {
  private readonly fb = inject(FormBuilder)
  private readonly service = inject(EventsService)
  private readonly toast = inject(ToastService)

  readonly event = input<TicketEvent | null>(null)
  readonly eventTypes = input<EventType[]>([])

  readonly saved = output<void>()
  readonly closed = output<void>()

  readonly saving = signal(false)
  readonly coverFile = signal<File | null>(null)
  readonly coverError = signal<string | null>(null)
  readonly removeCover = signal(false)

  /**
   * The form.
   *
   * `cover_image` is deliberately not a control: a File in a typed reactive
   * form fights the serializer, and the file input is uncontrolled anyway.
   */
  readonly form = this.fb.nonNullable.group(
    {
      title: ['', [Validators.required, Validators.maxLength(255)]],
      description: [''],
      venue: [''],
      event_type_id: [''],
      starts_at: ['', [Validators.required]],
      ends_at: [''],
      total_tickets: ['0'],
      status: ['draft' as EventStatus],
    },
    // A cross-field rule the React form never had: the API rejects it anyway,
    // but catching it here means the user finds out before submitting.
    { validators: endsAfterStarts },
  )

  constructor() {
    // Seeds when the dialog opens against an existing event, and re-seeds if
    // a different event is passed without unmounting.
    effect(() => {
      const event = this.event()

      this.coverFile.set(null)
      this.coverError.set(null)
      this.removeCover.set(false)

      this.form.reset({
        title: event?.title ?? '',
        description: event?.description ?? '',
        venue: event?.venue ?? '',
        event_type_id: event?.event_type_id ? String(event.event_type_id) : '',
        starts_at: toLocalInputValue(event?.starts_at),
        ends_at: toLocalInputValue(event?.ends_at),
        total_tickets: String(event?.total_tickets ?? 0),
        status: event?.status ?? 'draft',
      })
    })
  }

  /**
   * Validate the picked file before it is ever uploaded.
   *
   * The same limits the server enforces. Checking here turns a 4 MB upload
   * that ends in a 422 into an instant message.
   */
  pickCover(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0] ?? null

    this.coverError.set(null)

    if (!file) {
      this.coverFile.set(null)
      return
    }

    if (!COVER_TYPES.includes(file.type)) {
      this.coverError.set('Cover images must be JPEG, PNG or WebP.')
      input.value = ''
      return
    }

    if (file.size > MAX_COVER_BYTES) {
      this.coverError.set('That image is larger than 4 MB.')
      input.value = ''
      return
    }

    this.coverFile.set(file)
    this.removeCover.set(false)
  }

  toggleRemoveCover(): void {
    this.removeCover.update((value) => !value)
  }

  async submit(): Promise<void> {
    if (this.form.invalid || this.saving()) return

    this.saving.set(true)

    try {
      const value = this.form.getRawValue()
      const existing = this.event()

      if (existing) {
        await this.service.update(existing.id, value, this.coverFile(), this.removeCover())
        this.toast.success(`Updated "${value.title}".`)
      } else {
        await this.service.create(value, this.coverFile())
        this.toast.success(`Created "${value.title}".`)
      }

      this.saved.emit()
    } catch (error) {
      this.toast.error(describeError(error))
    } finally {
      this.saving.set(false)
    }
  }
}

/** An event cannot finish before it starts. */
function endsAfterStarts(group: AbstractControl): ValidationErrors | null {
  const starts = group.get('starts_at')?.value as string
  const ends = group.get('ends_at')?.value as string

  if (!starts || !ends) return null

  return new Date(ends) > new Date(starts) ? null : { endsBeforeStarts: true }
}
