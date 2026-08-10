import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, ApiError, formatApiErrors } from '../../lib/api'
import type { Order, Payment } from '../../types'
import { formatCurrency } from '../../lib/format'
import { Alert } from '../../components/ui/Alert'
import { Button } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'

interface CheckoutState {
  event: { id: number; title: string }
  ticketType: { id: number; name: string; price: string }
  seats: string[]
  quantity: number
  totalAmount: number
}

const MOCK_APPROVED_TOKEN = '4242'

export function CheckoutPage() {
  const location = useLocation()
  const state = location.state as CheckoutState | null

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [cardToken, setCardToken] = useState(MOCK_APPROVED_TOKEN)
  const [order, setOrder] = useState<Order | null>(null)
  const [payment, setPayment] = useState<Payment | null>(null)
  const [step, setStep] = useState<'form' | 'paying' | 'done'>('form')
  const [creating, setCreating] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!state) {
    return (
      <Alert tone="info" title="Nothing to check out">
        Select seats for an event first.{' '}
        <Link to="/" className="font-medium text-accent-soft">
          Browse events →
        </Link>
      </Alert>
    )
  }

  const { event, ticketType, seats, quantity, totalAmount } = state

  const createOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setError(null)
    try {
      const created = await api.post<Order>('/api/orders', {
        ticket_type_id: ticketType.id,
        customer_name: customerName,
        customer_email: customerEmail,
        quantity,
      })
      setOrder(created)
      setStep('paying')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.errors ? formatApiErrors(err.errors).join(' · ') : err.message)
      } else {
        setError('Failed to create the order.')
      }
    } finally {
      setCreating(false)
    }
  }

  const payOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!order) return
    setPaying(true)
    setError(null)
    try {
      const paid = await api.post<Payment>(`/api/orders/${order.id}/pay`, { card_token: cardToken })
      setPayment(paid)
      setStep('done')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.errors ? formatApiErrors(err.errors).join(' · ') : err.message)
      } else {
        setError('Payment failed. Please try again.')
      }
      setStep('paying')
    } finally {
      setPaying(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Alert tone="success" title="Payment successful!">
          Your tickets are booked. A confirmation was recorded for order{' '}
          <span className="font-mono font-semibold">#{order?.id}</span>.
        </Alert>
        <Card>
          <CardBody className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted">Event</span>
              <span className="font-medium text-white">{event.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Ticket type</span>
              <span className="font-medium text-white">{ticketType.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Seats</span>
              <span className="font-medium text-white">{seats.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Quantity</span>
              <span className="font-medium text-white">{quantity}</span>
            </div>
            <div className="flex justify-between border-t border-line pt-3">
              <span className="text-muted">Total paid</span>
              <span className="text-lg font-bold text-white">{formatCurrency(totalAmount)}</span>
            </div>
            {payment && (
              <div className="flex justify-between">
                <span className="text-muted">Gateway reference</span>
                <span className="font-mono text-sm text-slate-300">{payment.gateway_reference}</span>
              </div>
            )}
          </CardBody>
        </Card>
        <div className="flex gap-3">
          <Link to="/orders" className="flex-1">
            <Button className="w-full" size="lg">
              View my orders
            </Button>
          </Link>
          <Link to="/" className="flex-1">
            <Button variant="secondary" className="w-full" size="lg">
              Browse more events
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Checkout</h1>
        <p className="mt-1 text-sm text-muted">
          {event.title} · {ticketType.name}
        </p>
      </div>

      {error && (
        <Alert tone="error" title={step === 'paying' ? 'Payment declined' : 'Checkout error'}>
          {error}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">
            {step === 'form' ? 'Order details' : 'Payment'}
          </h2>
        </CardHeader>
        <CardBody>
          {step === 'form' ? (
            <form onSubmit={createOrder} className="space-y-4">
              <div className="rounded-xl border border-line bg-ink p-4 text-sm text-slate-300">
                <div className="flex justify-between py-1">
                  <span>Seats</span>
                  <span className="font-medium text-white">{seats.join(', ')}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Quantity</span>
                  <span className="font-medium text-white">{quantity}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>Unit price</span>
                  <span className="font-medium text-white">
                    {formatCurrency(ticketType.price)}
                  </span>
                </div>
                <div className="mt-2 flex justify-between border-t border-line pt-2">
                  <span className="font-medium text-white">Total</span>
                  <span className="text-lg font-bold text-white">
                    {formatCurrency(totalAmount)}
                  </span>
                </div>
              </div>
              <Input
                label="Name on order"
                name="customer_name"
                required
                placeholder="Jane Doe"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
              <Input
                label="Email"
                name="customer_email"
                type="email"
                required
                placeholder="you@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
              />
              <Button type="submit" className="w-full" size="lg" loading={creating}>
                Continue to payment
              </Button>
            </form>
          ) : (
            <form onSubmit={payOrder} className="space-y-4">
              <Alert tone="info">
                Mock gateway: payments succeed when the card token starts with{' '}
                <span className="font-mono">4242</span> and the amount is ≤ $1,000.
              </Alert>
              <Input
                label="Card token"
                name="card_token"
                required
                placeholder="4242424242424242"
                value={cardToken}
                onChange={(e) => setCardToken(e.target.value)}
              />
              <div className="rounded-xl border border-line bg-ink p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Order</span>
                  <span className="font-medium text-white">#{order?.id}</span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span className="text-muted">Amount due</span>
                  <span className="font-bold text-white">{formatCurrency(totalAmount)}</span>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setOrder(null)
                    setStep('form')
                  }}
                >
                  ← Back
                </Button>
                <Button type="submit" className="flex-1" size="lg" loading={paying}>
                  Pay {formatCurrency(totalAmount)}
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
