import { Injectable, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { environment } from '../../../environments/environment'
import { ApiService } from '../../core/api/api.service'
import type { Paginated } from '../../core/api/api-response.model'
import type { Notification } from '../../models'

/**
 * In-app notifications, served by the Node service rather than Laravel.
 *
 * Absolute paths, because these do not live under the Laravel API base.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiService)

  private readonly _unreadCount = signal(0)
  readonly unreadCount = this._unreadCount.asReadonly()

  list(page: number, perPage: number, status: 'all' | 'unread') {
    return this.api.get<Paginated<Notification>>(
      `${environment.notificationsBaseUrl}/notifications`,
      { page, per_page: perPage, status },
    )
  }

  async refreshUnreadCount(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.api.get<{ count: number }>(
          `${environment.notificationsBaseUrl}/notifications/unread-count`,
        ),
      )

      this._unreadCount.set(result.count)
    } catch {
      // The badge is not worth an error message. If the notification service
      // is down, every other screen still works.
    }
  }

  async markRead(id: string): Promise<void> {
    await firstValueFrom(
      this.api.patch(`${environment.notificationsBaseUrl}/notifications/${id}/read`),
    )

    await this.refreshUnreadCount()
  }

  async markAllRead(): Promise<number> {
    const result = await firstValueFrom(
      this.api.post<{ updated: number }>(
        `${environment.notificationsBaseUrl}/notifications/read-all`,
      ),
    )

    await this.refreshUnreadCount()

    return result.updated
  }
}
