/**
 * The response envelope shared by every HTTP API in the system.
 *
 * Mirrors tickets-backend's ApiResponse and the payment gateway's
 * ApiResponse[T] so a client that can parse one can parse all of them.
 * See docs/contracts/api-response.md.
 */
export interface ApiResponse<T> {
  success: boolean
  message: string
  status_code: number
  data: T | null
  errors: Record<string, string[]> | null
}

export function ok<T>(data: T, message = 'Success', statusCode = 200): ApiResponse<T> {
  return { success: true, message, status_code: statusCode, data, errors: null }
}

export function fail(
  message: string,
  statusCode = 400,
  errors: Record<string, string[]> | null = null,
): ApiResponse<never> {
  return { success: false, message, status_code: statusCode, data: null, errors }
}

/**
 * Laravel's paginator shape, reproduced field for field.
 *
 * Only the fields clients actually read are populated. The `*_url` and `links`
 * entries exist on the wire for compatibility but nothing renders them — every
 * consumer pages using `current_page` and `last_page`.
 */
export interface Paginated<T> {
  current_page: number
  data: T[]
  first_page_url: string | null
  from: number | null
  last_page: number
  last_page_url: string | null
  links: []
  next_page_url: string | null
  path: string
  per_page: number
  prev_page_url: string | null
  to: number | null
  total: number
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  perPage: number,
  path: string,
): Paginated<T> {
  const lastPage = Math.max(1, Math.ceil(total / perPage))

  return {
    current_page: page,
    data: items,
    first_page_url: `${path}?page=1`,
    from: items.length > 0 ? (page - 1) * perPage + 1 : null,
    last_page: lastPage,
    last_page_url: `${path}?page=${lastPage}`,
    links: [],
    next_page_url: page < lastPage ? `${path}?page=${page + 1}` : null,
    path,
    per_page: perPage,
    prev_page_url: page > 1 ? `${path}?page=${page - 1}` : null,
    to: items.length > 0 ? (page - 1) * perPage + items.length : null,
    total,
  }
}
