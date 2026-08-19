import { inject } from '@angular/core'
import { Router, type CanActivateFn } from '@angular/router'
import { AuthService } from '../auth/auth.service'

/** Keep an already-signed-in administrator off the login screen. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService)
  const router = inject(Router)

  return auth.isAuthenticated() && auth.isAdmin()
    ? router.createUrlTree(['/dashboard'])
    : true
}
