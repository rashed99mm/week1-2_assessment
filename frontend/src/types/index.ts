export interface User {
  id: number
  name: string
  email: string
  /** 'user' | 'admin'. Decides only whether the CMS link is offered — every
      permission is enforced by the API. */
  role: 'user' | 'admin'
}

export interface EventType {
  id: number
  name: string
  slug: string
  is_online: boolean
  seating_model: 'assigned' | 'general'
  created_at?: string
  updated_at?: string
}

export interface Event {
  id: number
  title: string
  description: string | null
  venue: string | null
  event_type_id: number | null
  /** Path on the backend's public disk; null when the event has no cover. */
  cover_image_path?: string | null
  /** Absolute URL of the cover image, or null to fall back to the poster art. */
  cover_image_url?: string | null
  starts_at: string
  ends_at: string | null
  total_tickets: number
  status: string
  deleted_at: string | null
  created_at?: string
  updated_at?: string
  ticket_types?: TicketType[]
  event_type?: EventType | null
}

export interface AvailabilityTicketType {
  ticket_type_id: number
  name: string
  price: string
  quantity: number
  sold: number
}

export interface Availability {
  event_id: number
  event_type: EventType | null
  ticket_types: AvailabilityTicketType[]
}

export interface TicketType {
  id: number
  event_id: number
  name: string
  price: string
  quantity: number
  created_at?: string
  updated_at?: string
}

export interface Payment {
  id: number
  order_id: number
  amount: string
  currency: string
  status: string
  gateway_reference: string | null
  paid_at: string | null
  created_at?: string
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

export interface Order {
  id: number
  event_id: number
  ticket_type_id: number
  customer_name: string
  customer_email: string
  quantity: number
  unit_price: string
  total_amount: string
  status: OrderStatus
  created_at?: string
  updated_at?: string
  event?: Event
  ticket_type?: TicketType
  payments?: Payment[]
}

export interface PaginationLinks {
  first: string | null
  last: string | null
  prev: string | null
  next: string | null
}

export interface Paginated<T> {
  current_page: number
  data: T[]
  first_page_url: string | null
  from: number | null
  last_page: number
  last_page_url: string | null
  links: Array<{ url: string | null; label: string; active: boolean }>
  next_page_url: string | null
  path: string
  per_page: number
  prev_page_url: string | null
  to: number | null
  total: number
}

export interface ApiResponse<T> {
  success: boolean
  message: string
  status_code: number
  data: T
  errors: Record<string, string[]> | null
}

export interface AuthResult {
  user: User
  token: string
}

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload extends LoginPayload {
  name: string
  password_confirmation: string
}

export interface StoreEventPayload {
  title: string
  description?: string
  venue?: string
  starts_at: string
  ends_at?: string
  total_tickets?: number
  status?: string
}

export interface StoreTicketTypePayload {
  event_id: number
  name: string
  price: number
  quantity: number
}

export interface StoreOrderPayload {
  ticket_type_id: number
  customer_name: string
  customer_email: string
  quantity: number
}

export interface PayOrderPayload {
  card_token: string
}
