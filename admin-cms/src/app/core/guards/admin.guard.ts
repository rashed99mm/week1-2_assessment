import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { AuthService } from '../auth/auth.service'

/**
 * Allow only signed-in administrators past.
 *
 * Applied to the shell route, so every child inherits it. This is a
 * convenience, not a security boundary: the token lives in the browser and
 * anything decided here could be bypassed by editing the page. Every endpoint
 * enforces the same rule server-side.
 */
export const adminGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService)
  const router = inject(Router)

  if (auth.isAuthenticated() && auth.isAdmin()) {
    return true
  }

  // Carry where they were going, so signing in returns them there.
  return router.createUrlTree(['/login'], {
    queryParams: state.url === '/' ? {} : { redirect: state.url },
  })
}
