import { queueEmail } from '../../services/email.service.js'
import { createNotification } from '../../services/notification.service.js'
import { orderRefundedSchema, type Envelope } from '../envelope.js'

/** Confirm a refund to the customer and record it on the admin feed. */
export async function handleOrderRefunded(envelope: Envelope): Promise<void> {
  const payload = orderRefundedSchema.parse(envelope.payload)

  await queueEmail({
    to: payload.customerEmail,
    subject: `Refund issued for order #${payload.orderId}`,
    template: 'refund-confirmation',
    context: {
      customerName: payload.customerName,
      orderId: payload.orderId,
      eventTitle: payload.eventTitle,
      refundedAmount: payload.refundedAmount,
      currency: payload.currency,
      reason: payload.reason,
      gatewayReference: payload.gatewayReference,
    },
    sourceEventId: envelope.id,
  })

  if (payload.userId !== null) {
    await createNotification({
      userId: payload.userId,
      audience: 'user',
      type: envelope.type,
      title: 'Refund issued',
      body: `Order #${payload.orderId} has been refunded.`,
      data: { orderId: payload.orderId, amount: payload.refundedAmount },
      sourceEventId: envelope.id,
    })
  }

  await createNotification({
    userId: null,
    audience: 'admin',
    type: envelope.type,
    title: 'Order refunded',
    body: `Order #${payload.orderId} refunded (${payload.currency} ${payload.refundedAmount}).`,
    data: { orderId: payload.orderId, amount: payload.refundedAmount },
    sourceEventId: envelope.id,
  })
}
