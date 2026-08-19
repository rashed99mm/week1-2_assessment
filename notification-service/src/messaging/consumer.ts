import amqp, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'
import { ProcessedEvent, isDuplicateKeyError } from '../models/processed-event.model.js'
import { envelopeSchema, SUPPORTED_VERSION, type Envelope } from './envelope.js'
import { handlers } from './handlers/index.js'

/**
 * Consumes domain events from RabbitMQ.
 *
 * Does not declare the queue or the exchange. The topology is loaded into the
 * broker from infra/rabbitmq/definitions.json at start-up, so two deployed
 * versions of this service cannot disagree about queue arguments and take each
 * other down with a PRECONDITION_FAILED.
 *
 * See docs/contracts/broker-topology.md.
 */
export class EventConsumer {
  private connection: ChannelModel | null = null
  private channel: Channel | null = null
  private stopped = false
  private reconnectDelayMs = 1_000

  /** Whether the broker connection is currently usable, for the health check. */
  get connected(): boolean {
    return this.channel !== null
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.connect()
  }

  async stop(): Promise<void> {
    this.stopped = true

    try {
      await this.channel?.close()
      await this.connection?.close()
    } catch {
      // Already closing; nothing useful to report on the way out.
    }

    this.channel = null
    this.connection = null
  }

  private async connect(): Promise<void> {
    if (this.stopped) return

    try {
      this.connection = await amqp.connect(config.RABBITMQ_URL)
      this.channel = await this.connection.createChannel()

      // Bounded in-flight work. A large prefetch just moves messages into this
      // process's memory, where a crash loses them.
      await this.channel.prefetch(config.RABBITMQ_PREFETCH)

      this.connection.on('error', (error) => {
        logger.error({ err: error }, 'Broker connection error.')
      })

      this.connection.on('close', () => {
        this.channel = null
        this.connection = null

        if (!this.stopped) {
          logger.warn('Broker connection closed; reconnecting.')
          this.scheduleReconnect()
        }
      })

      await this.channel.consume(config.RABBITMQ_QUEUE, (message) => {
        void this.handleMessage(message)
      })

      this.reconnectDelayMs = 1_000
      logger.info({ queue: config.RABBITMQ_QUEUE }, 'Consuming domain events.')
    } catch (error) {
      logger.error({ err: error }, 'Failed to connect to the broker.')
      this.channel = null
      this.connection = null
      this.scheduleReconnect()
    }
  }

  /**
   * Reconnect with backoff rather than exiting.
   *
   * A container that dies because the broker is merely slow to start turns a
   * ten-second delay into a crash-loop backoff, which takes far longer to
   * recover from than waiting.
   */
  private scheduleReconnect(): void {
    if (this.stopped) return

    const delay = this.reconnectDelayMs
    this.reconnectDelayMs = Math.min(delay * 2, 30_000)

    setTimeout(() => void this.connect(), delay).unref()
  }

  private async handleMessage(message: ConsumeMessage | null): Promise<void> {
    if (message === null || this.channel === null) return

    const channel = this.channel
    let envelope: Envelope

    // ---- Parse -----------------------------------------------------------
    // A malformed envelope is poison. Requeueing it produces an infinite
    // redelivery loop that looks like broker load, so it goes straight to the
    // dead-letter queue for a human.
    try {
      envelope = envelopeSchema.parse(JSON.parse(message.content.toString('utf8')))
    } catch (error) {
      logger.error(
        { err: error, body: message.content.toString('utf8').slice(0, 500) },
        'Malformed envelope; dead-lettering.',
      )
      channel.nack(message, false, false)
      return
    }

    const log = logger.child({ eventId: envelope.id, type: envelope.type })

    // ---- Version ---------------------------------------------------------
    // An unknown version means the payload shape changed. Guessing produces
    // silently wrong data, which is worse than a message somebody has to look
    // at.
    if (envelope.version !== SUPPORTED_VERSION) {
      log.error(
        { version: envelope.version, supported: SUPPORTED_VERSION },
        'Unsupported event version; dead-lettering.',
      )
      channel.nack(message, false, false)
      return
    }

    // ---- Unknown type ----------------------------------------------------
    // Acknowledged and ignored. Adding an event type upstream must not break
    // an existing consumer.
    const handler = handlers[envelope.type]

    if (!handler) {
      log.debug('No handler for this event type; ignoring.')
      channel.ack(message)
      return
    }

    // ---- Dedupe ----------------------------------------------------------
    // The insert *is* the check: a duplicate key means this event was already
    // handled. Done before the handler runs — see processed-event.model.ts.
    try {
      await ProcessedEvent.create({ _id: envelope.id, type: envelope.type })
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        log.debug('Duplicate delivery; already handled.')
        channel.ack(message)
        return
      }

      log.error({ err: error }, 'Could not record the event; requeueing.')
      channel.nack(message, false, true)
      return
    }

    // ---- Handle ----------------------------------------------------------
    try {
      await handler(envelope)
      channel.ack(message)
      log.debug('Handled.')
    } catch (error) {
      log.error({ err: error }, 'Handler failed; requeueing.')

      // Remove the dedupe row first, or the retry is swallowed by the check
      // above and the event is silently dropped after one failure.
      await ProcessedEvent.deleteOne({ _id: envelope.id }).catch(() => undefined)

      // x-delivery-limit on the queue dead-letters this after 5 attempts.
      channel.nack(message, false, true)
    }
  }
}

export const consumer = new EventConsumer()
