import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { ConfirmService } from '../services/confirm.service'

/**
 * The confirmation modal.
 *
 * Mounted once by the root component; any feature opens it through
 * ConfirmService and awaits the answer.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 200;
      background: rgb(0 0 0 / 0.45);
      display: grid;
      place-items: center;
      padding: 1rem;
    }
    .dialog {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.4rem;
      width: min(30rem, 100%);
      box-shadow: 0 16px 40px rgb(0 0 0 / 0.3);
    }
    h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
    p { margin: 0 0 1.2rem; color: var(--muted); line-height: 1.5; }
    .row { display: flex; gap: 0.6rem; justify-content: flex-end; }
    button {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      cursor: pointer;
      font-size: 0.9rem;
    }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    button.danger { background: #dc2626; border-color: #dc2626; color: #fff; }
  `],
  template: `
    @if (pending(); as request) {
      <!-- Escape cancels: a modal that can only be dismissed by choosing one
           of its buttons is a trap when neither is what you wanted. -->
      <div
        class="backdrop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        (keydown.escape)="respond(false)"
        tabindex="-1"
      >
        <div class="dialog">
          <h2 id="confirm-title">{{ request.title }}</h2>
          <p>{{ request.message }}</p>
          <div class="row">
            <button type="button" (click)="respond(false)">
              {{ request.cancelLabel ?? 'Cancel' }}
            </button>
            <button
              type="button"
              [class]="request.tone === 'danger' ? 'danger' : 'primary'"
              (click)="respond(true)"
              autofocus
            >
              {{ request.confirmLabel ?? 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialog {
  private readonly service = inject(ConfirmService)

  readonly pending = this.service.pending

  respond(confirmed: boolean): void {
    this.service.respond(confirmed)
  }
}
