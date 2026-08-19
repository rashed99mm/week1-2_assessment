import { generateKeyPairSync, randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

/**
 * A real MongoDB, in memory.
 *
 * The unique indexes are load-bearing — they are the second idempotency layer
 * that stops a redelivered event sending a customer two receipts. A stubbed
 * data layer would not enforce them, so a test suite built on one would pass
 * while the guarantee was broken.
 */
let server: MongoMemoryServer | null = null

export async function startDatabase(): Promise<void> {
  server = await MongoMemoryServer.create()
  await mongoose.connect(server.getUri('notifications-test'))
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()))
}

export async function stopDatabase(): Promise<void> {
  await mongoose.disconnect()
  await server?.stop()
  server = null
}

export async function clearDatabase(): Promise<void> {
  const collections = mongoose.connection.collections

  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})))
}

/** The key the setup file put into JWT_PUBLIC_KEY, plus its private half. */
const keyPair = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})

export function signToken(
  claims: { sub: number; role?: 'user' | 'admin' },
  privateKey: string,
): string {
  return jwt.sign(
    { sub: String(claims.sub), role: claims.role ?? 'user' },
    privateKey,
    { algorithm: 'RS256', expiresIn: '1h' },
  )
}

/** A token signed with a key the service does not trust. */
export function signWithForeignKey(sub: number): string {
  return signToken({ sub }, keyPair.privateKey)
}

/**
 * Build a well-formed envelope.
 *
 * Defaults are deliberately valid so a test only states the field it cares
 * about — and so a test that meant to be valid cannot pass by accident because
 * something unrelated was malformed.
 */
export function envelope(
  type: string,
  payload: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: randomUUID(),
    type,
    version: 1,
    occurredAt: new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z'),
    source: 'tickets-backend',
    correlationId: null,
    actor: { userId: 12, role: 'user' },
    payload,
    ...overrides,
  }
}

export const orderCreatedPayload = {
  orderId: 501,
  userId: 12,
  eventId: 17,
  eventTitle: 'Aurora Live',
  ticketTypeId: 44,
  ticketTypeName: 'Floor A',
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  quantity: 2,
  unitPrice: '75.00',
  totalAmount: '150.00',
  currency: 'USD',
  status: 'pending',
  createdAt: '2026-08-16T12:30:00.000Z',
  expiresAt: '2026-08-16T12:45:00.000Z',
}

export const orderPaidPayload = {
  orderId: 501,
  userId: 12,
  eventId: 17,
  eventTitle: 'Aurora Live',
  ticketTypeId: 44,
  quantity: 2,
  totalAmount: '150.00',
  currency: 'USD',
  paymentId: 88,
  gatewayReference: 'TXN-ABC123',
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  paidAt: '2026-08-16T12:32:10.000Z',
}
