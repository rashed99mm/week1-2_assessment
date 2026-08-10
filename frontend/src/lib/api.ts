import { getToken, clearToken } from './auth'
import type { ApiResponse } from '../types'

export class ApiError extends Error {
  status: number
  errors: Record<string, string[]> | null

  constructor(message: string, status: number, errors: Record<string, string[]> | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors
  }
}

let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

/**
 * FormData is passed through untouched so file uploads work; everything else is
 * serialized as JSON, which is what every existing caller relies on.
 */
function toBody(data: unknown): BodyInit | undefined {
  if (data === undefined) return undefined
  if (data instanceof FormData) return data
  return JSON.stringify(data)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(options.headers)
  headers.set('Accept', 'application/json')
  // Never set Content-Type for FormData: the browser has to append the
  // multipart boundary itself, and an explicit header stops PHP parsing it.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, { ...options, headers })

  let body: ApiResponse<T> | null = null
  try {
    body = (await response.json()) as ApiResponse<T>
  } catch {
    body = null
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearToken()
      onUnauthorized?.()
    }
    throw new ApiError(
      body?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body?.errors ?? null,
    )
  }

  if (body === null) {
    throw new ApiError('Received an empty response from the server.', response.status, null)
  }

  return body.data
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: toBody(data) }),
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: toBody(data) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export function formatApiErrors(errors: Record<string, string[]> | null): string[] {
  if (!errors) return []
  return Object.entries(errors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  )
}
