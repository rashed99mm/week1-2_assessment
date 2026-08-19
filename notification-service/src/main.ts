import mongoose from 'mongoose'
import { buildApp } from './app.js'
import { config } from './core/config.js'
import { logger } from './core/logger.js'
import { consumer } from './messaging/consumer.js'
import { startEmailFlusher, stopEmailFlusher } from './services/email.service.js'

/**
 * Boot order matters.
 *
 * MongoDB first, because both the consumer and the HTTP layer need it.
 * Then HTTP, so the healthcheck can start passing. The broker last, and
 * without awaiting a successful connection — it reconnects on its own, and
 * refusing to start because the broker is slow would turn a ten-second delay
 * into a crash-loop backoff.
 */
async function main(): Promise<void> {
  await mongoose.connect(config.MONGO_URL)
  logger.info('Connected to MongoDB.')

  // Mongoose creates indexes in the background on first use. Doing it here
  // means a missing unique index cannot silently let duplicates through while
  // the first events are being handled.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()))

  const app = await buildApp()
  await app.listen({ port: config.PORT, host: config.HOST })
  logger.info({ port: config.PORT }, 'HTTP server listening.')

  startEmailFlusher()
  void consumer.start()

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down.')

    stopEmailFlusher()
    await consumer.stop()
    await app.close()
    await mongoose.disconnect()

    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((error: unknown) => {
  logger.fatal({ err: error }, 'Failed to start.')
  process.exit(1)
})
