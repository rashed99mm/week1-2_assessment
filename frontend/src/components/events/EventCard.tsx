import { Link } from 'react-router-dom'
import type { Event, TicketType } from '../../types'
import { Badge, statusTone } from '../ui/Badge'
import { Card } from '../ui/Card'
import { EventCover } from './EventCover'
import { SaveButton } from './SaveButton'
import { formatCurrency, formatDateTime } from '../../lib/format'

interface EventCardProps {
  event: Event
  ticketTypes: TicketType[]
}

export function EventCard({ event, ticketTypes }: EventCardProps) {
  const types = ticketTypes.filter((type) => type.event_id === event.id)
  const fromPrice = types.reduce<number | null>((lowest, type) => {
    const price = Number(type.price)
    return lowest === null || price < lowest ? price : lowest
  }, null)
  const seats = types.reduce((sum, type) => sum + type.quantity, 0)

  return (
    <Link to={`/events/${event.id}`} className="group block">
      <Card className="h-full overflow-hidden group-hover:-translate-y-1 group-hover:border-white/18 group-hover:shadow-[0_12px_28px_-12px_rgb(0_0_0/0.6)]">
        <div className="relative aspect-[16/10]">
          <EventCover
            event={event}
            className="transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <SaveButton eventId={event.id} className="absolute right-3 top-3 z-10" />
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
            {event.event_type ? (
              <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
                {event.event_type.name}
              </span>
            ) : (
              <span className="rounded-full border border-white/20 bg-black/45 px-2.5 py-0.5 text-xs font-medium text-muted backdrop-blur-sm">
                Uncategorized
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 p-5">
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(event.status)}>{event.status}</Badge>
            {event.event_type?.is_online && <Badge tone="accent">online</Badge>}
          </div>
          <h3 className="text-lg font-semibold text-white group-hover:text-accent-soft">
            {event.title}
          </h3>
          <p className="text-sm text-muted">{event.venue ?? 'Venue TBA'}</p>
          <p className="text-sm text-muted/70">{formatDateTime(event.starts_at)}</p>
          <div className="mt-auto pt-2">
            {fromPrice !== null ? (
              <p className="text-sm text-muted">
                <span className="text-lg font-bold text-white">{formatCurrency(fromPrice)}</span>{' '}
                from · {seats} seats
              </p>
            ) : (
              <p className="text-sm text-muted">No ticket types yet</p>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
