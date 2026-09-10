/** Main API response wrapper (orders, users, categories, products, inkassa) */
export interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}

/** Pagination shape used by main API endpoints */
export interface PaginationMain {
  current_page: number
  total_pages: number
  per_page: number
  has_next: boolean
  has_previous: boolean
  total_orders?: number
  total_users?: number
  total_categories?: number
  total_products?: number
}

/** Pagination shape used by stock API endpoints */
export interface PaginationStock {
  total_items: number
  page: number
  per_page: number
}
