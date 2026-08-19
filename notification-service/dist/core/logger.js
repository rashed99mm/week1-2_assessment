import { pino } from 'pino';
import { config } from './config.js';
/**
 * Structured logging.
 *
 * JSON lines to stdout, which the container runtime collects. No file
 * transport and no rotation: writing logs inside a container means losing them
 * when it is replaced.
 */
export const logger = pino({
    level: config.LOG_LEVEL,
    base: { service: 'notification-service' },
    formatters: {
        level: (label) => ({ level: label }),
    },
    redact: {
        // A token in a log line is a credential in a log aggregator, readable by
        // everyone with dashboard access and impossible to recall.
        paths: ['req.headers.authorization', 'headers.authorization', '*.token', 'token'],
        censor: '[redacted]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});
//# sourceMappingURL=logger.js.map