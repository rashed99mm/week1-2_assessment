import { ChangeDetectionStrategy, Component, OnInit, effect, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { describeError } from '../../core/api/api-error'
import { RealtimeService } from '../../core/realtime/realtime.service'
import type { Notification } from '../../models'
import { ToastService } from '../../shared/services/toast.service'
import { NotificationsService } from './notifications.service'

@Component({
  selector: 'app-notifications-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared-page.css',
  styles: [`
    ul { list-style: none; margin: 0; padding: 0; }
    li {
      display: flex;
      gap: 0.9rem;
      align-items: flex-start;
      padding: 0.85rem 1rem;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      margin-bottom: 0.5rem;
    }
    li.unread { border-left: 3px solid var(--accent); }
    .body { flex: 1; }
    .title { font-weight: 600; font-size: 0.92rem; }
    .text { color: var(--muted); font-size: 0.86rem; margin-top: 0.15rem; }
    .when { color: var(--muted); font-size: 0.76rem; white-space: nowrap; }
    .empty { color: var(--muted); padding: 2.5rem 0; text-align: center; }
  `],
  template: `
    <header class="page-head">
      <div>
        <h1>Notifications</h1>
        <p>What the system has been doing.</p>
      </div>
      <button type="button" (click)="markAllRead()">Mark all read</button>
    </header>

    <div class="filters">
      <select [value]="status()" (change)="setStatus($event)">
        <option value="all">All</option>
        <option value="unread">Unread only</option>
      </select>
    </div>

    @if (rows().length === 0) {
      <p class="empty">Nothing here yet.</p>
    } @else {
      <ul>
        @for (item of rows(); track item._id) {
          <li [class.unread]="!item.readAt">
            <div class="body">
              <div class="title">{{ item.title }}</div>
              <div class="text">{{ item.body }}</div>
            </div>
            <span class="when">{{ when(item.createdAt) }}</span>
            @if (!item.readAt) {
              <button type="button" (click)="markRead(item)">Mark read</button>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class NotificationsPage implements OnInit {
  private readonly service = inject(NotificationsService)
  private readonly toast = inject(ToastService)
  private readonly realtime = inject(RealtimeService)

  readonly rows = signal<Notification[]>([])
  readonly status = signal<'all' | 'unread'>('all')

  constructor() {
    // A notification arriving over the socket shows up without a refresh.
    effect(() => {
      this.realtime.notificationTick()
      void this.load()
    })
  }

  ngOnInit(): void {
    void this.load()
  }

  async load(): Promise<void> {
    try {
      const page = await firstValueFrom(this.service.list(1, 50, this.status()))
      this.rows.set(page.data)
    } catch (error) {
      this.toast.error(describeError(error))
    }
  }

  setStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as 'all' | 'unread')
    void this.load()
  }

  async markRead(item: Notification): Promise<void> {
    try {
      await this.service.markRead(item._id)
      void this.load()
    } catch (error) {
      this.toast.error(describeError(error))
    }
  }

  async markAllRead(): Promise<void> {
    try {
      const updated = await this.service.markAllRead()
      this.toast.success(`Marked ${updated} notification(s) as read.`)
      void this.load()
    } catch (error) {
      this.toast.error(describeError(error))
    }
  }

  when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  }
}
