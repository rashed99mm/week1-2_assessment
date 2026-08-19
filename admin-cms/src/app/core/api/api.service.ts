import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { map, type Observable } from 'rxjs'
import { environment } from '../../../environments/environment'
import type { ApiResponse } from './api-response.model'

/** Query parameters, with undefined entries dropped rather than sent as "undefined". */
export type Query = Record<string, string | number | boolean | null | undefined>

/**
 * The HTTP client every feature goes through.
 *
 * Unwraps the shared envelope so callers work with the payload rather than
 * reaching into `.data` at each call site. Errors are converted by
 * `errorInterceptor`; nothing here needs a try/catch.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient)

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http
      .get<ApiResponse<T>>(this.url(path), { params: toParams(query) })
      .pipe(map((response) => response.data))
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(this.url(path), body ?? {})
      .pipe(map((response) => response.data))
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .put<ApiResponse<T>>(this.url(path), body ?? {})
      .pipe(map((response) => response.data))
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .patch<ApiResponse<T>>(this.url(path), body ?? {})
      .pipe(map((response) => response.data))
  }

  delete<T>(path: string): Observable<T> {
    return this.http
      .delete<ApiResponse<T>>(this.url(path))
      .pipe(map((response) => response.data))
  }

  /**
   * Send multipart form data.
   *
   * Deliberately sets no Content-Type. The browser has to add it, because only
   * the browser knows the multipart boundary — setting it by hand produces a
   * body PHP cannot parse, and the request arrives looking simply empty.
   */
  postForm<T>(path: string, form: FormData): Observable<T> {
    return this.http
      .post<ApiResponse<T>>(this.url(path), form)
      .pipe(map((response) => response.data))
  }

  /** Absolute URLs pass through, so a feature can target another service. */
  private url(path: string): string {
    return path.startsWith('http') || path.startsWith('/')
      ? path
      : `${environment.apiBaseUrl}/${path}`
  }
}

function toParams(query?: Query): HttpParams {
  let params = new HttpParams()

  if (!query) return params

  for (const [key, value] of Object.entries(query)) {
    // Skipped rather than stringified: `?status=undefined` is a filter the
    // backend would try to honour.
    if (value === null || value === undefined || value === '') continue

    params = params.set(key, String(value))
  }

  return params
}
