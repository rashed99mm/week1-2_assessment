import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Order } from '../../types'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Button'
import { Card, CardBody, CardHeader } from '../../components/ui/Card'
import { Alert } from '../../components/ui/Alert'
import { formatCurrency, formatDateTime } from '../../lib/format'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<Order | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Order>(`/api/orders/${id}`)
      .then(setOrder)
      .catch((err) => setError(err instanceof Error ? err.message : 'Order not found.'))
  }, [id])

  if (!order && !error) {
    return (
      <div className="flex justify-center py-24 text-accent">
        <Spinner className="size-10" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <Alert tone="error" title="Failed to load order">
        {error ?? 'Order not found.'}
        <Link to="/orders" className="mt-2 inline-block font-medium text-accent-soft">
          ← Back to orders
        </Link>
      </Alert>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/orders" className="text-sm font-medium text-muted hover:text-white">
          ← Orders
        </Link>
        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-white">Order #{order.id}</h1>
        <span className="text-2xl font-bold text-white">{formatCurrency(order.total_amount)}</span>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Details</h2>
        </CardHeader>
        <CardBody className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Row label="Event" value={order.event?.title ?? '—'} />
          <Row label="Ticket type" value={order.ticket_type?.name ?? '—'} />
          <Row label="Customer" value={order.customer_name} />
          <Row label="Email" value={order.customer_email} />
          <Row label="Quantity" value={String(order.quantity)} />
          <Row label="Unit price" value={formatCurrency(order.unit_price)} />
          <Row label="Placed" value={formatDateTime(order.created_at)} />
          <Row label="Status" value={order.status} />
        </CardBody>
      </Card>

      {order.payments && order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-white">Payments</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {order.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-ink px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Badge tone={statusTone(payment.status)}>{payment.status}</Badge>
                  <span className="text-sm text-slate-300">
                    {formatCurrency(payment.amount)} {payment.currency}
                  </span>
                </div>
                <div className="text-right text-xs text-muted/70">
                  <p>{payment.gateway_reference ?? 'no reference'}</p>
                  <p>{formatDateTime(payment.paid_at)}</p>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted/70">{label}</p>
      <p className="mt-0.5 font-medium text-slate-200">{value}</p>
    </div>
  )
}
