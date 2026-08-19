import { Injectable, inject, signal } from '@angular/core'
import { io, type Socket } from 'socket.io-client'
import { environment } from '../../../environments/environment'
import { ToastService } from '../../shared/services/toast.service'
import { AuthService } from '../auth/auth.service'

/** A sale, pushed to the admins room the moment it is confirmed. */
export interface OrderPaidEvent {
  orderId: number
  eventId: number
  eventTitle: string
  quantity: number
  totalAmount: string
  currency: string
  paidAt: string
}

/**
 * Live updates from the notification service.
 *
 * Deliberately additive: every screen still works if the socket never
 * connects. A dashboard that only updated over WebSocket would show nothing at
 * all behind a proxy that dropped the upgrade — and that failure is silent,
 * because the polling fallback keeps the connection nominally "working".
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService)
  private readonly toast = inject(ToastService)

  private socket: Socket | null = null

  readonly connected = signal(false)

  /** Bumped whenever a sale arrives, so the dashboard can refetch. */
  readonly lastOrderPaid = signal<OrderPaidEvent | null>(null)

  /** Bumped whenever the unread count may have changed. */
  readonly notificationTick = signal(0)

  connect(): void {
    if (this.socket) return

    const token = this.auth.token()
    if (!token) return

    this.socket = io(environment.socketUrl || window.location.origin, {
      path: environment.socketPath,
      // The token goes in the handshake payload, not a header: the browser
      // WebSocket API cannot set headers.
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10_000,
    })

    this.socket.on('connect', () => this.connected.set(true))
    this.socket.on('disconnect', () => this.connected.set(false))

    this.socket.on('connect_error', () => {
      // Not surfaced to the user. Realtime is an enhancement, and a toast on
      // every reconnection attempt would be noise about something they cannot
      // act on.
      this.connected.set(false)
    })

    this.socket.on('notification:new', () => {
      this.notificationTick.update((n) => n + 1)
    })

    this.socket.on('notification:unread-count', () => {
      this.notificationTick.update((n) => n + 1)
    })

    this.socket.on('order:paid', (payload: OrderPaidEvent) => {
      this.lastOrderPaid.set(payload)
      this.toast.success(
        `Sale: ${payload.quantity} × ${payload.eventTitle} — ${payload.currency} ${payload.totalAmount}`,
      )
    })
  }

  disconnect(): void {
    this.socket?.disconnect()
    this.socket = null
    this.connected.set(false)
  }
}
