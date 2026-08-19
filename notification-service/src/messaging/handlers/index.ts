import type { Envelope } from '../envelope.js'
import { handleEventPublished } from './event-published.js'
import { handleOrderCancelled } from './order-cancelled.js'
import { handleOrderCreated } from './order-created.js'
import { handleOrderPaid } from './order-paid.js'
import { handleOrderRefunded } from './order-refunded.js'
import { handleUserRegistered } from './user-registered.js'

export type Handler = (envelope: Envelope) => Promise<void>

/**
 * Event type to handler.
 *
 * A type absent from this map is acknowledged and ignored by the consumer, so
 * adding an event type upstream cannot break this service.
 */
export const handlers: Record<string, Handler | undefined> = {
  'user.registered': handleUserRegistered,
  'order.created': handleOrderCreated,
  'order.paid': handleOrderPaid,
  'order.refunded': handleOrderRefunded,
  'order.cancelled': handleOrderCancelled,
  'event.published': handleEventPublished,
}
