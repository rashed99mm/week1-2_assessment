import { bearerFrom, verifyToken } from '../../core/jwt.js';
import { fail } from '../../core/api-response.js';
/**
 * Reject requests without a valid bearer token, and attach the caller.
 *
 * Used as a route-level preHandler rather than a global hook, so /health stays
 * reachable for the container healthcheck without a credential.
 */
export async function requireAuth(request, reply) {
    const token = bearerFrom(request.headers.authorization);
    if (!token) {
        await reply.code(401).send(fail('Unauthenticated.', 401));
        return;
    }
    try {
        request.user = verifyToken(token);
    }
    catch {
        // The specific reason — expired, wrong signature, malformed — is not
        // reported: it tells an attacker which part of a forgery attempt worked.
        await reply.code(401).send(fail('Invalid or expired token.', 401));
    }
}
//# sourceMappingURL=auth.plugin.js.map