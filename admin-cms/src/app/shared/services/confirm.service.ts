import { Injectable, signal } from '@angular/core'

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
}

interface PendingConfirm extends ConfirmRequest {
  resolve: (confirmed: boolean) => void
}

/**
 * Ask before doing something irreversible.
 *
 * Replaces `window.confirm`, which the React admin pages used for both delete
 * actions. The native dialog cannot say what is about to be deleted, cannot be
 * styled to signal danger, and blocks the whole tab.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _pending = signal<PendingConfirm | null>(null)

  readonly pending = this._pending.asReadonly()

  confirm(request: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => {
      this._pending.set({ ...request, resolve })
    })
  }

  respond(confirmed: boolean): void {
    const pending = this._pending()

    if (!pending) return

    this._pending.set(null)
    pending.resolve(confirmed)
  }
}
