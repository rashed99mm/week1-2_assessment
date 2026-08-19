import { generateKeyPairSync } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, type App } from '../src/app.js'
import { Notification } from '../src/models/notification.model.js'
import { clearDatabase, startDatabase, stopDatabase } from './helpers.js'
import { TEST_PRIVATE_KEY } from './setup.js'

/**
 * The notification HTTP API.
 *
 * Driven through app.inject() rather than a live socket, so no port is bound
 * and no broker is needed.
 */
describe('notification API', () => {
  let app: App

  // The private half of the key setup.ts put into JWT_PUBLIC_KEY. config.ts
  // reads that variable when it is first imported, so the pair has to be
  // established there rather than here — generating a new one now would be
  // signing with a key the service never saw.
  const privateKey = TEST_PRIVATE_KEY

  beforeAll(async () => {
    await startDatabase()

    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await stopDatabase()
  })

  afterEach(clearDatabase)

  const tokenFor = (sub: number, role: 'user' | 'admin' = 'user'): string =>
    jwt.sign({ sub: String(sub), role }, privateKey, { algorithm: 'RS256', expiresIn: '1h' })

  const auth = (sub: number, role: 'user' | 'admin' = 'user') => ({
    authorization: `Bearer ${tokenFor(sub, role)}`,
  })

  const seed = async (overrides: Record<string, unknown> = {}) =>
    Notification.create({
      userId: 12,
      audience: 'user',
      type: 'order.paid',
      title: 'Payment confirmed',
      body: 'Your tickets are confirmed.',
      sourceEventId: `evt-${Math.random()}`,
      ...overrides,
    })

  describe('health', () => {
    it('is reachable without a token', async () => {
      // The container healthcheck runs before any credential exists.
      const response = await app.inject({ method: 'GET', url: '/health' })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toMatchObject({ mongo: 'up' })
    })
  })

  describe('authentication', () => {
    it('rejects a request with no token', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/notifications' })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toMatchObject({ success: false, status_code: 401 })
    })

    it('rejects a token signed with a key it does not trust', async () => {
      const foreign = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })

      const forged = jwt.sign({ sub: '12', role: 'admin' }, foreign.privateKey, {
        algorithm: 'RS256',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { authorization: `Bearer ${forged}` },
      })

      expect(response.statusCode).toBe(401)
    })

    it('rejects an expired token', async () => {
      const expired = jwt.sign({ sub: '12', role: 'user' }, privateKey, {
        algorithm: 'RS256',
        expiresIn: '-1h',
      })

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { authorization: `Bearer ${expired}` },
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('listing', () => {
    it('returns only the caller’s own notifications', async () => {
      await seed({ userId: 12, title: 'Mine' })
      await seed({ userId: 99, title: 'Theirs' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: auth(12),
      })

      expect(response.statusCode).toBe(200)
      expect(response.json().data.total).toBe(1)
      expect(response.json().data.data[0].title).toBe('Mine')
    })

    it('hides the admin feed from a regular user', async () => {
      await seed({ userId: null, audience: 'admin', title: 'Ops' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: auth(12),
      })

      expect(response.json().data.total).toBe(0)
    })

    it('shows an admin their own notifications plus the admin feed', async () => {
      await seed({ userId: 12, title: 'Mine' })
      await seed({ userId: null, audience: 'admin', title: 'Ops' })
      // Still not another customer's — an admin reading the feed is not the
      // same as an admin reading everyone's mail.
      await seed({ userId: 99, title: 'Someone else' })

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: auth(12, 'admin'),
      })

      expect(response.json().data.total).toBe(2)
    })

    it('uses the same paginator shape as the Laravel API', async () => {
      await seed()

      const body = response(await app.inject({
        method: 'GET',
        url: '/api/v1/notifications?per_page=1',
        headers: auth(12),
      }))

      // A single client-side Paginated<T> has to work against both services.
      expect(body.data).toHaveProperty('current_page', 1)
      expect(body.data).toHaveProperty('per_page', 1)
      expect(body.data).toHaveProperty('last_page')
      expect(body.data).toHaveProperty('total')
      expect(Array.isArray(body.data.data)).toBe(true)
    })

    it('filters to unread when asked', async () => {
      await seed({ title: 'Unread' })
      await seed({ title: 'Read', readAt: new Date() })

      const body = response(await app.inject({
        method: 'GET',
        url: '/api/v1/notifications?status=unread',
        headers: auth(12),
      }))

      expect(body.data.total).toBe(1)
      expect(body.data.data[0].title).toBe('Unread')
    })
  })

  describe('unread count', () => {
    it('counts only unread notifications the caller can see', async () => {
      await seed({ title: 'a' })
      await seed({ title: 'b' })
      await seed({ title: 'c', readAt: new Date() })
      await seed({ userId: 99, title: 'not mine' })

      const body = response(await app.inject({
        method: 'GET',
        url: '/api/v1/notifications/unread-count',
        headers: auth(12),
      }))

      expect(body.data.count).toBe(2)
    })
  })

  describe('marking read', () => {
    it('marks the caller’s own notification', async () => {
      const notification = await seed()

      const result = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${notification.id}/read`,
        headers: auth(12),
      })

      expect(result.statusCode).toBe(200)
      expect((await Notification.findById(notification.id))?.readAt).not.toBeNull()
    })

    it('will not mark somebody else’s notification', async () => {
      const notification = await seed({ userId: 99 })

      const result = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${notification.id}/read`,
        headers: auth(12),
      })

      // 404, not 403: a 403 would confirm the id exists.
      expect(result.statusCode).toBe(404)
      expect((await Notification.findById(notification.id))?.readAt).toBeNull()
    })

    it('marks everything the caller can see', async () => {
      await seed({ title: 'a' })
      await seed({ title: 'b' })
      await seed({ userId: 99, title: 'not mine' })

      const body = response(await app.inject({
        method: 'POST',
        url: '/api/v1/notifications/read-all',
        headers: auth(12),
      }))

      expect(body.data.updated).toBe(2)
      expect(await Notification.countDocuments({ userId: 99, readAt: null })).toBe(1)
    })
  })

  describe('errors', () => {
    it('renders a 404 in the shared envelope', async () => {
      const result = await app.inject({ method: 'GET', url: '/api/v1/nope', headers: auth(12) })

      expect(result.statusCode).toBe(404)
      expect(Object.keys(result.json()).sort()).toEqual(
        ['data', 'errors', 'message', 'status_code', 'success'],
      )
    })
  })
})

/** Narrow the injected response body to something with a `data` field. */
function response(result: { json: () => unknown }): { data: Record<string, never> } {
  return result.json() as { data: Record<string, never> }
}
