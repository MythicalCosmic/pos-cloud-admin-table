/* ============================================================
   ALPHA POS — shared dashboard data composable
   ------------------------------------------------------------
   Hub (src/pages/index.vue) hydrates a single source-of-truth for
   range-aware headline metrics and exposes them to sub-dashboards
   via this composable. Endpoints (confirmed against
   alpha_pos_server/admins/urls.py + dashboard_views.py):

     GET /dashboard/today                           → today snapshot
     GET /dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD   → range snapshot

   Both return `{ success, data: {...} }`. We unwrap to the inner `data`.

   Sub-dashboards can call `useDashboardData()` and read `.shared`
   reactively. The hub also exposes a `refresh()` to re-fetch with the
   current range.
   ============================================================ */
import { computed, ref } from 'vue'
import { getDashboard, resetDashboardFailures } from '@/services/dashboardRequests'
import { buildDateParams } from '@/composables/useBusinessDay'

export interface DashRange {
  from: string
  to: string
  preset?: string

  // Exact interval bounds. When both are present, buildDateParams sends an
  // unambiguous continuous from_at/to_at pair rather than a daily time filter.
  fromTime?: string
  toTime?: string
  fromAt?: string
  toAt?: string
}

export interface ReportingRangeMetadata {
  from?: string
  to?: string
  start_at?: string
  end_at?: string
  mode?: 'business' | 'custom' | string
  timezone?: string
  days?: number
  granularity?: 'hour' | 'day' | string
}

// Today payload shape (subset — only the fields FE consumes today).
export interface DashTodayPayload {
  today?: {
    revenue?: string | number
    paid_orders?: number
    orders?: number
    cancelled?: number
    open?: number
    units_sold?: number
    peak_hour?: number | string | {
      hour?: number | string | null
      orders?: number | string | null
      revenue?: number | string | null
    } | null
    avg_prep_seconds?: number | null
    money_entered?: string | number
  }
  payment_breakdown_today?: Record<string, string | number>
  category_stats_today?: Array<{
    category_id?: number
    category?: string
    quantity?: number
    revenue?: string | number
  }>
  top_products_today?: Array<{
    product_id?: number
    product_name?: string
    quantity?: number
    qty_sold?: number
    revenue?: string | number
  }>
  low_stock_count?: number | null
  clocked_in?: Array<{
    shift_id?: number
    user_id?: number
    name?: string | null
    start_time?: string | null
  }> | null
}

// Range payload shape (subset — only the fields FE consumes today).
export interface DashRangePayload {
  range?: ReportingRangeMetadata
  revenue?: string | number
  paid_orders?: number
  orders?: number
  cancelled?: number
  units_sold?: number
  payment_breakdown?: Record<string, string | number>
  top_products?: Array<{
    product_id?: number
    product_name?: string
    quantity?: number
    revenue?: string | number
  }>
}

// Union type — sub-dashboards inspect what they need defensively.
export type DashSharedPayload = DashTodayPayload & DashRangePayload & {
  __source?: 'today' | 'range'
}

// Module-level singletons so every consumer reads the SAME refs.
const shared = ref<DashSharedPayload | null>(null)
const loading = ref(false)
const error = ref<unknown>(null)
const lastFetchedAt = ref<number | null>(null)
const resolvedRange = ref<ReportingRangeMetadata | null>(null)
const today = ref<DashTodayPayload | null>(null)
const todayLoading = ref(false)
const todayError = ref(false)
let todayRequest: Promise<DashTodayPayload | null> | undefined

// Keep the header's current business-day snapshot independent of the selected
// reporting range. The overview also uses this same response for its fallback.
function fetchToday(): Promise<DashTodayPayload | null> {
  if (todayRequest)
    return todayRequest
  todayLoading.value = true
  todayError.value = false
  todayRequest = getDashboard('/dashboard/today')
    .then(response => {
      today.value = response.data?.data ?? response.data ?? null
      return today.value
    })
    .catch(() => {
      today.value = null
      todayError.value = true
      return null
    })
    .finally(() => {
      todayLoading.value = false
      todayRequest = undefined
    })
  return todayRequest
}

// Latest range the hub picked. Sub-dashboards watch this and re-fetch their
// own dedicated endpoints (/dashboard/sales, /analytics/products/*, …) when it
// changes. Kept as a plain object so consumers can watch (r.from, r.to).
const currentRange = ref<DashRange | null>(null)
let sharedRequestId = 0

function hasRange(range: DashRange | null | undefined): boolean {
  return !!(range && (range.from || range.to))
}

function rangeKey(range: DashRange | null | undefined): string {
  if (!range)
    return ''
  return [range.from, range.to, range.preset, range.fromTime, range.toTime, range.fromAt, range.toAt].join('|')
}

async function fetchShared(range: DashRange | null | undefined): Promise<boolean> {
  resetDashboardFailures()

  const requestId = ++sharedRequestId
  const nextRange = range ?? null
  const changedRange = rangeKey(currentRange.value) !== rangeKey(nextRange)

  loading.value = true
  error.value = null
  currentRange.value = nextRange

  // Never present the previous range's numbers under the newly selected title.
  if (changedRange) {
    shared.value = null
    resolvedRange.value = null
  }
  try {
    const source = hasRange(range) ? 'range' : 'today'

    const res = source === 'range'
      ? await getDashboard('/dashboard', { params: buildDateParams(range) })
      : await getDashboard('/dashboard/today')

    if (requestId !== sharedRequestId)
      return false
    const data = res.data?.data ?? res.data ?? {}

    shared.value = { ...data, __source: source }
    resolvedRange.value = data.range ?? data.filters ?? null
    lastFetchedAt.value = Date.now()
    return true
  }
  catch (err) {
    if (requestId !== sharedRequestId)
      return false
    error.value = err
    shared.value = null
    resolvedRange.value = null
    return false
  }
  finally {
    if (requestId === sharedRequestId)
      loading.value = false
  }
}

export function useDashboardData() {
  return {
    shared: computed(() => shared.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    lastFetchedAt: computed(() => lastFetchedAt.value),
    range: computed(() => currentRange.value),
    resolvedRange: computed(() => resolvedRange.value),
    today: computed(() => today.value),
    todayLoading: computed(() => todayLoading.value),
    todayError: computed(() => todayError.value),
    fetchToday,
    fetchShared,
    hasRange,
  }
}
