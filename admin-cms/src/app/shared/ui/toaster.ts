import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { ToastService } from '../services/toast.service'

/** Renders the toast stack. Mounted once, by the root component. */
@Component({
  selector: 'app-toaster',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .stack {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 100;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-width: min(28rem, calc(100vw - 2rem));
    }
    .toast {
      padding: 0.7rem 0.9rem;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: 0 8px 24px rgb(0 0 0 / 0.18);
      font-size: 0.88rem;
      display: flex;
      gap: 0.6rem;
      align-items: flex-start;
    }
    .toast.success { border-left: 3px solid #16a34a; }
    .toast.error { border-left: 3px solid #dc2626; }
    .toast.info { border-left: 3px solid #2563eb; }
    .message { flex: 1; }
    button {
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
    }
  `],
  template: `
    <!-- aria-live so a screen reader announces results that appear without
         the user having moved focus. -->
    <div class="stack" role="status" aria-live="polite">
      @for (toast of toasts(); track toast.id) {
        <div class="toast" [class]="toast.tone">
          <span class="message">{{ toast.message }}</span>
          <button type="button" (click)="dismiss(toast.id)" aria-label="Dismiss">×</button>
        </div>
      }
    </div>
  `,
})
export class Toaster {
  private readonly service = inject(ToastService)

  readonly toasts = this.service.toasts

  dismiss(id: number): void {
    this.service.dismiss(id)
  }
}
