import { Link } from 'react-router-dom'
import type { Event } from '../../types'
import type { Seat, SeatSection } from '../../lib/venueLayout'
import { formatCurrency, formatDateTime } from '../../lib/format'
import { Button } from '../ui/Button'

interface SummaryPanelProps {
  event: Event
  section: SeatSection | null
  seats: Seat[]
  total: number
  user: { name: string } | null
  onContinue: () => void
}

export function SummaryPanel({ event, section, seats, total, user, onContinue }: SummaryPanelProps) {
  const hasSelection = seats.length > 0

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="border-b border-line pb-4">
        <p className="text-sm text-muted">Your selection</p>
        <h2 className="mt-1 text-lg font-semibold leading-snug text-white">{event.title}</h2>
        <p className="mt-1 text-xs text-muted">{formatDateTime(event.starts_at)}</p>
      </div>

      {!hasSelection ? (
        <p className="py-6 text-sm leading-relaxed text-muted">
          Tap seats on the map to reserve them. You can pick seats from one ticket
          type per order.
        </p>
      ) : (
        <div className="space-y-4 py-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-white">{section?.ticketType.name}</p>
            <p className="text-xs leading-relaxed text-muted">
              {seats.map((seat) => seat.label).join(', ')}
            </p>
          </div>
          <div className="space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between text-muted">
              <span>
                {seats.length} ticket{seats.length > 1 ? 's' : ''} × {formatCurrency(Number(section?.ticketType.price) || 0)}
              </span>
              <span className="text-white">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <span className="font-medium text-white">Total</span>
              <span className="text-lg font-bold text-accent">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      )}

      {user ? (
        <Button
          className="w-full"
          size="lg"
          disabled={!hasSelection}
          onClick={onContinue}
        >
          Continue to Checkout
        </Button>
      ) : (
        <div className="space-y-2">
          <Link to={`/register?redirect=/events/${event.id}/seats`} className="block">
            <Button className="w-full" size="lg" disabled={!hasSelection}>
              Create account to book
            </Button>
          </Link>
          <p className="text-center text-xs text-muted">
            Already have an account?{' '}
            <Link
              to={`/login?redirect=/events/${event.id}/seats`}
              className="font-medium text-accent-soft hover:text-accent"
            >
              Sign in
            </Link>
          </p>
        </div>
      )}
    </div>
  )
}
