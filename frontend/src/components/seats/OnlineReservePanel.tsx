import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Event, TicketType } from '../../types'
import { formatCurrency } from '../../lib/format'
import { Button } from '../ui/Button'
import { Select } from '../ui/Input'

interface OnlineReservePanelProps {
  event: Event
  ticketTypes: TicketType[]
  user: { name: string } | null
  onContinue: (ticketType: TicketType, quantity: number) => void
}

export function OnlineReservePanel({ event, ticketTypes, user, onContinue }: OnlineReservePanelProps) {
  const [ticketTypeId, setTicketTypeId] = useState<number | ''>(
    ticketTypes.length > 0 ? ticketTypes[0].id : '',
  )
  const [quantity, setQuantity] = useState(1)

  const ticketType = ticketTypes.find((t) => t.id === ticketTypeId) ?? null
  const total = ticketType ? Number(ticketType.price) * quantity : 0
  const maxQty = ticketType ? ticketType.quantity : 1

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="border-b border-line pb-4">
        <p className="text-sm text-muted">Reserve your spot</p>
        <h2 className="mt-1 text-lg font-semibold text-white">{event.title}</h2>
        <p className="mt-1 text-xs text-muted">
          This is an online event — no seat map needed. Pick a ticket type and quantity.
        </p>
      </div>

      <div className="space-y-4 py-4">
        <Select
          label="Ticket type"
          value={ticketTypeId}
          onChange={(e) => setTicketTypeId(Number(e.target.value))}
        >
          {ticketTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {formatCurrency(t.price)}
            </option>
          ))}
        </Select>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-200">Quantity</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex size-9 items-center justify-center rounded-full border border-muted/40 text-muted transition-colors hover:border-white hover:text-white"
            >
              −
            </button>
            <span className="w-8 text-center text-lg font-semibold text-white">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              className="flex size-9 items-center justify-center rounded-full border border-muted/40 text-muted transition-colors hover:border-white hover:text-white"
            >
              +
            </button>
            <span className="ml-2 text-xs text-muted">of {maxQty} available</span>
          </div>
        </div>

        <div className="flex justify-between border-t border-line pt-3">
          <span className="text-sm font-medium text-white">Total</span>
          <span className="text-lg font-bold text-accent">{formatCurrency(total)}</span>
        </div>
      </div>

      {user ? (
        <Button
          className="w-full"
          size="lg"
          disabled={!ticketType}
          onClick={() => ticketType && onContinue(ticketType, quantity)}
        >
          Continue to Checkout
        </Button>
      ) : (
        <div className="space-y-2">
          <Link to={`/register?redirect=/events/${event.id}/seats`} className="block">
            <Button className="w-full" size="lg">
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
