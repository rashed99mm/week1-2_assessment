import Fastify from 'fastify';
import { Server as SocketServer } from 'socket.io';
import { fail } from './core/api-response.js';
import { logger } from './core/logger.js';
import { healthRoutes } from './api/routes/health.js';
import { notificationRoutes } from './api/routes/notifications.js';
import { realtime } from './realtime/socket.js';
export async function buildApp() {
    const app = Fastify({
        // loggerInstance, not logger: Fastify 5 uses `logger` for options it
        // builds a logger from, and `loggerInstance` for one already constructed.
        // Passing a pino instance as `logger` type-errors in a way that reads as
        // an unrelated overload problem.
        loggerInstance: logger,
        // Behind nginx, so the client address and scheme come from the forwarded
        // headers. Without this every log line records the proxy's address.
        trustProxy: true,
    });
    // Every error leaves through the shared envelope, so this service does not
    // speak a different dialect from the rest of the system.
    app.setErrorHandler((error, request, reply) => {
        const statusCode = error.statusCode ?? 500;
        if (statusCode >= 500) {
            request.log.error({ err: error }, 'Unhandled error.');
        }
        return reply.code(statusCode).send(fail(
        // A 500's real message can name internal paths or query fragments;
        // it goes to the log, not to the client.
        statusCode >= 500 ? 'An unexpected error occurred.' : error.message, statusCode, error.validation
            ? { [error.validationContext ?? 'body']: [error.message] }
            : null));
    });
    app.setNotFoundHandler((_request, reply) => reply.code(404).send(fail('Not found.', 404)));
    await app.register(healthRoutes);
    await app.register(notificationRoutes, { prefix: '/api/v1' });
    // Socket.IO is attached to Fastify's own HTTP server rather than through a
    // plugin: the maintained Fastify plugin for this is still pinned to Fastify
    // 4, and the whole integration is these few lines.
    //
    // The path matches the nginx location that forwards the upgrade headers.
    const io = new SocketServer(app.server, {
        path: '/notifications/ws',
        // nginx terminates at the edge and this service is not otherwise
        // reachable, so an origin check here would only be checking the proxy.
        cors: { origin: false },
        serveClient: false,
    });
    realtime.attach(io);
    app.addHook('onClose', async () => {
        await io.close();
    });
    return app;
}
//# sourceMappingURL=app.js.map