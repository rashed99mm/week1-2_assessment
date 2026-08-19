/** The claims the CMS reads. See docs/contracts/auth-jwt.md. */
export interface JwtClaims {
  /** User id — a string in the token, per JWT convention. */
  sub: string
  role: 'user' | 'admin'
  name?: string
  email?: string
  exp: number
  iat: number
}

/**
 * Read a token's payload without verifying it.
 *
 * Verification is the server's job and cannot be done here — the browser has
 * no private key and any check it performed could be bypassed by editing the
 * page. This exists only to render a name and decide which menu items to show;
 * every actual permission is enforced by the API.
 */
export function decodeJwt(token: string | null): JwtClaims | null {
  if (!token) return null

  const [, encodedPayload] = token.split('.')
  if (!encodedPayload) return null

  try {
    const payload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=')

    return JSON.parse(atob(padded)) as JwtClaims
  } catch {
    return null
  }
}

/** Whether the token has passed its expiry, with a little slack for clock drift. */
export function isExpired(claims: JwtClaims | null, skewSeconds = 10): boolean {
  if (!claims?.exp) return true

  return claims.exp * 1000 <= Date.now() + skewSeconds * 1000
}
