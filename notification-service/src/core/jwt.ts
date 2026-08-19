import jwt from 'jsonwebtoken'
import { config } from './config.js'

/**
 * The claims this service reads from a token issued by tickets-backend.
 * See docs/contracts/auth-jwt.md.
 */
export interface TokenClaims {
  /** User id. A string in the token, per JWT convention — parsed on the way out. */
  sub: string
  role: 'user' | 'admin'
  name?: string
  email?: string
  exp: number
  iat: number
}

export interface AuthenticatedUser {
  id: number
  role: 'user' | 'admin'
  isAdmin: boolean
}

export class InvalidTokenError extends Error {}

/**
 * Verify a bearer token and return the caller it identifies.
 *
 * The algorithm is pinned to RS256 rather than taken from the token header. A
 * verifier that honours the token's own `alg` can be handed `alg: none`, or an
 * HS256 token signed with the public key treated as a shared secret — both are
 * standard forgeries and both are blocked by pinning.
 *
 * Issuer and audience are deliberately not checked: the issuer is the login
 * URL and therefore environment-dependent, and the library emits no `aud` at
 * all, so enabling audience validation would reject every token.
 *
 * Note the accepted staleness: Laravel's logout blacklist lives in its own
 * cache and is invisible here, so a token that has been logged out still
 * verifies until it expires — at most the 60-minute TTL. Documented and
 * accepted; this service performs no destructive action.
 */
export function verifyToken(token: string): AuthenticatedUser {
  let claims: TokenClaims

  try {
    claims = jwt.verify(token, config.jwtPublicKey, {
      algorithms: ['RS256'],
      ignoreExpiration: false,
      clockTolerance: 30,
    }) as TokenClaims
  } catch (error) {
    throw new InvalidTokenError(error instanceof Error ? error.message : 'Invalid token.')
  }

  const id = Number.parseInt(claims.sub, 10)

  if (!Number.isInteger(id)) {
    throw new InvalidTokenError('Token subject is not a user id.')
  }

  const role = claims.role === 'admin' ? 'admin' : 'user'

  return { id, role, isAdmin: role === 'admin' }
}

/** Pull the token out of an Authorization header, if there is one. */
export function bearerFrom(header: string | undefined): string | null {
  if (!header) return null

  const [scheme, token] = header.split(' ')

  return scheme?.toLowerCase() === 'bearer' && token ? token : null
}
