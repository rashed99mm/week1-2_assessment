import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import type { Order } from '../../types'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/Button'
import { Card, CardBody } from '../../components/ui/Card'
import { Alert } from '../../components/ui/Alert'
import { formatCurrency, formatDateTime } from '../../lib/format'

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Order[]>('/api/orders')
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load orders.'))
  }, [])

  if (!orders && !error) {
    return (
      <div className="flex justify-center py-24 text-accent">
        <Spinner className="size-10" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert tone="error" title="Failed to load orders">
        {error}
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-white">Orders</h1>

      {orders && orders.length === 0 && (
        <Alert tone="info" title="No orders yet">
          Book a ticket to see your orders here.{' '}
          <Link to="/" className="font-medium text-accent-soft">
            Browse events →
          </Link>
        </Alert>
      )}

      <div className="space-y-3">
        {orders?.map((order) => (
          <Link key={order.id} to={`/orders/${order.id}`} className="block">
            <Card className="transition-colors hover:border-accent/40">
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted/70">#{order.id}</span>
                    <Badge tone={statusTone(order.status)}>{order.status}</Badge>
                  </div>
                  <p className="mt-1 truncate font-semibold text-white">
                    {order.event?.title ?? 'Event'}
                  </p>
                  <p className="text-sm text-muted">
                    {order.ticket_type?.name} · {order.quantity} ticket{order.quantity > 1 ? 's' : ''}{' '}
                    · {order.customer_name}
                  </p>
                  <p className="text-xs text-muted/70">{formatDateTime(order.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">{formatCurrency(order.total_amount)}</p>
                  <p className="text-xs text-muted/70">
                    {formatCurrency(order.unit_price)} / ticket
                  </p>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
