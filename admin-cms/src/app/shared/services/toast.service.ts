import { Injectable, signal } from '@angular/core'

export interface Toast {
  id: number
  tone: 'success' | 'error' | 'info'
  message: string
}

/**
 * Transient feedback.
 *
 * Replaces the inline <Alert> blocks the React admin pages rendered per page —
 * a single overlay means a result is reported the same way wherever it came
 * from, including from a background socket push.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1
  private readonly _toasts = signal<Toast[]>([])

  readonly toasts = this._toasts.asReadonly()

  success(message: string): void {
    this.push('success', message)
  }

  /** Errors linger: they usually need reading, and often acting on. */
  error(message: string): void {
    this.push('error', message, 8000)
  }

  info(message: string): void {
    this.push('info', message)
  }

  dismiss(id: number): void {
    this._toasts.update((toasts) => toasts.filter((toast) => toast.id !== id))
  }

  private push(tone: Toast['tone'], message: string, ttlMs = 4000): void {
    const id = this.nextId++

    this._toasts.update((toasts) => [...toasts, { id, tone, message }])

    setTimeout(() => this.dismiss(id), ttlMs)
  }
}
