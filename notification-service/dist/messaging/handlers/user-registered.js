import { queueEmail } from '../../services/email.service.js';
import { createNotification } from '../../services/notification.service.js';
import { userRegisteredSchema } from '../envelope.js';
/** Welcome the new account, and let administrators see sign-ups arriving. */
export async function handleUserRegistered(envelope) {
    const payload = userRegisteredSchema.parse(envelope.payload);
    await queueEmail({
        to: payload.email,
        subject: 'Welcome to Tickets',
        template: 'welcome',
        context: { name: payload.name },
        sourceEventId: envelope.id,
    });
    await createNotification({
        userId: null,
        audience: 'admin',
        type: envelope.type,
        title: 'New sign-up',
        body: `${payload.name} (${payload.email}) created an account.`,
        data: { userId: payload.userId },
        sourceEventId: envelope.id,
    });
}
//# sourceMappingURL=user-registered.js.map