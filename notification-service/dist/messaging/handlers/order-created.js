import { queueEmail } from '../../services/email.service.js';
import { createNotification } from '../../services/notification.service.js';
import { orderCreatedSchema } from '../envelope.js';
/**
 * Confirm the reservation.
 *
 * The tickets are already held when this fires, and `expiresAt` says for how
 * long — which is the one piece of information a customer needs and the reason
 * this email is worth sending before payment rather than after.
 */
export async function handleOrderCreated(envelope) {
    const payload = orderCreatedSchema.parse(envelope.payload);
    await queueEmail({
        to: payload.customerEmail,
        subject: `Your order for ${payload.eventTitle}`,
        template: 'order-confirmation',
        context: {
            customerName: payload.customerName,
            orderId: payload.orderId,
            eventTitle: payload.eventTitle,
            ticketTypeName: payload.ticketTypeName,
            quantity: payload.quantity,
            // Money stays a string end to end.
            unitPrice: payload.unitPrice,
            totalAmount: payload.totalAmount,
            currency: payload.currency,
            expiresAt: payload.expiresAt,
        },
        sourceEventId: envelope.id,
    });
    // A guest checkout has no account to attach an in-app notice to.
    if (payload.userId !== null) {
        await createNotification({
            userId: payload.userId,
            audience: 'user',
            type: envelope.type,
            title: 'Order placed',
            body: `Your ${payload.quantity} ticket(s) for ${payload.eventTitle} are reserved. Complete payment to confirm.`,
            data: { orderId: payload.orderId, eventId: payload.eventId },
            sourceEventId: envelope.id,
        });
    }
}
//# sourceMappingURL=order-created.js.map