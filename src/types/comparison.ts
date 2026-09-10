/* ============================================================
   Compare Periods — types mirroring GET /api/admins/analytics/comparison/
   (contract sent to Abrorbek via dev-bot). Money is integer so'm.
   ============================================================ */

export type Granularity = 'day' | 'week' | 'month'

export interface RangeMeta {
  start: string // YYYY-MM-DD
  end: string
  days: number
}

/** One KPI: A vs B with precomputed delta. delta_pct is null when B==0 & A>0
 *  (FE renders "New"); is_up_good drives the badge colour direction. */
export interface KpiCell {
  a: number
  b: number
  delta: number
  delta_pct: number | null
  is_up_good: boolean
}

export type KpiKey =
  | 'gross_revenue' | 'net_revenue' | 'orders' | 'items_sold'
  | 'aov' | 'avg_items_per_order' | 'discounts' | 'refunds'
  | 'gross_profit' | 'margin_pct'

export interface TimeseriesPoint {
  index: number // 1-based relative position, so A and B overlay on one axis
  date: string  // real calendar date for this index
  value: number
}
export interface RevenueTimeseries {
  granularity: Granularity
  a: TimeseriesPoint[]
  b: TimeseriesPoint[]
}

export interface CategoryRow {
  id: number
  name: string
  a_revenue: number
  b_revenue: number
  a_qty: number
  b_qty: number
  delta_pct: number | null
}

export interface ProductRow {
  id: number
  name: string
  category: string
  a_qty: number
  b_qty: number
  a_revenue: number
  b_revenue: number
  delta_pct: number | null
}

export interface MoverRow {
  name: string
  a: number
  b: number
  delta: number
  delta_pct: number | null
}

export interface HourPoint { hour: number, value: number }
export interface WeekdayPoint { weekday: number, value: number } // 0 = Mon

export interface MixSlice {
  method?: string // payment_methods
  type?: string   // order_types
  value: number
  share: number   // 0..100
}

export interface BranchRow {
  id: number
  name: string
  a: number
  b: number
  delta_pct: number | null
}

export interface ComparisonResponse {
  period_a: RangeMeta
  period_b: RangeMeta
  kpis: Partial<Record<KpiKey, KpiCell>>
  revenue_timeseries: RevenueTimeseries
  categories: CategoryRow[]
  products: ProductRow[]
  top_gainers: MoverRow[]
  top_losers: MoverRow[]
  by_hour: { a: HourPoint[], b: HourPoint[] }
  by_weekday: { a: WeekdayPoint[], b: WeekdayPoint[] }
  /** Optional hour×weekday matrices [7 weekdays (0=Mon)][24 hours] for the
   *  delta heatmap. Rendered only when present. */
  hour_weekday?: { a: number[][], b: number[][] }
  payment_methods: { a: MixSlice[], b: MixSlice[] }
  order_types: { a: MixSlice[], b: MixSlice[] }
  by_branch?: BranchRow[]
  by_cashier?: BranchRow[]
}

export interface ComparisonParams {
  a_start: string
  a_end: string
  b_start: string
  b_end: string
  granularity: Granularity
  branch_id?: number | string
  tz?: string
}

/** Comparison mode: how Period B is derived from Period A. */
export type CompareMode = 'previous_period' | 'same_period_last_year' | 'custom'
