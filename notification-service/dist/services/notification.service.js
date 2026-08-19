import { logger } from '../core/logger.js';
import { Notification } from '../models/notification.model.js';
import { realtime } from '../realtime/socket.js';
/**
 * Creates an in-app notification and pushes it to whoever is watching.
 *
 * Swallows the duplicate-key error from the unique index rather than
 * propagating it: a redelivered broker message arriving here is an expected
 * consequence of at-least-once delivery, not a failure. Letting it throw would
 * make the consumer nack and retry a message that has already done its job.
 */
export async function createNotification(input) {
    try {
        const notification = await Notification.create({
            userId: input.userId,
            audience: input.audience,
            type: input.type,
            title: input.title,
            body: input.body,
            data: input.data ?? {},
            sourceEventId: input.sourceEventId,
        });
        realtime.notifyCreated(notification);
    }
    catch (error) {
        if (isDuplicate(error)) {
            logger.debug({ sourceEventId: input.sourceEventId, type: input.type }, 'Notification already exists; skipping.');
            return;
        }
        throw error;
    }
}
function isDuplicate(error) {
    return (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000);
}
/**
 * Build the query describing what a caller is allowed to see.
 *
 * A regular user sees only notifications addressed to them. An administrator
 * additionally sees the operational feed — but still only their *own* user
 * notifications, not every customer's, which would be the same privacy leak
 * the orders endpoint used to have.
 */
export function visibilityFilter(userId, isAdmin) {
    const own = { audience: 'user', userId };
    return isAdmin ? { $or: [own, { audience: 'admin' }] } : own;
}
export async function listNotifications(options) {
    const filter = visibilityFilter(options.userId, options.isAdmin);
    if (options.status === 'unread') {
        filter.readAt = null;
    }
    const [items, total] = await Promise.all([
        Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip((options.page - 1) * options.perPage)
            .limit(options.perPage)
            .lean(),
        Notification.countDocuments(filter),
    ]);
    return { items, total };
}
export async function unreadCount(userId, isAdmin) {
    return Notification.countDocuments({
        ...visibilityFilter(userId, isAdmin),
        readAt: null,
    });
}
/**
 * Mark one notification read.
 *
 * The visibility filter is part of the update query, not a check beforehand —
 * so a caller cannot mark somebody else's notification read by guessing an id.
 */
export async function markRead(id, userId, isAdmin) {
    const result = await Notification.updateOne({ _id: id, ...visibilityFilter(userId, isAdmin), readAt: null }, { $set: { readAt: new Date() } });
    if (result.matchedCount > 0) {
        realtime.notifyUnreadCount(userId);
    }
    // matchedCount 0 means "not yours, does not exist, or already read". The
    // caller cannot distinguish those, which is intentional.
    return result.matchedCount > 0;
}
export async function markAllRead(userId, isAdmin) {
    const result = await Notification.updateMany({ ...visibilityFilter(userId, isAdmin), readAt: null }, { $set: { readAt: new Date() } });
    if (result.modifiedCount > 0) {
        realtime.notifyUnreadCount(userId);
    }
    return result.modifiedCount;
}
//# sourceMappingURL=notification.service.js.map