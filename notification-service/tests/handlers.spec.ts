import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { handlers } from '../src/messaging/handlers/index.js'
import { EmailOutbox } from '../src/models/email-outbox.model.js'
import { Notification } from '../src/models/notification.model.js'
import {
  clearDatabase,
  envelope,
  orderCreatedPayload,
  orderPaidPayload,
  startDatabase,
  stopDatabase,
} from './helpers.js'

/**
 * Event handlers, against a real MongoDB.
 *
 * In memory but genuine: the unique indexes are the second idempotency layer
 * that stops a redelivered event mailing a customer twice, and a stubbed data
 * layer would not enforce them. A suite built on stubs would pass while the
 * guarantee was broken.
 */
describe('event handlers', () => {
  beforeAll(startDatabase)
  afterAll(stopDatabase)
  afterEach(clearDatabase)

  const run = async (type: string, payload: Record<string, unknown>, id = randomUUID()) => {
    const message = envelope(type, payload, { id })
    await handlers[type]!(message as never)
    return message
  }

  describe('order.created', () => {
    it('queues a confirmation email and notifies the customer', async () => {
      await run('order.created', orderCreatedPayload)

      const email = await EmailOutbox.findOne({ template: 'order-confirmation' })
      expect(email?.to).toBe('ada@example.com')
      expect(email?.status).toBe('pending')
      // Money is carried through as the decimal string it arrived as.
      expect((email?.context as Record<string, unknown>).totalAmount).toBe('150.00')

      const notification = await Notification.findOne({ audience: 'user' })
      expect(notification?.userId).toBe(12)
      expect(notification?.readAt).toBeNull()
    })

    it('skips the in-app notification for a guest order', async () => {
      await run('order.created', { ...orderCreatedPayload, userId: null })

      // Still emails: a guest gave an address even without an account.
      expect(await EmailOutbox.countDocuments()).toBe(1)
      expect(await Notification.countDocuments({ audience: 'user' })).toBe(0)
    })
  })

  describe('order.paid', () => {
    it('attaches the ticket QR by content id', async () => {
      await run('order.paid', orderPaidPayload)

      const email = await EmailOutbox.findOne({ template: 'e-ticket' })

      expect(email?.attachments).toHaveLength(1)
      expect(email?.attachments[0]?.cid).toBe('ticket-qr')
      // Base64 PNG, so it can be sent as a real attachment rather than a
      // data: URI that Gmail would strip.
      expect(email?.attachments[0]?.content).toMatch(/^[A-Za-z0-9+/=]+$/)
      expect((email?.attachments[0]?.content ?? '').length).toBeGreaterThan(100)
    })

    it('notifies both the customer and the admin feed', async () => {
      await run('order.paid', orderPaidPayload)

      expect(await Notification.countDocuments({ audience: 'user', userId: 12 })).toBe(1)
      expect(await Notification.countDocuments({ audience: 'admin' })).toBe(1)
    })
  })

  describe('order.cancelled', () => {
    it('sends nothing to a customer whose reservation simply expired', async () => {
      await run('order.cancelled', {
        orderId: 501,
        userId: 12,
        eventId: 17,
        ticketTypeId: 44,
        quantity: 2,
        reason: 'reservation_expired',
        cancelledAt: '2026-08-16T12:45:01.000Z',
      })

      // Someone who abandoned a checkout does not want an email about it.
      expect(await EmailOutbox.countDocuments()).toBe(0)
      expect(await Notification.countDocuments({ audience: 'user' })).toBe(0)
      // Administrators still see the stock come back.
      expect(await Notification.countDocuments({ audience: 'admin' })).toBe(1)
    })

    it('does notify the customer when an admin cancelled the order', async () => {
      await run('order.cancelled', {
        orderId: 501,
        userId: 12,
        eventId: 17,
        ticketTypeId: 44,
        quantity: 2,
        reason: 'Duplicate booking',
        cancelledAt: '2026-08-16T12:45:01.000Z',
      })

      expect(await Notification.countDocuments({ audience: 'user', userId: 12 })).toBe(1)
    })
  })

  describe('order.refunded', () => {
    it('emails the address carried on the event', async () => {
      await run('order.refunded', {
        orderId: 501,
        userId: 12,
        eventId: 17,
        eventTitle: 'Aurora Live',
        ticketTypeId: 44,
        quantity: 2,
        refundedAmount: '150.00',
        currency: 'USD',
        paymentId: 88,
        gatewayReference: 'TXN-ABC123',
        customerName: 'Ada Lovelace',
        customerEmail: 'ada@example.com',
        reason: 'Customer request',
        refundedAt: '2026-08-17T09:15:00.000Z',
      })

      // The address has to be on the event: this service cannot read the
      // orders table, so without it there would be nowhere to send.
      const email = await EmailOutbox.findOne({ template: 'refund-confirmation' })
      expect(email?.to).toBe('ada@example.com')
    })
  })

  describe('event.published', () => {
    it('notifies administrators only', async () => {
      await run('event.published', {
        eventId: 17,
        title: 'Aurora Live',
        venue: 'Rooftop Arena',
        eventTypeId: 3,
        eventTypeName: 'Concert',
        startsAt: '2026-09-01T19:00:00.000Z',
        endsAt: null,
        totalTickets: 500,
        coverImageUrl: null,
        publishedAt: '2026-08-16T10:00:00.000Z',
      })

      // Mailing every registered user on publish is a marketing decision with
      // an unsubscribe requirement attached, not a default.
      expect(await EmailOutbox.countDocuments()).toBe(0)
      expect(await Notification.countDocuments({ audience: 'admin' })).toBe(1)
    })
  })

  describe('idempotency', () => {
    /**
     * Delivery is at-least-once. The consumer's dedupe collection is the first
     * defence, but a crash between recording an event and handling it would
     * lose the notification; the redelivery then re-runs the handler, and
     * these unique indexes are what stop the customer seeing two of everything.
     */
    it('does not duplicate a notification when the same event is handled twice', async () => {
      const id = randomUUID()

      await run('order.paid', orderPaidPayload, id)
      await run('order.paid', orderPaidPayload, id)

      expect(await Notification.countDocuments({ audience: 'user' })).toBe(1)
      expect(await Notification.countDocuments({ audience: 'admin' })).toBe(1)
    })

    it('does not duplicate an email when the same event is handled twice', async () => {
      const id = randomUUID()

      await run('order.created', orderCreatedPayload, id)
      await run('order.created', orderCreatedPayload, id)

      expect(await EmailOutbox.countDocuments()).toBe(1)
    })

    it('treats distinct events as distinct', async () => {
      await run('order.created', orderCreatedPayload)
      await run('order.created', { ...orderCreatedPayload, orderId: 502 })

      expect(await EmailOutbox.countDocuments()).toBe(2)
    })
  })
})
