import nodemailer from 'nodemailer';
import { config } from '../core/config.js';
import { logger } from '../core/logger.js';
import { EmailOutbox } from '../models/email-outbox.model.js';
import { render } from './template.service.js';
/**
 * Queue an email for delivery.
 *
 * Returns as soon as the row is written. Handlers must not wait on SMTP: doing
 * so ties the rate at which the broker queue drains to the mail server's
 * latency, so one slow host stalls every other notification behind it.
 */
export async function queueEmail(input) {
    try {
        await EmailOutbox.create({
            to: input.to,
            subject: input.subject,
            template: input.template,
            context: input.context,
            attachments: input.attachments ?? [],
            sourceEventId: input.sourceEventId,
        });
    }
    catch (error) {
        if (isDuplicate(error)) {
            logger.debug({ sourceEventId: input.sourceEventId, template: input.template }, 'Email already queued for this event; skipping.');
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
let transporter = null;
function mailer() {
    transporter ??= nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_SECURE,
        auth: config.SMTP_USER
            ? { user: config.SMTP_USER, pass: config.SMTP_PASSWORD ?? '' }
            : undefined,
    });
    return transporter;
}
/**
 * Send one batch of due mail.
 *
 * Each row is attempted independently so one bad address cannot block the
 * rest of the batch.
 */
export async function flushOutbox(limit = 25) {
    const due = await EmailOutbox.find({
        status: 'pending',
        nextAttemptAt: { $lte: new Date() },
    })
        .sort({ nextAttemptAt: 1 })
        .limit(limit);
    let sent = 0;
    let failed = 0;
    for (const row of due) {
        try {
            const html = await render(row.template, row.context);
            await mailer().sendMail({
                from: `"${config.MAIL_FROM_NAME}" <${config.MAIL_FROM}>`,
                to: row.to,
                subject: row.subject,
                html,
                attachments: row.attachments.map((attachment) => ({
                    filename: attachment.filename ?? 'attachment',
                    cid: attachment.cid ?? undefined,
                    content: Buffer.from(attachment.content ?? '', 'base64'),
                })),
            });
            row.status = 'sent';
            row.sentAt = new Date();
            row.lastError = null;
            await row.save();
            sent += 1;
        }
        catch (error) {
            failed += 1;
            row.attempts += 1;
            row.lastError = error instanceof Error ? error.message.slice(0, 500) : String(error);
            if (row.attempts >= config.EMAIL_MAX_ATTEMPTS) {
                // Terminal. Left in the collection rather than deleted, so a failed
                // delivery can be found and explained rather than simply vanishing.
                row.status = 'failed';
                logger.error({ to: row.to, template: row.template, attempts: row.attempts }, 'Giving up on an email after repeated failures.');
            }
            else {
                // Exponential backoff in minutes: 2, 4, 8, 16, 32.
                const backoffMinutes = 2 ** row.attempts;
                row.nextAttemptAt = new Date(Date.now() + backoffMinutes * 60_000);
            }
            await row.save();
        }
    }
    return { sent, failed };
}
let flusherTimer = null;
/** Start the background flusher. */
export function startEmailFlusher() {
    if (flusherTimer)
        return;
    flusherTimer = setInterval(() => {
        void flushOutbox().catch((error) => {
            logger.error({ err: error }, 'Email flush failed.');
        });
    }, config.EMAIL_FLUSH_INTERVAL_MS);
    // Does not hold the process open on shutdown.
    flusherTimer.unref();
}
export function stopEmailFlusher() {
    if (flusherTimer) {
        clearInterval(flusherTimer);
        flusherTimer = null;
    }
}
//# sourceMappingURL=email.service.js.map