import { Schema, model, type InferSchemaType } from 'mongoose'

/**
 * Mail queued for delivery.
 *
 * Handlers write here and return; a background flusher does the sending. That
 * separation is the point: acknowledging a broker message only after SMTP
 * responds couples queue throughput to the mail server's latency, so one slow
 * or flaky SMTP host stops the queue draining and every other notification
 * backs up behind it.
 *
 * It also makes retries cheap. A failed send is a row to try again later, not
 * a redelivered broker message that re-runs the whole handler.
 */
const emailOutboxSchema = new Schema(
  {
    to: { type: String, required: true },
    subject: { type: String, required: true },

    /** Template name under src/templates, without extension. */
    template: { type: String, required: true },

    /** Values interpolated into the template. */
    context: { type: Schema.Types.Mixed, default: {} },

    /**
     * Attachments referenced from the HTML by cid:. The e-ticket QR code is
     * sent this way — a data: URI in an <img> is stripped by Gmail.
     */
    attachments: {
      type: [
        {
          _id: false,
          filename: String,
          cid: String,
          /** Base64 payload; small by construction (a QR code is a few KB). */
          content: String,
        },
      ],
      default: [],
    },

    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },

    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },

    /** Exponential backoff: the flusher ignores rows until this passes. */
    nextAttemptAt: { type: Date, default: () => new Date() },
    sentAt: { type: Date, default: null },

    sourceEventId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
)

// The flusher's query: pending rows that are due.
emailOutboxSchema.index({ status: 1, nextAttemptAt: 1 })

// One email per (event, recipient, template). The same guard as notifications:
// a redelivered message must not send the customer two receipts.
emailOutboxSchema.index(
  { sourceEventId: 1, to: 1, template: 1 },
  { unique: true },
)

export type EmailOutboxDoc = InferSchemaType<typeof emailOutboxSchema>

export const EmailOutbox = model('EmailOutbox', emailOutboxSchema)
