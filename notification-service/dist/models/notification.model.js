import { Schema, model } from 'mongoose';
/**
 * An in-app notification, shown in the portal's bell menu and the CMS.
 *
 * `audience` separates a customer's own notifications from the operational
 * feed administrators see. A notification about someone's order is addressed
 * to that user; a notification that an event went on sale is addressed to
 * whoever is running the shop.
 */
const notificationSchema = new Schema({
    /** Null for an admin-audience notice, which belongs to a role not a person. */
    userId: { type: Number, default: null },
    audience: { type: String, enum: ['user', 'admin'], required: true },
    /** Matches the domain event type that produced it, e.g. `order.paid`. */
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    /** Free-form context the UI uses to build a link. */
    data: { type: Schema.Types.Mixed, default: {} },
    readAt: { type: Date, default: null },
    /**
     * The envelope id of the event that produced this.
     *
     * The second idempotency layer. `processed_events` is checked before a
     * handler runs, but a crash between that insert and this write would lose
     * the notification; a redelivery then recreates it, and the unique index
     * below stops a duplicate appearing if both paths somehow run.
     */
    sourceEventId: { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
// The bell menu: this user's notifications, newest first.
notificationSchema.index({ userId: 1, createdAt: -1 });
// The unread badge.
notificationSchema.index({ userId: 1, readAt: 1 });
// The admin feed.
notificationSchema.index({ audience: 1, createdAt: -1 });
// One notification per (event, recipient, type). Delivery is at-least-once, so
// without this a redelivered message would show the customer their order
// confirmation twice.
notificationSchema.index({ sourceEventId: 1, userId: 1, type: 1 }, { unique: true });
export const Notification = model('Notification', notificationSchema);
//# sourceMappingURL=notification.model.js.map