import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Availability, Event, TicketType } from '../../types'
import { buildVenuePlan } from '../../lib/venueLayout'
import { formatCurrency, formatDateTime } from '../../lib/format'
import { EventCover } from '../../components/events/EventCover'
import { SaveButton } from '../../components/events/SaveButton'
import { Alert } from '../../components/ui/Alert'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Button, Spinner } from '../../components/ui/Button'

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<Event | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [eventData, types, availabilityData] = await Promise.all([
        api.get<Event>(`/api/events/${id}`),
        api.get<TicketType[]>(`/api/ticket-types?event_id=${id}`),
        api.get<Availability>(`/api/events/${id}/availability`),
      ])
      setEvent(eventData)
      setTicketTypes(types)
      setAvailability(availabilityData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load event.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const soldCountByType = useMemo(() => {
    const map: Record<number, number> = {}
    if (availability) {
      for (const type of availability.ticket_types) {
        map[type.ticket_type_id] = type.sold
      }
    }
    return map
  }, [availability])

  const plan = useMemo(() => {
    if (!event) return null
    return buildVenuePlan(event, ticketTypes, soldCountByType)
  }, [event, ticketTypes, soldCountByType])

  const fromPrice = ticketTypes.reduce<number | null>((lowest, type) => {
    const price = Number(type.price)
    return lowest === null || price < lowest ? price : lowest
  }, null)

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-accent">
        <Spinner className="size-10" />
      </div>
    )
  }

  if (error || !event) {
    return (
      <Alert tone="error" title="Failed to load event">
        {error ?? 'Event not found.'}
        <Link to="/events" className="mt-2 inline-block font-medium text-accent-soft">
          ← Back to events
        </Link>
      </Alert>
    )
  }

  const isOnline = event.event_type?.is_online ?? false

  return (
    <div className="space-y-8">
      <Link to="/events" className="text-sm font-medium text-muted hover:text-white">
        ← All events
      </Link>

      <div className="overflow-hidden rounded-3xl border border-line bg-ink">
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="relative min-h-56">
            <EventCover event={event} priority />
            <SaveButton eventId={event.id} className="absolute right-4 top-4 z-10" />
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-10">
            <div className="flex flex-wrap items-center gap-2">
              {event.event_type && <Badge tone="muted">{event.event_type.name}</Badge>}
              <Badge tone={statusTone(event.status)}>{event.status}</Badge>
              {!isOnline && (
                <Badge tone="accent">{plan?.totalAvailable ?? 0} seats open</Badge>
              )}
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {event.title}
            </h1>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm text-muted">
              <span>📍 {event.venue ?? 'Venue TBA'}</span>
              <span>🗓 {formatDateTime(event.starts_at)}</span>
              {event.ends_at && <span>→ {formatDateTime(event.ends_at)}</span>}
            </div>
            {event.description && (
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300">
                {event.description}
              </p>
            )}
            <div className="mt-8 flex flex-wrap items-center gap-6">
              {fromPrice !== null && (
                <p className="text-sm text-muted">
                  <span className="text-2xl font-bold text-white">{formatCurrency(fromPrice)}</span>{' '}
                  from
                </p>
              )}
              <Link to={`/events/${event.id}/seats`}>
                <Button size="lg">
                  {isOnline ? 'Reserve your spot' : 'Select seats'}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {ticketTypes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ticketTypes.map((type) => (
            <div key={type.id} className="rounded-2xl border border-line bg-panel p-5">
              <p className="font-semibold text-white">{type.name}</p>
              <p className="mt-1 text-sm text-muted">
                {formatCurrency(type.price)} · {type.quantity - (soldCountByType[type.id] ?? 0)} of{' '}
                {type.quantity} left
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
