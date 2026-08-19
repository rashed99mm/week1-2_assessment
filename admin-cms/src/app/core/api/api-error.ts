import { HttpErrorResponse } from '@angular/common/http'
import type { ApiResponse } from './api-response.model'

/**
 * A failed API call, in the shape the rest of the app can act on.
 *
 * A port of `ApiError` from the React portal's `src/lib/api.ts`, so both
 * front-ends surface backend failures the same way.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: Record<string, string[]> | null = null,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /** Whether this carries field-level validation detail. */
  get isValidation(): boolean {
    return this.status === 422 && this.errors !== null
  }

  /**
   * Build from Angular's HttpErrorResponse.
   *
   * The body is normally the shared envelope, but not always: a proxy error,
   * a network failure, or an unexpected 500 can produce something else
   * entirely, and a client that assumed the envelope would throw while
   * handling the error.
   */
  static from(response: HttpErrorResponse): ApiError {
    const body = response.error as Partial<ApiResponse<unknown>> | string | null

    if (response.status === 0) {
      return new ApiError(
        'Could not reach the server. Check your connection and try again.',
        0,
      )
    }

    if (body && typeof body === 'object' && typeof body.message === 'string') {
      return new ApiError(body.message, response.status, body.errors ?? null)
    }

    return new ApiError(
      response.statusText || 'Something went wrong.',
      response.status,
    )
  }
}

/**
 * Flatten a validation error map into readable lines.
 *
 * A port of `formatApiErrors` from the React portal, kept identical so the
 * two front-ends report the same backend failure the same way.
 */
export function formatApiErrors(errors: Record<string, string[]> | null): string[] {
  if (!errors) return []

  return Object.entries(errors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  )
}

/** A single sentence suitable for a toast. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    const details = formatApiErrors(error.errors)
    return details.length > 0 ? details.join(' · ') : error.message
  }

  return error instanceof Error ? error.message : 'Something went wrong.'
}
