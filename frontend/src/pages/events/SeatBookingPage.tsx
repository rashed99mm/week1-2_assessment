import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Availability, Event, TicketType } from '../../types'
import { useAuth } from '../../context/AuthContext'
import { buildVenuePlan, type Seat as VenueSeat } from '../../lib/venueLayout'
import { formatCurrency, formatDateTime } from '../../lib/format'
import { SeatViewer } from '../../components/seats/SeatViewer'
import { FilterRail, defaultFilters, type SeatFilters } from '../../components/seats/FilterRail'
import { SummaryPanel } from '../../components/seats/SummaryPanel'
import { OnlineReservePanel } from '../../components/seats/OnlineReservePanel'
import { Alert } from '../../components/ui/Alert'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Button'
import { Button } from '../../components/ui/Button'

export function SeatBookingPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [event, setEvent] = useState<Event | null>(null)
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([])
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [filters, setFilters] = useState<SeatFilters | null>(null)
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

  // Deliberately independent of `selectedIds`: the plan is expensive to build
  // and selection is handed to the view components directly, so clicking a seat
  // never regenerates the layout.
  const plan = useMemo(() => {
    if (!event) return null
    return buildVenuePlan(event, ticketTypes, soldCountByType)
  }, [event, ticketTypes, soldCountByType])

  useEffect(() => {
    if (plan && !filters) {
      setFilters(defaultFilters(plan))
    }
  }, [plan, filters])

  const priceOf = useCallback(
    (ticketTypeId: number): number => {
      const type = ticketTypes.find((t) => t.id === ticketTypeId)
      return type ? Number(type.price) : 0
    },
    [ticketTypes],
  )

  // The price fields update on every keystroke and `dimmedIds` drives a full
  // re-upload of the 3D instance colour buffer, so settle the filters first.
  const [appliedFilters, setAppliedFilters] = useState<SeatFilters | null>(null)
  useEffect(() => {
    if (!filters) return
    const timer = window.setTimeout(() => setAppliedFilters(filters), 150)
    return () => window.clearTimeout(timer)
  }, [filters])

  const dimmedIds = useMemo(() => {
    if (!plan || !appliedFilters) return new Set<string>()
    const set = new Set<string>()
    for (const seat of plan.seats) {
      let dim = false
      if (appliedFilters.tier !== 'all' && seat.tier !== appliedFilters.tier) dim = true
      const price = priceOf(seat.ticketTypeId)
      if (price < appliedFilters.price[0] || price > appliedFilters.price[1]) dim = true
      if (appliedFilters.accessibleOnly && !seat.isAccessible) dim = true
      if (dim) set.add(seat.id)
    }
    return set
  }, [plan, appliedFilters, priceOf])

  const selectedSeats = useMemo(
    () => (plan ? plan.seats.filter((s) => selectedIds.includes(s.id)) : []),
    [plan, selectedIds],
  )

  const selectedSection = useMemo(() => {
    if (!plan || selectedSeats.length === 0) return null
    const ticketTypeId = selectedSeats[0].ticketTypeId
    return plan.sections.find((s) => s.ticketType.id === ticketTypeId) ?? null
  }, [plan, selectedSeats])

  const total = selectedSection
    ? Number(selectedSection.ticketType.price) * selectedSeats.length
    : 0

  const handleToggle = useCallback(
    (seat: VenueSeat) => {
      setSelectedIds((current) => {
        if (current.includes(seat.id)) {
          return current.filter((candidate) => candidate !== seat.id)
        }
        return [
          ...current.filter((c) => !c.startsWith(`${seat.ticketTypeId}-`)),
          seat.id,
        ]
      })
    },
    [],
  )

  const proceedToCheckout = () => {
    if (!event || !selectedSection) return
    navigate('/checkout', {
      state: {
        event: { id: event.id, title: event.title },
        ticketType: {
          id: selectedSection.ticketType.id,
          name: selectedSection.ticketType.name,
          price: selectedSection.ticketType.price,
        },
        seats: selectedSeats.map((seat) => seat.label),
        quantity: selectedSeats.length,
        totalAmount: total,
      },
    })
  }

  const proceedOnline = (ticketType: TicketType, quantity: number) => {
    if (!event) return
    navigate('/checkout', {
      state: {
        event: { id: event.id, title: event.title },
        ticketType: { id: ticketType.id, name: ticketType.name, price: ticketType.price },
        seats: [],
        quantity,
        totalAmount: Number(ticketType.price) * quantity,
      },
    })
  }

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
    <div className="space-y-6 pb-28 lg:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to={`/events/${event.id}`} className="text-sm font-medium text-muted hover:text-white">
          ← Back to event
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {event.event_type && <Badge tone="muted">{event.event_type.name}</Badge>}
          <Badge tone={statusTone(event.status)}>{event.status}</Badge>
          {!isOnline && (
            <Badge tone="accent">{plan?.totalAvailable ?? 0} seats open</Badge>
          )}
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {event.title}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {event.venue ?? 'Venue TBA'} · {formatDateTime(event.starts_at)}
        </p>
      </div>

      {ticketTypes.length === 0 ? (
        <Alert tone="info" title="No ticket types">
          This event has no ticket types yet. Add some from the admin panel.
        </Alert>
      ) : isOnline ? (
        <div className="mx-auto max-w-xl">
          <OnlineReservePanel
            event={event}
            ticketTypes={ticketTypes}
            user={user}
            onContinue={proceedOnline}
          />
        </div>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[240px_1fr_320px]">
            <aside className="hidden lg:block">
              {plan && filters && (
                <FilterRail plan={plan} filters={filters} onChange={setFilters} />
              )}
            </aside>

            <div className="min-w-0">
              {plan && (
                <SeatViewer
                  event={event}
                  plan={plan}
                  selectedIds={selectedIds}
                  dimmedIds={dimmedIds}
                  onToggleSeat={handleToggle}
                  priceOf={priceOf}
                />
              )}
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-20">
                {plan && (
                  <SummaryPanel
                    event={event}
                    section={selectedSection}
                    seats={selectedSeats}
                    total={total}
                    user={user}
                    onContinue={proceedToCheckout}
                  />
                )}
              </div>
            </aside>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden">
            <div className="border-t border-line bg-panel/95 px-4 pb-5 pt-3 backdrop-blur-md">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
              {selectedSeats.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted">
                  Tap seats on the map to reserve them.
                </p>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {selectedSection?.ticketType.name}
                    </p>
                    <p className="text-xs text-muted">
                      {selectedSeats.length} ticket{selectedSeats.length > 1 ? 's' : ''} ·{' '}
                      {formatCurrency(total)}
                    </p>
                  </div>
                  {user ? (
                    <Button size="lg" onClick={proceedToCheckout}>
                      Continue
                    </Button>
                  ) : (
                    <Link to={`/register?redirect=/events/${event.id}/seats`}>
                      <Button size="lg">Register to book</Button>
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
