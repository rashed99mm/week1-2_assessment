import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'
import { AuthService } from '../core/auth/auth.service'
import { RealtimeService } from '../core/realtime/realtime.service'
import { NotificationsService } from '../features/notifications/notifications.service'

interface NavItem {
  path: string
  label: string
  icon: string
}

/**
 * The signed-in layout: sidebar, top bar, and the routed page.
 *
 * A distinct shell rather than the portal's public Layout — the two audiences
 * want different things. A customer wants the shop; an operator wants dense
 * navigation and a permanent view of what needs attention.
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './shell.css',
  template: `
    <div class="shell">
      <aside [class.open]="sidebarOpen()">
        <div class="brand">
          <span class="mark">T</span>
          <span class="name">Tickets CMS</span>
        </div>

        <nav>
          @for (item of navItems; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="active"
              (click)="sidebarOpen.set(false)"
            >
              <span class="icon" aria-hidden="true">{{ item.icon }}</span>
              <span>{{ item.label }}</span>

              @if (item.path === '/notifications' && unreadCount() > 0) {
                <span class="badge">{{ unreadCount() }}</span>
              }
            </a>
          }
        </nav>

        <div class="foot">
          <a [href]="portalUrl" target="_blank" rel="noopener">View storefront ↗</a>
        </div>
      </aside>

      <div class="main">
        <header>
          <button
            type="button"
            class="burger"
            (click)="sidebarOpen.set(!sidebarOpen())"
            aria-label="Toggle navigation"
          >
            ☰
          </button>

          <div class="spacer"></div>

          <div class="who">
            <span class="who-name">{{ auth.displayName() }}</span>
            <span class="who-role">Administrator</span>
          </div>

          <button type="button" class="signout" (click)="signOut()">Sign out</button>
        </header>

        <main>
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell implements OnInit {
  protected readonly auth = inject(AuthService)
  private readonly realtime = inject(RealtimeService)
  private readonly notifications = inject(NotificationsService)

  readonly sidebarOpen = signal(false)
  readonly unreadCount = this.notifications.unreadCount

  /** The storefront is a separate app on the same origin. */
  readonly portalUrl = '/'

  readonly navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: '◧' },
    { path: '/events', label: 'Events', icon: '◈' },
    { path: '/ticket-types', label: 'Ticket types', icon: '◨' },
    { path: '/orders', label: 'Orders', icon: '▤' },
    { path: '/event-types', label: 'Event types', icon: '◫' },
    { path: '/users', label: 'Users', icon: '◍' },
    { path: '/notifications', label: 'Notifications', icon: '◉' },
  ]

  ngOnInit(): void {
    // Confirms the stored token is still good, and fills in the display name.
    void this.auth.loadUser().catch(() => undefined)

    void this.notifications.refreshUnreadCount()

    // Live updates for the whole session, not just the dashboard: a sale
    // arriving while someone is editing an event should still bump the badge.
    this.realtime.connect()
  }

  signOut(): void {
    this.realtime.disconnect()
    void this.auth.logout()
  }
}
