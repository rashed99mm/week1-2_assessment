import { readFileSync } from 'node:fs';
import { z } from 'zod';
/**
 * Environment configuration, validated at start-up.
 *
 * Parsing here rather than reading `process.env` at each use site means a
 * missing MONGO_URL is a clear failure on boot instead of a confusing
 * connection error on the first event, twenty minutes later.
 */
const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    MONGO_URL: z.string().min(1),
    RABBITMQ_URL: z.string().min(1),
    RABBITMQ_QUEUE: z.string().default('notifications.events'),
    /** Bounded so a crash loses at most this many in-flight messages. */
    RABBITMQ_PREFETCH: z.coerce.number().int().positive().default(10),
    /**
     * RS256 public key. Verification only — this service must not be able to
     * mint a token, which is the whole reason the system moved off a shared
     * HS256 secret. Supplied as a file path (a docker secret) or inline.
     */
    JWT_PUBLIC_KEY_FILE: z.string().optional(),
    JWT_PUBLIC_KEY: z.string().optional(),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_SECURE: z.coerce.boolean().default(false),
    MAIL_FROM: z.string().default('tickets@example.com'),
    MAIL_FROM_NAME: z.string().default('Tickets'),
    /** Used to build ticket links in outgoing email. */
    APP_URL: z.string().default('http://localhost'),
    /** How often the outbox flusher looks for unsent mail, in milliseconds. */
    EMAIL_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().positive().default(6),
});
function load() {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    const env = parsed.data;
    const jwtPublicKey = env.JWT_PUBLIC_KEY_FILE
        ? readFileSync(env.JWT_PUBLIC_KEY_FILE, 'utf8')
        : (env.JWT_PUBLIC_KEY ?? '');
    if (!jwtPublicKey) {
        throw new Error('A JWT public key is required. Set JWT_PUBLIC_KEY_FILE (preferred) or JWT_PUBLIC_KEY. ' +
            'See docs/contracts/auth-jwt.md.');
    }
    return { ...env, jwtPublicKey };
}
export const config = load();
//# sourceMappingURL=config.js.map