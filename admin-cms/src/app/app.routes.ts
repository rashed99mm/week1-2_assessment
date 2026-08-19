import type { Routes } from '@angular/router'
import { adminGuard } from './core/guards/admin.guard'
import { guestGuard } from './core/guards/guest.guard'

/**
 * Every feature is lazy-loaded.
 *
 * A session usually touches two or three screens; shipping the orders table,
 * the charting library and the user admin to someone who only wanted to edit
 * an event is wasted download on every visit.
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login-page').then((m) => m.LoginPage),
    title: 'Sign in · Tickets CMS',
  },
  {
    path: '',
    // Guarded once, here: every child inherits it, so a new screen cannot be
    // added without protection by forgetting a line.
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
        title: 'Dashboard · Tickets CMS',
        data: { breadcrumb: 'Dashboard' },
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./features/events/events-page').then((m) => m.EventsPage),
        title: 'Events · Tickets CMS',
        data: { breadcrumb: 'Events' },
      },
      {
        path: 'ticket-types',
        loadComponent: () =>
          import('./features/ticket-types/ticket-types-page').then((m) => m.TicketTypesPage),
        title: 'Ticket types · Tickets CMS',
        data: { breadcrumb: 'Ticket types' },
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/orders/orders-page').then((m) => m.OrdersPage),
        title: 'Orders · Tickets CMS',
        data: { breadcrumb: 'Orders' },
      },
      {
        path: 'event-types',
        loadComponent: () =>
          import('./features/event-types/event-types-page').then((m) => m.EventTypesPage),
        title: 'Event types · Tickets CMS',
        data: { breadcrumb: 'Event types' },
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users-page').then((m) => m.UsersPage),
        title: 'Users · Tickets CMS',
        data: { breadcrumb: 'Users' },
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications-page').then((m) => m.NotificationsPage),
        title: 'Notifications · Tickets CMS',
        data: { breadcrumb: 'Notifications' },
      },
    ],
  },
  { path: '**', redirectTo: '' },
]
