import type { HttpInterceptorFn } from '@angular/common/http'
import { inject } from '@angular/core'
import { AuthService } from '../auth/auth.service'

/**
 * Attach the bearer token to outgoing requests.
 *
 * Only the Authorization header is added. In particular this must never set
 * Content-Type: a FormData body needs the browser to supply it along with the
 * multipart boundary, and overriding it makes an event update arrive at
 * Laravel looking empty.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = inject(AuthService).token()

  if (!token || request.headers.has('Authorization')) {
    return next(request)
  }

  return next(
    request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  )
}
