import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { ApiService } from '../../core/api/api.service'
import type { Paginated } from '../../core/api/api-response.model'
import type { Order } from '../../models'

export interface OrderFilters {
  page: number
  per_page: number
  status?: string
  event_id?: string
  search?: string
  date_from?: string
  date_to?: string
}

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly api = inject(ApiService)

  list(filters: OrderFilters) {
    return this.api.get<Paginated<Order>>('admin/orders', {
      page: filters.page,
      per_page: filters.per_page,
      'filters[status]': filters.status,
      'filters[event_id]': filters.event_id,
      'filters[search]': filters.search,
      'filters[date_from]': filters.date_from,
      'filters[date_to]': filters.date_to,
    })
  }

  show(id: number) {
    return this.api.get<Order>(`admin/orders/${id}`)
  }

  cancel(id: number, reason?: string): Promise<Order> {
    return firstValueFrom(
      this.api.patch<Order>(`admin/orders/${id}/status`, { status: 'cancelled', reason }),
    )
  }

  /**
   * Refund an order.
   *
   * Calls the payment gateway before touching local state, so a gateway
   * refusal leaves the order paid rather than telling the customer their money
   * is on the way when it is not.
   */
  refund(id: number, reason?: string): Promise<Order> {
    return firstValueFrom(this.api.post<Order>(`admin/orders/${id}/refund`, { reason }))
  }
}
