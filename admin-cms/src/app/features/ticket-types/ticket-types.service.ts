import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { ApiService } from '../../core/api/api.service'
import type { Paginated } from '../../core/api/api-response.model'
import type { TicketEvent, TicketType } from '../../models'

export interface TicketTypeFormValue {
  event_id: string
  name: string
  price: string
  quantity: string
}

@Injectable({ providedIn: 'root' })
export class TicketTypesService {
  private readonly api = inject(ApiService)

  /**
   * List ticket types.
   *
   * Returns a flat array, not a paginated envelope — this endpoint is a lookup
   * bounded by however many tiers an event has, and paginating it would break
   * every consumer to solve a problem that does not exist.
   */
  list(eventId?: string) {
    return this.api.get<TicketType[]>('ticket-types', { event_id: eventId })
  }

  events() {
    return this.api.get<Paginated<TicketEvent>>('events', { per_page: 100 })
  }

  create(value: TicketTypeFormValue): Promise<TicketType> {
    return firstValueFrom(this.api.post<TicketType>('ticket-types', this.toPayload(value)))
  }

  update(id: number, value: TicketTypeFormValue): Promise<TicketType> {
    // A plain JSON PUT. Unlike events, there is no file here, so no need for
    // the multipart method-spoofing dance.
    return firstValueFrom(this.api.put<TicketType>(`ticket-types/${id}`, this.toPayload(value)))
  }

  destroy(id: number): Promise<unknown> {
    return firstValueFrom(this.api.delete(`ticket-types/${id}`))
  }

  private toPayload(value: TicketTypeFormValue) {
    return {
      event_id: Number(value.event_id),
      name: value.name,
      // Coerced because the number input yields a string, and the API
      // validates the type.
      price: Number(value.price),
      quantity: Number(value.quantity),
    }
  }
}
