export const PRODUCT_REPORT_PRESETS = ['today', 'yesterday', 'last_7_days', 'last_month', 'current_month', 'custom'] as const
export const PRODUCT_REPORT_SORTS = ['highest_units', 'highest_revenue', 'highest_profit', 'lowest_profit', 'highest_profit_margin', 'lowest_profit_margin'] as const
export const PRODUCT_REPORT_FORMATS = ['xlsx', 'pdf', 'csv'] as const
export type ProductReportPreset = typeof PRODUCT_REPORT_PRESETS[number]
export type ProductReportSort = typeof PRODUCT_REPORT_SORTS[number]
export type ProductReportFormat = typeof PRODUCT_REPORT_FORMATS[number]
export type ReportDecimal = string | null

export interface ProductReportFilters {
  preset: ProductReportPreset
  from?: string
  to?: string
  category_id?: string
  product_id?: string
  search?: string
  cashier_id?: string
  order_type?: 'HALL' | 'DELIVERY' | 'PICKUP' | ''
  order_origin?: 'POS' | 'QR' | 'TELEGRAM' | ''
  payment_method?: 'CASH' | 'UZCARD' | 'HUMO' | 'CARD' | 'PAYME' | 'MIXED' | ''
  sort: ProductReportSort
}

export interface ReportFinancials {
  gross_sales_revenue: ReportDecimal
  refund_amount: ReportDecimal
  total_revenue: ReportDecimal
  gross_ingredient_cost: ReportDecimal
  ingredient_cost_credit: ReportDecimal
  total_ingredient_cost: ReportDecimal
  gross_profit_margin_pct: ReportDecimal
  cost_complete: boolean
  cost_coverage_pct: ReportDecimal
}

export interface ProductPerformanceRow extends ReportFinancials {
  rank: number
  product_id: number
  product_name: string
  category_id: number | null
  category_name: string
  units_sold: number
  units_refunded: number
  net_units: number
  orders_sold: number
  refund_events: number
  selling_price_per_unit: ReportDecimal
  minimum_selling_price: ReportDecimal
  maximum_selling_price: ReportDecimal
  current_catalog_price: ReportDecimal
  ingredient_cost_per_unit: ReportDecimal
  gross_profit_per_item: ReportDecimal
  gross_profit: ReportDecimal
  cost_source: string
}

export interface ProductReportSummary extends ReportFinancials {
  product_count: number
  order_count: number
  refund_event_count: number
  total_units_sold: number
  total_units_refunded: number
  net_units: number
  known_ingredient_cost: ReportDecimal
  total_gross_profit: ReportDecimal
  average_selling_price_per_unit: ReportDecimal
  average_ingredient_cost_per_unit: ReportDecimal
  products_missing_cost: number
}

export interface ProductReportAggregate extends ReportFinancials {
  category_id?: number | null
  category_name?: string
  date?: string
  business_date?: string
  product_count?: number
  total_units_sold?: number
  units_sold?: number
  net_units: number
  total_gross_profit?: ReportDecimal
  gross_profit?: ReportDecimal
}

export interface ProductPerformanceReport {
  status: string
  currency: string
  branch_id: string
  range: {
    from: string
    to: string
    start_at: string
    end_at: string
    mode: string
    timezone: string
    preset: ProductReportPreset
  }
  filters: ProductReportFilters
  summary: ProductReportSummary
  products: ProductPerformanceRow[]
  categories: ProductReportAggregate[]
  daily: ProductReportAggregate[]
  pagination: { page: number; per_page: number; total: number; total_pages: number }
  options: { presets: ProductReportPreset[]; sorts: ProductReportSort[]; formats: ProductReportFormat[] }
  coverage: { cost_complete: boolean; missing_cost_products: unknown[]; policy: string }
  generated_at: string
}

export interface ReportExport {
  blob: Blob
  filename: string
  count: string | null
  from: string | null
  to: string | null
  costComplete: boolean | null
}
