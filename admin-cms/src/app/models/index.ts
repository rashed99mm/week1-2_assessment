/**
 * The domain, as the API returns it.
 *
 * Mirrors `frontend/src/types/index.ts` so both front-ends describe the same
 * backend the same way. Money is a string throughout — Laravel's `decimal:2`
 * cast emits one, and parsing it into a JavaScript number would reintroduce
 * exactly the float drift the string exists to prevent.
 */

export type EventStatus = 'draft' | 'published' | 'cancelled'

export interface EventType {
  id: number
  name: string
  slug: string
  is_online: boolean
  seating_model: 'assigned' | 'general'
  created_at?: string
  updated_at?: string
}

export interface TicketEvent {
  id: number
  title: string
  description: string | null
  venue: string | null
  event_type_id: number | null
  event_type?: EventType | null
  cover_image_path: string | null
  cover_image_url: string | null
  starts_at: string
  ends_at: string | null
  total_tickets: number
  status: EventStatus
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
}

export interface TicketType {
  id: number
  event_id: number
  name: string
  /** Decimal string, e.g. "75.00". */
  price: string
  quantity: number
  created_at?: string
  updated_at?: string
}

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled'

export interface Payment {
  id: number
  order_id: number
  /** Decimal string. */
  amount: string
  currency: string
  status: string
  gateway_reference: string | null
  gateway_payment_id: number | null
  paid_at: string | null
  created_at?: string
}

export interface Order {
  id: number
  user_id: number | null
  event_id: number
  ticket_type_id: number
  customer_name: string
  customer_email: string
  quantity: number
  /** Decimal strings. */
  unit_price: string
  total_amount: string
  status: OrderStatus
  expires_at: string | null
  created_at?: string
  updated_at?: string
  event?: TicketEvent
  ticket_type?: TicketType
  payments?: Payment[]
  user?: AdminUser | null
}

export type UserRole = 'user' | 'admin'

export interface AdminUser {
  id: number
  name: string
  email: string
  role: UserRole
  orders_count?: number
  created_at?: string
}

export interface Notification {
  _id: string
  userId: number | null
  audience: 'user' | 'admin'
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export interface KpiSummary {
  total_revenue: string | number
  net_revenue: string | number
  refunded_amount: string | number
  tickets_sold: number
  orders_total: number
  orders_paid: number
  conversion_rate: number
  avg_order_value: string | number
  currency: string
}

export interface RevenuePoint {
  period: string
  gross_revenue: string | number
  net_revenue: string | number
  refunded_amount: string | number
  tickets_sold: number
  orders_paid: number
}

export interface EventSales {
  event_id: number
  event_title: string
  tickets_sold: number
  gross_revenue: string | number
  net_revenue: string | number
  orders: number
}

export interface OrderFunnel {
  created: number
  pending: number
  paid: number
  failed: number
  refunded: number
  cancelled: number
  paid_rate: number
  failure_rate: number
}

export interface TopEvent {
  event_id: number
  title: string
  venue: string | null
  starts_at: string | null
  tickets_sold: number
  revenue: string | number
  /** Null when the event's capacity is unknown — not zero. */
  sell_through: number | null
}
