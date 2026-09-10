export type OrderStatus = 'OPEN' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELED'

export interface OrderItem {
  id: number
  product__id: number
  product__name: string
  product__category__id: number
  product__category__name: string
  quantity: number
  detail: string | null
  price: string
  ready_at: string | null
}

export interface Order {
  id: number
  display_id: string
  order_number: number | null
  order_type: string
  phone_number: string | null
  description: string | null
  cashier: { id: number; name: string } | null
  status: OrderStatus
  is_paid: boolean
  total_amount: string
  items_count: string
  items: OrderItem[]
  paid_at: string | null
  ready_at: string | null
  created_at: string
  updated_at: string
}

export interface OrderStats {
  total_orders: number
  preparing_orders: number
  ready_orders: number
  cancelled_orders: number
  paid_orders: number
  unpaid_orders: number
  total_revenue: string
  average_preparation_time_seconds: number | null
  average_preparation_time_formatted: string | null
}

export interface OrdersListResponse {
  orders: Order[]
  filters: {
    statuses: string[]
    category_ids: string[]
    payment_status: string | null
  }
  pagination: {
    current_page: number
    total_pages: number
    total_orders: number
    per_page: number
    has_next: boolean
    has_previous: boolean
  }
}
