import type { HttpInterceptorFn } from '@angular/common/http'
import { HttpErrorResponse } from '@angular/common/http'
import { catchError, throwError } from 'rxjs'
import { ApiError } from '../api/api-error'

/**
 * Convert transport failures into ApiError.
 *
 * Runs last, so every subscriber sees one error type carrying the backend's
 * own message and validation map, rather than an HttpErrorResponse each
 * feature would have to unpack for itself.
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) =>
      throwError(() =>
        error instanceof HttpErrorResponse ? ApiError.from(error) : error,
      ),
    ),
  )
