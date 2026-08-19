/**
 * The response envelope every API in this system emits.
 *
 * Laravel, the payment gateway, the notification service and the analytics
 * service all produce this shape, so one client type covers all of them.
 * See docs/contracts/api-response.md.
 */
export interface ApiResponse<T> {
  success: boolean
  message: string
  status_code: number
  data: T
  errors: Record<string, string[]> | null
}

/**
 * Laravel's paginator, reproduced by every paginated endpoint in the system.
 *
 * Note the nesting: `data.data` is the item array. That is Laravel's shape and
 * not worth diverging from for cosmetics.
 */
export interface Paginated<T> {
  current_page: number
  data: T[]
  first_page_url: string | null
  from: number | null
  last_page: number
  last_page_url: string | null
  links: { url: string | null; label: string; active: boolean }[]
  next_page_url: string | null
  path: string
  per_page: number
  prev_page_url: string | null
  to: number | null
  total: number
}

/** An empty page, for initial state before the first load resolves. */
export function emptyPage<T>(perPage = 15): Paginated<T> {
  return {
    current_page: 1,
    data: [],
    first_page_url: null,
    from: null,
    last_page: 1,
    last_page_url: null,
    links: [],
    next_page_url: null,
    path: '',
    per_page: perPage,
    prev_page_url: null,
    to: null,
    total: 0,
  }
}
