import { z } from 'zod';
/**
 * The domain event contract, as consumed by this service.
 *
 * Hand-written from docs/contracts/domain-events.schema.json rather than
 * generated, because the schema is the agreement and this is one party's
 * reading of it — the tests validate real envelopes against the schema so the
 * two cannot drift silently.
 *
 * Money arrives as a decimal string ("150.00"), never a number. Anything that
 * turns it into a JavaScript number introduces binary-float drift that only
 * shows up when someone reconciles a revenue report.
 */
/** RFC 3339, UTC, explicit Z, millisecond precision. */
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
/** Fixed two-decimal string. Kept as a string all the way through. */
const money = z.string().regex(/^-?\d+\.\d{2}$/);
const actor = z
    .object({
    userId: z.number().int().nullable(),
    role: z.enum(['user', 'admin']),
})
    .nullable();
export const EVENT_TYPES = [
    'user.registered',
    'order.created',
    'order.paid',
    'order.refunded',
    'order.cancelled',
    'event.published',
];
/**
 * The envelope, parsed loosely on purpose.
 *
 * `type` is a plain string rather than the enum: an unrecognised type must be
 * acknowledged and ignored, not dead-lettered, so that adding an event type
 * upstream does not break this consumer. Only a *malformed* envelope is
 * poison.
 *
 * `payload` is passthrough here and narrowed per type by the handler, so a new
 * optional field upstream does not fail parsing.
 */
export const envelopeSchema = z.object({
    id: z.string().uuid(),
    type: z.string().min(1),
    version: z.number().int().positive(),
    occurredAt: timestamp,
    source: z.string().min(1),
    correlationId: z.string().nullable().optional(),
    actor: actor.optional(),
    payload: z.record(z.unknown()),
});
/** The only payload version this service understands. */
export const SUPPORTED_VERSION = 1;
// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------
export const userRegisteredSchema = z.object({
    userId: z.number().int(),
    name: z.string(),
    email: z.string(),
    role: z.enum(['user', 'admin']),
    registeredAt: timestamp,
});
export const orderCreatedSchema = z.object({
    orderId: z.number().int(),
    userId: z.number().int().nullable(),
    eventId: z.number().int(),
    eventTitle: z.string(),
    ticketTypeId: z.number().int(),
    ticketTypeName: z.string(),
    customerName: z.string(),
    customerEmail: z.string(),
    quantity: z.number().int(),
    unitPrice: money,
    totalAmount: money,
    currency: z.string(),
    status: z.string(),
    createdAt: timestamp,
    expiresAt: timestamp.nullable(),
});
export const orderPaidSchema = z.object({
    orderId: z.number().int(),
    userId: z.number().int().nullable(),
    eventId: z.number().int(),
    eventTitle: z.string(),
    ticketTypeId: z.number().int(),
    quantity: z.number().int(),
    totalAmount: money,
    currency: z.string(),
    paymentId: z.number().int(),
    gatewayReference: z.string().nullable(),
    customerName: z.string(),
    customerEmail: z.string(),
    paidAt: timestamp,
});
export const orderRefundedSchema = z.object({
    orderId: z.number().int(),
    userId: z.number().int().nullable(),
    eventId: z.number().int(),
    eventTitle: z.string(),
    ticketTypeId: z.number().int(),
    quantity: z.number().int(),
    refundedAmount: money,
    currency: z.string(),
    paymentId: z.number().int(),
    gatewayReference: z.string().nullable(),
    customerName: z.string(),
    customerEmail: z.string(),
    reason: z.string().nullable(),
    refundedAt: timestamp,
});
export const orderCancelledSchema = z.object({
    orderId: z.number().int(),
    userId: z.number().int().nullable(),
    eventId: z.number().int(),
    ticketTypeId: z.number().int(),
    quantity: z.number().int(),
    reason: z.string().nullable(),
    cancelledAt: timestamp,
});
export const eventPublishedSchema = z.object({
    eventId: z.number().int(),
    title: z.string(),
    venue: z.string().nullable(),
    eventTypeId: z.number().int().nullable(),
    eventTypeName: z.string().nullable(),
    startsAt: timestamp,
    endsAt: timestamp.nullable(),
    totalTickets: z.number().int(),
    coverImageUrl: z.string().nullable(),
    publishedAt: timestamp,
});
/** The reason `reason` carries when the expiry sweeper cancels a reservation. */
export const REASON_RESERVATION_EXPIRED = 'reservation_expired';
//# sourceMappingURL=envelope.js.map