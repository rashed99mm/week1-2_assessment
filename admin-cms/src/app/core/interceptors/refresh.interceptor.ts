import type { HttpEvent, HttpInterceptorFn, HttpRequest } from '@angular/common/http'
import { inject } from '@angular/core'
import { Router } from '@angular/router'
import { BehaviorSubject, catchError, filter, from, switchMap, take, throwError, type Observable } from 'rxjs'
import { ApiError } from '../api/api-error'
import { AuthService } from '../auth/auth.service'

/**
 * Refresh an expired token once, and replay the request that discovered it.
 *
 * Three details make this work, and omitting any one produces a bug that only
 * appears after the token's first hour:
 *
 * 1. **Single flight.** A dashboard fires several requests at once, so several
 *    401s arrive together. Each starting its own refresh would blacklist the
 *    others' new tokens as fast as they were issued. The first 401 refreshes;
 *    the rest wait on it.
 *
 * 2. **Replay with the NEW token.** Laravel blacklists the old token when it
 *    issues a replacement, so a retry that reuses the original header 401s
 *    again — forever.
 *
 * 3. **Retry once, then stop.** The auth endpoints are excluded outright: a
 *    401 from /auth/refresh means the refresh window itself has closed, and
 *    retrying it is how a loop starts.
 */

/** null while a refresh is in flight; the new token once it resolves. */
const refreshed$ = new BehaviorSubject<string | null>(null)
let refreshing = false

export const refreshInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService)
  const router = inject(Router)

  return next(request).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof ApiError) || error.status !== 401 || isAuthRoute(request)) {
        return throwError(() => error)
      }

      if (refreshing) {
        // Wait for the in-flight refresh, then replay with its token.
        return refreshed$.pipe(
          filter((token): token is string => token !== null),
          take(1),
          switchMap((token) => next(withToken(request, token))),
        )
      }

      refreshing = true
      refreshed$.next(null)

      return from(auth.refresh()).pipe(
        switchMap((token) => {
          refreshing = false
          refreshed$.next(token)

          return next(withToken(request, token))
        }),
        catchError((refreshError: unknown) => {
          // The refresh window has closed. Nothing left to try.
          refreshing = false
          auth.clearSession()

          void router.navigate(['/login'], {
            queryParams: { redirect: router.url },
          })

          return throwError(() => refreshError)
        }),
      )
    }),
  )
}

function withToken(request: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
}

/**
 * Whether this request is part of the auth flow itself.
 *
 * Login and refresh must never trigger a refresh — that is the loop.
 */
function isAuthRoute(request: HttpRequest<unknown>): boolean {
  return (
    request.url.includes('/auth/refresh') ||
    request.url.includes('/auth/login') ||
    request.url.includes('/auth/logout')
  )
}

/** Test seam: clear the module-level single-flight state between tests. */
export function resetRefreshState(): void {
  refreshing = false
  refreshed$.next(null)
}

export type { HttpEvent, Observable }
