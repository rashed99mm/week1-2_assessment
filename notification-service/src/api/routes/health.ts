import type { FastifyInstance } from 'fastify'
import mongoose from 'mongoose'
import { consumer } from '../../messaging/consumer.js'

/**
 * Liveness and readiness in one endpoint.
 *
 * Reports 200 as long as the process can serve HTTP and reach MongoDB, and
 * degraded — still 200 — when only the broker is unreachable. That distinction
 * is deliberate: a broker outage means events are queuing up, not that this
 * service is broken, and returning 503 would make the orchestrator restart a
 * container that is working fine and would only reconnect anyway.
 *
 * Unauthenticated, because the container healthcheck runs before any
 * credential exists.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const mongoUp = mongoose.connection.readyState === 1
    const brokerUp = consumer.connected

    const status = !mongoUp ? 'unhealthy' : brokerUp ? 'ok' : 'degraded'

    return reply.code(mongoUp ? 200 : 503).send({
      status,
      mongo: mongoUp ? 'up' : 'down',
      broker: brokerUp ? 'up' : 'down',
    })
  })
}
