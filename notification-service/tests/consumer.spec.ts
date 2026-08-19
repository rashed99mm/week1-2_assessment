import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { envelopeSchema, SUPPORTED_VERSION } from '../src/messaging/envelope.js'
import { handlers } from '../src/messaging/handlers/index.js'
import { ProcessedEvent, isDuplicateKeyError } from '../src/models/processed-event.model.js'
import { clearDatabase, envelope, orderPaidPayload, startDatabase, stopDatabase } from './helpers.js'

/**
 * Consumer decision-making.
 *
 * The consumer's own loop needs a live broker, so these cover the rules it
 * applies rather than the plumbing: what counts as poison, what counts as a
 * duplicate, and what an unknown type does. Getting any of these wrong is
 * quiet and expensive — a requeued malformed message redelivers forever, and a
 * dedupe row written at the wrong moment drops events on the floor.
 */
describe('consumer rules', () => {
  beforeAll(startDatabase)
  afterAll(stopDatabase)
  afterEach(clearDatabase)

  describe('envelope validation', () => {
    it('accepts a well-formed envelope', () => {
      const result = envelopeSchema.safeParse(envelope('order.paid', orderPaidPayload))

      expect(result.success).toBe(true)
    })

    it('rejects a malformed envelope', () => {
      // Poison: the consumer dead-letters these rather than requeueing, which
      // would redeliver the same broken message forever.
      for (const broken of [
        { ...envelope('order.paid', orderPaidPayload), id: 'not-a-uuid' },
        { ...envelope('order.paid', orderPaidPayload), occurredAt: '2026-08-16' },
        { ...envelope('order.paid', orderPaidPayload), version: 'one' },
        { ...envelope('order.paid', orderPaidPayload), payload: undefined },
      ]) {
        expect(envelopeSchema.safeParse(broken).success).toBe(false)
      }
    })

    it('accepts an unrecognised type', () => {
      // Parsed successfully, then acknowledged and ignored by the consumer.
      // Adding an event type upstream must not break this service.
      const result = envelopeSchema.safeParse(envelope('billing.invoiced', { anything: true }))

      expect(result.success).toBe(true)
      expect(handlers['billing.invoiced']).toBeUndefined()
    })

    it('has a handler for every type it claims to consume', () => {
      for (const type of [
        'user.registered',
        'order.created',
        'order.paid',
        'order.refunded',
        'order.cancelled',
        'event.published',
      ]) {
        expect(handlers[type], `no handler registered for ${type}`).toBeTypeOf('function')
      }
    })
  })

  describe('version handling', () => {
    it('only understands version 1', () => {
      expect(SUPPORTED_VERSION).toBe(1)
    })

    it('parses a future version rather than rejecting it outright', () => {
      // Structurally valid, so the consumer decides — and dead-letters it,
      // because guessing at a changed payload produces silently wrong data.
      const result = envelopeSchema.safeParse(
        envelope('order.paid', orderPaidPayload, { version: 2 }),
      )

      expect(result.success).toBe(true)
      expect(result.data?.version).not.toBe(SUPPORTED_VERSION)
    })
  })

  describe('deduplication', () => {
    it('detects a redelivered event by its envelope id', async () => {
      const id = randomUUID()

      await ProcessedEvent.create({ _id: id, type: 'order.paid' })

      let caught: unknown
      try {
        await ProcessedEvent.create({ _id: id, type: 'order.paid' })
      } catch (error) {
        caught = error
      }

      expect(caught).toBeDefined()
      expect(isDuplicateKeyError(caught)).toBe(true)
    })

    it('treats distinct events as distinct', async () => {
      await ProcessedEvent.create({ _id: randomUUID(), type: 'order.paid' })
      await ProcessedEvent.create({ _id: randomUUID(), type: 'order.paid' })

      expect(await ProcessedEvent.countDocuments()).toBe(2)
    })

    /**
     * The dedupe row is written before the handler and removed if the handler
     * throws. Without that removal the retry is swallowed by the dedupe check
     * and the event is dropped after a single transient failure.
     */
    it('can be cleared so a failed handler is retried', async () => {
      const id = randomUUID()

      await ProcessedEvent.create({ _id: id, type: 'order.paid' })
      await ProcessedEvent.deleteOne({ _id: id })

      // The redelivery must now be able to record it again.
      await expect(
        ProcessedEvent.create({ _id: id, type: 'order.paid' }),
      ).resolves.toBeDefined()
    })

    it('does not treat an unrelated write error as a duplicate', () => {
      expect(isDuplicateKeyError(new Error('connection reset'))).toBe(false)
      expect(isDuplicateKeyError(null)).toBe(false)
      expect(isDuplicateKeyError({ code: 121 })).toBe(false)
    })
  })
})
