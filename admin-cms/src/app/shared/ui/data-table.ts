import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  input,
  model,
  output,
  type TemplateRef,
} from '@angular/core'

/** One column of a data table. */
export interface ColumnDef<T> {
  key: string
  header: string
  sortable?: boolean
  align?: 'left' | 'right'
  /** Render a cell. Defaults to the value at `key`. */
  cell?: (row: T) => string
}

/** Everything that decides which page of which rows is shown. */
export interface TableState {
  page: number
  perPage: number
  sort?: string
  direction?: 'asc' | 'desc'
  filters: Record<string, string>
}

export const initialTableState: TableState = {
  page: 1,
  perPage: 15,
  filters: {},
}

/**
 * A server-driven table.
 *
 * Paging, sorting and filtering are all expressed as one `state` object that
 * the feature's data source is keyed on. Doing any of it client-side would
 * mean loading every order to show fifteen of them, and would quietly disagree
 * with the server about what "page 2" means.
 */
@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './data-table.css',
  template: `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            @for (column of columns(); track column.key) {
              <th
                [class.sortable]="column.sortable"
                [class.right]="column.align === 'right'"
                (click)="column.sortable && toggleSort(column.key)"
              >
                {{ column.header }}
                @if (column.sortable && state().sort === column.key) {
                  <span class="caret">{{ state().direction === 'asc' ? '▲' : '▼' }}</span>
                }
              </th>
            }
            @if (actions()) {
              <th class="right">Actions</th>
            }
          </tr>
        </thead>

        <tbody>
          @if (loading()) {
            <tr>
              <td [attr.colspan]="columnCount()" class="state">Loading…</td>
            </tr>
          } @else if (rows().length === 0) {
            <tr>
              <td [attr.colspan]="columnCount()" class="state">{{ emptyMessage() }}</td>
            </tr>
          } @else {
            @for (row of rows(); track rowId(row)) {
              <tr>
                @for (column of columns(); track column.key) {
                  <td [class.right]="column.align === 'right'">{{ render(row, column) }}</td>
                }
                @if (actions(); as template) {
                  <td class="right actions">
                    <!-- A template rather than ng-content, because the buttons
                         need the row they belong to. ng-content projects once
                         for the whole component and cannot vary per row. -->
                    <ng-container
                      [ngTemplateOutlet]="template"
                      [ngTemplateOutletContext]="{ $implicit: row }"
                    />
                  </td>
                }
              </tr>
            }
          }
        </tbody>
      </table>
    </div>

    @if (total() > state().perPage) {
      <nav class="pager">
        <button type="button" [disabled]="state().page <= 1" (click)="goTo(state().page - 1)">
          Previous
        </button>
        <span>Page {{ state().page }} of {{ lastPage() }} · {{ total() }} total</span>
        <button
          type="button"
          [disabled]="state().page >= lastPage()"
          (click)="goTo(state().page + 1)"
        >
          Next
        </button>
      </nav>
    }
  `,
})
export class DataTable<T extends { id?: number | string }> {
  readonly columns = input.required<ColumnDef<T>[]>()
  readonly rows = input.required<T[]>()
  readonly total = input(0)
  readonly loading = input(false)
  /** Per-row action buttons. Receives the row as $implicit. */
  readonly actions = input<TemplateRef<{ $implicit: T }> | null>(null)
  readonly emptyMessage = input('Nothing to show yet.')

  /** Two-way: the feature reacts to changes and reloads. */
  readonly state = model.required<TableState>()

  readonly rowSelected = output<T>()

  columnCount(): number {
    return this.columns().length + (this.actions() ? 1 : 0)
  }

  lastPage(): number {
    return Math.max(1, Math.ceil(this.total() / this.state().perPage))
  }

  render(row: T, column: ColumnDef<T>): string {
    if (column.cell) return column.cell(row)

    const value = (row as Record<string, unknown>)[column.key]

    return value === null || value === undefined ? '—' : String(value)
  }

  rowId(row: T): string {
    return String(row.id ?? JSON.stringify(row))
  }

  goTo(page: number): void {
    this.state.update((state) => ({ ...state, page }))
  }

  /**
   * Cycle a column between ascending and descending.
   *
   * Sorting resets to page 1: staying on page 4 of a reordered list shows a
   * slice of rows the user has no reason to expect.
   */
  toggleSort(key: string): void {
    this.state.update((state) => ({
      ...state,
      page: 1,
      sort: key,
      direction: state.sort === key && state.direction === 'asc' ? 'desc' : 'asc',
    }))
  }
}
