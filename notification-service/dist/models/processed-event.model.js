import { Schema, model } from 'mongoose';
/**
 * Records which domain events have already been handled.
 *
 * Delivery is at-least-once: the outbox relay can publish and then die before
 * marking the row sent, and RabbitMQ redelivers anything unacknowledged. The
 * envelope id is the idempotency key, and inserting it is how a duplicate is
 * detected.
 *
 * Inserted *before* the handler runs, not after. A crash mid-handle then costs
 * one lost notification rather than an infinite duplicate storm, and the
 * unique index on `notifications` covers that gap. The other order — handle,
 * then record — turns any crash into a message that is reprocessed forever.
 */
const processedEventSchema = new Schema({
    /** The envelope id. Used directly as _id so the insert is the check. */
    _id: { type: String, required: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: () => new Date() },
}, { _id: false, versionKey: false });
// Expire after 30 days. Redelivery windows are measured in minutes, so keeping
// these forever would grow a collection nothing ever reads for no benefit.
processedEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
export const ProcessedEvent = model('ProcessedEvent', processedEventSchema);
/** MongoDB's duplicate-key error code. */
export const DUPLICATE_KEY = 11000;
export function isDuplicateKeyError(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === DUPLICATE_KEY);
}
//# sourceMappingURL=processed-event.model.js.map