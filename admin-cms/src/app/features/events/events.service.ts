import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { ApiService } from '../../core/api/api.service'
import type { Paginated } from '../../core/api/api-response.model'
import type { EventStatus, EventType, TicketEvent } from '../../models'
import { appendIfSet, withMethodOverride } from '../../shared/util/form-data'
import { fromLocalInputValue } from '../../shared/util/datetime'

export interface EventFormValue {
  title: string
  description: string
  venue: string
  event_type_id: string
  starts_at: string
  ends_at: string
  total_tickets: string
  status: EventStatus
}

@Injectable({ providedIn: 'root' })
export class EventsService {
  private readonly api = inject(ApiService)

  list(params: { page: number; per_page: number; search?: string; status?: string }) {
    return this.api.get<Paginated<TicketEvent>>('events', {
      page: params.page,
      per_page: params.per_page,
      // Nested filter keys, matching what EventRepository allow-lists.
      'filters[search]': params.search,
      'filters[status]': params.status,
    })
  }

  eventTypes() {
    return this.api.get<EventType[]>('event-types')
  }

  create(value: EventFormValue, cover: File | null): Promise<TicketEvent> {
    return firstValueFrom(this.api.postForm<TicketEvent>('events', this.toForm(value, cover)))
  }

  /**
   * Update an event.
   *
   * POST with a spoofed `_method=PUT`, never a real PUT. PHP does not populate
   * `$_FILES` on PUT, so a genuine PUT silently discards the cover image while
   * returning 200 — the update appears to work and the picture never changes.
   */
  update(
    id: number,
    value: EventFormValue,
    cover: File | null,
    removeCover: boolean,
  ): Promise<TicketEvent> {
    const form = this.toForm(value, cover)

    if (removeCover) form.append('remove_cover', '1')

    return firstValueFrom(
      this.api.postForm<TicketEvent>(`events/${id}`, withMethodOverride(form, 'PUT')),
    )
  }

  destroy(id: number): Promise<unknown> {
    return firstValueFrom(this.api.delete(`events/${id}`))
  }

  /**
   * Build the multipart body.
   *
   * Empty fields are omitted rather than sent as "": Laravel's `nullable` rule
   * short-circuits on a real null but not on an empty string, so an untouched
   * optional field would be validated as if the user had typed something.
   */
  private toForm(value: EventFormValue, cover: File | null): FormData {
    const form = new FormData()

    appendIfSet(form, 'title', value.title)
    appendIfSet(form, 'description', value.description)
    appendIfSet(form, 'venue', value.venue)
    appendIfSet(form, 'event_type_id', value.event_type_id)
    appendIfSet(form, 'total_tickets', value.total_tickets)
    appendIfSet(form, 'status', value.status)

    // datetime-local gives local wall-clock time; the API expects ISO in UTC.
    appendIfSet(form, 'starts_at', fromLocalInputValue(value.starts_at))
    appendIfSet(form, 'ends_at', fromLocalInputValue(value.ends_at))

    if (cover) form.append('cover_image', cover)

    return form
  }
}
