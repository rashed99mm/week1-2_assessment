import QRCode from 'qrcode'
import { config } from '../../core/config.js'
import { queueEmail } from '../../services/email.service.js'
import { createNotification } from '../../services/notification.service.js'
import { realtime } from '../../realtime/socket.js'
import { orderPaidSchema, type Envelope } from '../envelope.js'

/**
 * Send the receipt and the e-ticket, and tell the dashboard a sale happened.
 *
 * The revenue-bearing event, so this is the one whose failure is most visible
 * to a customer: they have paid and are waiting for a ticket.
 */
export async function handleOrderPaid(envelope: Envelope): Promise<void> {
  const payload = orderPaidSchema.parse(envelope.payload)

  const qr = await ticketQrCode(payload.orderId, payload.gatewayReference)

  await queueEmail({
    to: payload.customerEmail,
    subject: `Your tickets for ${payload.eventTitle}`,
    template: 'e-ticket',
    context: {
      customerName: payload.customerName,
      orderId: payload.orderId,
      eventTitle: payload.eventTitle,
      quantity: payload.quantity,
      totalAmount: payload.totalAmount,
      currency: payload.currency,
      gatewayReference: payload.gatewayReference,
      paidAt: payload.paidAt,
      orderUrl: `${config.APP_URL}/orders/${payload.orderId}`,
    },
    // Referenced from the template as <img src="cid:ticket-qr">. A data: URI
    // would be simpler but Gmail strips those, so the ticket would arrive with
    // a broken image where its barcode should be.
    attachments: [{ filename: 'ticket.png', cid: 'ticket-qr', content: qr }],
    sourceEventId: envelope.id,
  })

  if (payload.userId !== null) {
    await createNotification({
      userId: payload.userId,
      audience: 'user',
      type: envelope.type,
      title: 'Payment confirmed',
      body: `Your tickets for ${payload.eventTitle} are confirmed.`,
      data: { orderId: payload.orderId, eventId: payload.eventId },
      sourceEventId: envelope.id,
    })
  }

  await createNotification({
    userId: null,
    audience: 'admin',
    type: envelope.type,
    title: 'Sale',
    body: `${payload.quantity} ticket(s) for ${payload.eventTitle} — ${payload.currency} ${payload.totalAmount}.`,
    data: {
      orderId: payload.orderId,
      eventId: payload.eventId,
      amount: payload.totalAmount,
    },
    sourceEventId: envelope.id,
  })

  // Live dashboard update, separate from the notification so the CMS can show
  // a revenue counter ticking without re-fetching.
  realtime.broadcastToAdmins('order:paid', {
    orderId: payload.orderId,
    eventId: payload.eventId,
    eventTitle: payload.eventTitle,
    quantity: payload.quantity,
    totalAmount: payload.totalAmount,
    currency: payload.currency,
    paidAt: payload.paidAt,
  })
}

/**
 * Render the order reference as a base64 PNG.
 *
 * Encodes the reference rather than a URL: door staff scan it against the
 * order record, and a URL would need the scanner to have network access.
 */
async function ticketQrCode(orderId: number, reference: string | null): Promise<string> {
  const dataUrl = await QRCode.toDataURL(`TICKET:${orderId}:${reference ?? 'NOREF'}`, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  })

  return dataUrl.replace(/^data:image\/png;base64,/, '')
}
