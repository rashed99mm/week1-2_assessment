import { createNotification } from '../../services/notification.service.js';
import { eventPublishedSchema } from '../envelope.js';
/**
 * Note that an event went on sale.
 *
 * Administrators only. Mailing every registered user whenever something is
 * published is a marketing decision with an unsubscribe requirement attached,
 * not something to do by default.
 */
export async function handleEventPublished(envelope) {
    const payload = eventPublishedSchema.parse(envelope.payload);
    await createNotification({
        userId: null,
        audience: 'admin',
        type: envelope.type,
        title: 'Event published',
        body: `"${payload.title}" is on sale with ${payload.totalTickets} tickets.`,
        data: {
            eventId: payload.eventId,
            title: payload.title,
            startsAt: payload.startsAt,
        },
        sourceEventId: envelope.id,
    });
}
//# sourceMappingURL=event-published.js.map