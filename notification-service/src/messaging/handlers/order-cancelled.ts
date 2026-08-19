import { createNotification } from '../../services/notification.service.js'
import { orderCancelledSchema, REASON_RESERVATION_EXPIRED, type Envelope } from '../envelope.js'

/**
 * Record a cancellation.
 *
 * Deliberately sends no email for an expiry. A customer who walked away from a
 * checkout does not want a message telling them so, and the reservation
 * lapsing is a normal outcome rather than an incident.
 *
 * An administrator cancelling an order is different — the customer expects to
 * hear about that — but that path is not in the MVP, so it is a notification
 * only.
 */
export async function handleOrderCancelled(envelope: Envelope): Promise<void> {
  const payload = orderCancelledSchema.parse(envelope.payload)
  const expired = payload.reason === REASON_RESERVATION_EXPIRED

  if (payload.userId !== null && !expired) {
    await createNotification({
      userId: payload.userId,
      audience: 'user',
      type: envelope.type,
      title: 'Order cancelled',
      body: `Order #${payload.orderId} was cancelled.`,
      data: { orderId: payload.orderId, reason: payload.reason },
      sourceEventId: envelope.id,
    })
  }

  await createNotification({
    userId: null,
    audience: 'admin',
    type: envelope.type,
    title: expired ? 'Reservation expired' : 'Order cancelled',
    body: expired
      ? `Order #${payload.orderId} expired; ${payload.quantity} ticket(s) returned to stock.`
      : `Order #${payload.orderId} was cancelled${payload.reason ? `: ${payload.reason}` : ''}.`,
    data: { orderId: payload.orderId, reason: payload.reason },
    sourceEventId: envelope.id,
  })
}
