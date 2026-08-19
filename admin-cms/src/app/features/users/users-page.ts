import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { ApiService } from '../../core/api/api.service'
import { describeError } from '../../core/api/api-error'
import type { Paginated } from '../../core/api/api-response.model'
import { AuthService } from '../../core/auth/auth.service'
import type { AdminUser } from '../../models'
import { ConfirmService } from '../../shared/services/confirm.service'
import { ToastService } from '../../shared/services/toast.service'
import { DataTable, initialTableState, type ColumnDef, type TableState } from '../../shared/ui/data-table'

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [DataTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../shared-page.css',
  template: `
    <header class="page-head">
      <div>
        <h1>Users</h1>
        <p>Accounts, and who can administer the shop.</p>
      </div>
    </header>

    <div class="filters">
      <input
        type="search"
        placeholder="Name or email…"
        [value]="state().filters['search'] ?? ''"
        (input)="setFilter('search', $event)"
      />
      <select [value]="state().filters['role'] ?? ''" (change)="setFilter('role', $event)">
        <option value="">All roles</option>
        <option value="admin">Administrators</option>
        <option value="user">Customers</option>
      </select>
    </div>

    <ng-template #rowActions let-user>
      @if (user.id === auth.userId()) {
        <!-- Disabled rather than hidden: an explanation is more useful than a
             missing button, and the server refuses this anyway. -->
        <button type="button" disabled title="You cannot change your own role">You</button>
      } @else if (user.role === 'admin') {
        <button type="button" (click)="setRole(user, 'user')">Revoke admin</button>
      } @else {
        <button type="button" (click)="setRole(user, 'admin')">Make admin</button>
      }
    </ng-template>

    <app-data-table
      [columns]="columns"
      [rows]="rows()"
      [total]="total()"
      [loading]="loading()"
      [actions]="rowActions"
      [(state)]="state"
      emptyMessage="No accounts match this view."
    />
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService)
  private readonly toast = inject(ToastService)
  private readonly confirm = inject(ConfirmService)
  protected readonly auth = inject(AuthService)

  readonly state = signal<TableState>({ ...initialTableState })
  readonly rows = signal<AdminUser[]>([])
  readonly total = signal(0)
  readonly loading = signal(false)


  private searchDebounce: ReturnType<typeof setTimeout> | null = null

  readonly columns: ColumnDef<AdminUser>[] = [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Name' },
    { key: 'email', header: 'Email' },
    { key: 'role', header: 'Role' },
    { key: 'orders_count', header: 'Orders', align: 'right' },
    {
      key: 'created_at',
      header: 'Joined',
      cell: (row) => (row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'),
    },
  ]

  ngOnInit(): void {
    void this.load()
  }

  async load(): Promise<void> {
    this.loading.set(true)

    try {
      const current = this.state()

      const page = await firstValueFrom(
        this.api.get<Paginated<AdminUser>>('admin/users', {
          page: current.page,
          per_page: current.perPage,
          search: current.filters['search'],
          role: current.filters['role'],
        }),
      )

      this.rows.set(page.data)
      this.total.set(page.total)
    } catch (error) {
      this.toast.error(describeError(error))
    } finally {
      this.loading.set(false)
    }
  }

  setFilter(key: string, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value

    this.state.update((state) => ({
      ...state,
      page: 1,
      filters: { ...state.filters, [key]: value },
    }))

    if (this.searchDebounce) clearTimeout(this.searchDebounce)
    this.searchDebounce = setTimeout(() => void this.load(), key === 'search' ? 300 : 0)
  }

  async setRole(user: AdminUser, role: 'user' | 'admin'): Promise<void> {
    const promoting = role === 'admin'

    const confirmed = await this.confirm.confirm({
      title: promoting
        ? `Make ${user.name} an administrator?`
        : `Revoke admin access for ${user.name}?`,
      message: promoting
        ? `${user.email} will be able to edit the catalogue, read every order, and issue refunds.`
        : `${user.email} will lose access to this CMS and keep only their customer account.`,
      confirmLabel: promoting ? 'Grant access' : 'Revoke access',
      tone: promoting ? 'default' : 'danger',
    })

    if (!confirmed) return

    try {
      await firstValueFrom(this.api.patch(`admin/users/${user.id}/role`, { role }))
      this.toast.success(`${user.name} is now ${promoting ? 'an administrator' : 'a customer'}.`)
      void this.load()
    } catch (error) {
      // The server refuses to demote the last administrator; its message
      // explains why, so it is shown verbatim.
      this.toast.error(describeError(error))
    }
  }
}
