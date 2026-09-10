<script setup lang="ts">
import { getDashboard } from '@/services/dashboardRequests'
import Card from '@/components/design/Card.vue'
import DashboardNotice from '@/components/dashboard/DashboardNotice.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import ReportSkeleton from '@/components/dashboard/ReportSkeleton.vue'
import Kpi from '@/components/design/Kpi.vue'
import Delta from '@/components/design/Delta.vue'
import DistributionChart from '@/components/dashboard/DistributionChart.vue'
import CategoryMap from '@/components/dashboard/CategoryMap.vue'
import ComboPareto from '@/components/design/charts/ComboPareto.vue'
import Sparkline from '@/components/design/charts/Sparkline.vue'
import Affinity from '@/components/design/charts/Affinity.vue'
import { useFormatters } from '@/composables/useFormatters'
import { useDashboardData } from '@/composables/useDashboardData'
import { formatWindow } from '@/composables/useWindowLabel'
import { buildDateParams, businessPreset } from '@/composables/useBusinessDay'

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { range: sharedRange } = useDashboardData()
const windowLabel = computed(() => formatWindow(sharedRange.value, t))

/* ---------- Data shape (mirrors window.DASH in handoff v3) ---------- */
interface CategoryRow { label: string; value: number; units: number; color?: string }
interface ParetoRow { label: string; value: number; units: number | null; share: number | null; cumulativeShare: number | null }
interface TrendRow {
  id: string
  name: string
  units: number
  revenue: number
  delta: number | null
  spark: number[]
}
interface Overview {
  menuItems: number
  categoryCount: number
  bestSellerName: string
  bestSellerUnits: number
  units30d: number
  units30dDelta: number | null
  menuRevenue: number
  menuRevenueDelta: number | null
}
interface ProductsDashData {
  overview: Overview
  categories: CategoryRow[]
  pareto: ParetoRow[]
  paretoTotal: number | null
  trends: TrendRow[]
  prepByCategory: PrepRow[]
}
interface PrepRow { label: string; mins: number; target: number; orders: number }

const data = ref<ProductsDashData | null>(null)
const selectedCategory = ref<number | null>(null)

const leadingProducts = computed(() => (data.value?.trends ?? [])
  .filter(row => row.units > 0)
  .slice().sort((a, b) => b.units - a.units).slice(0, 5)
  .map(row => ({ label: row.name, value: row.units })))

// Keep the full reported product dataset when quantities are supplied. Older
// deployments can still show the available trend products with explicit scope.
const productsSold = computed(() => {
  const rows = data.value?.pareto ?? []
  return (rows.length && rows.every(row => row.units !== null))
    ? rows.map(row => ({ label: row.label, value: row.units ?? 0 })).sort((a, b) => b.value - a.value)
    : leadingProducts.value
})

const categoriesSold = computed(() => (data.value?.categories ?? [])
  .map(row => ({ label: row.label, value: row.units })).sort((a, b) => b.value - a.value))

const partialError = shallowRef<unknown>(null)
const loading = ref(true)
const loadError = shallowRef<unknown>(null)
let loadedRangeKey = ''

/* ---------- Hero KPI cards ---------- */
const heroKpis = computed(() => {
  const D = data.value
  if (!D)
    return []
  const o = D.overview
  return [
    {
      // This is `distinct_products_sold`, not the static catalog size.
      label: t('Products sold · {window}', { window: windowLabel.value }),
      value: o.menuItems,
      icon: 'box',
      tone: 'primary' as const,
      sub: t('across {n} categories', { n: o.categoryCount }),
    },
    {
      label: t('Best seller'),
      value: o.bestSellerName,
      icon: 'star',
      tone: 'warning' as const,
      sub: t('{n} units · {window}', { n: o.bestSellerUnits, window: windowLabel.value }),
    },
    {
      label: t('Units sold · {window}', { window: windowLabel.value }),
      value: o.units30d,
      delta: o.units30dDelta,
      icon: 'receipt',
      tone: 'info' as const,
    },
    {
      label: t('Menu revenue · {window}', { window: windowLabel.value }),
      value: o.menuRevenue,
      money: true,
      delta: o.menuRevenueDelta,
      icon: 'wallet',
      tone: 'success' as const,
    },
  ]
})

/* ---------- Donut/Treemap palette: assign --c1..--c5 + accents ---------- */
const palette = [
  'rgb(var(--v-theme-c1))',
  'rgb(var(--v-theme-c2))',
  'rgb(var(--v-theme-c3))',
  'rgb(var(--v-theme-c4))',
  'rgb(var(--v-theme-c5))',
  'rgb(var(--v-theme-primary-hover))',
]

// Toggle: revenue vs sold-units for both the treemap and donut. Same categories
// list, different scalar per slice.
const catMetric = ref<'revenue' | 'units'>('revenue')

const catMetrics = computed(() => [
  { key: 'revenue', label: t('Revenue') },
  { key: 'units', label: t('Units sold') },
] as const)

function catValue(c: CategoryRow): number {
  return catMetric.value === 'units' ? c.units : c.value
}

const categoryComposition = computed(() => {
  const cats = data.value?.categories || []
  return cats.map((c, i) => ({
    label: c.label,
    value: catValue(c),
    color: c.color || palette[i % palette.length],
  }))
})

const prepMaxMins = computed(() => Math.max(
  1,
  ...(data.value?.prepByCategory || []).map(row => Math.max(row.mins, row.target)),
))

function prepBarWidth(row: PrepRow): number {
  const scale = row.target || prepMaxMins.value
  return Math.min(100, Math.max(0, row.mins / scale * 100))
}

function prepBarColor(row: PrepRow): string {
  if (row.target && row.mins > row.target)
    return 'rgb(var(--v-theme-error))'
  return 'rgb(var(--v-theme-success))'
}

/* ---------- BE → FE shape mappers ----------
   Confirmed BE contracts (alpha_pos_server/admins/views/analytics_views.py
   + admins/services/product_analytics_service.py):
     GET /analytics/products/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
       → { range, window_days, total_revenue, total_units, distinct_products_sold,
            order_lines, orders, avg_line_revenue,
            top_products[{ product_id, product_name, qty_sold, revenue }],
            slowest_products[...] }
     GET /analytics/products/categories?from=&to=
       → { range, total_revenue, categories[{ category_id, category, units, revenue, pct_of_revenue }] }
     GET /analytics/products/pareto?from=&to=
       → { range, total_revenue, products[{ product_id, product_name, qty_sold,
           revenue, pct_of_revenue, cumulative_pct, class }], summary }
     GET /analytics/products/trends?from=&to=&top_n=5
       → { range, daily[{ date, units, revenue }],
            top_products_trend[{ product_id, product_name, total_revenue,
              points[{ date, qty, revenue }] }] }
   NOTE: BE returns money as integer-so'm STRINGS; coerce with Number().
   BE does NOT support `?range=30d` for products — compute the [from, to] window.
*/

function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

function optionalNum(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

function mapOverview(raw: any, catCount: number, deltas: { units?: number | null; revenue?: number | null }): Overview {
  const top = Array.isArray(raw?.top_products) ? raw.top_products[0] : null
  return {
    menuItems: num(raw?.distinct_products_sold),
    categoryCount: catCount,
    bestSellerName: top?.product_name ?? '—',
    bestSellerUnits: num(top?.qty_sold),
    units30d: num(raw?.total_units),
    units30dDelta: deltas.units ?? null,
    menuRevenue: num(raw?.total_revenue),
    menuRevenueDelta: deltas.revenue ?? null,
  }
}

function mapCategories(raw: any): CategoryRow[] {
  const rows = Array.isArray(raw?.categories) ? raw.categories : []
  return rows.map((c: any) => ({
    label: c?.category ?? '—',
    value: num(c?.revenue),
    units: num(c?.units),
  }))
}

function mapPareto(raw: any): ParetoRow[] {
  const products = Array.isArray(raw?.products) ? raw.products : []
  return products.map((p: any) => ({
    label: p?.product_name ?? '—',
    value: num(p?.revenue),
    units: optionalNum(p?.qty_sold),
    share: optionalNum(p?.pct_of_revenue),
    cumulativeShare: optionalNum(p?.cumulative_pct),
  }))
}

function rangeDayKeys(raw: any): string[] {
  const from = String(raw?.range?.from ?? '').slice(0, 10)
  const to = String(raw?.range?.to ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))
    return []

  let cursor = new Date(`${from}T12:00:00`)
  const end = new Date(`${to}T12:00:00`)
  const dates: string[] = []
  for (let index = 0; index < 370 && cursor <= end; index++) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)

    const next = new Date(cursor)

    next.setDate(next.getDate() + 1)
    cursor = next
  }
  return dates
}

function trendSeries(raw: any): any[] {
  return Array.isArray(raw?.top_products_trend) ? raw.top_products_trend : []
}

function trendSpark(points: any[], dates: string[]): number[] {
  if (!dates.length)
    return points.map(point => num(point?.revenue))

  const revenueByDate = new Map<string, number>(
    points.map(point => [String(point?.date ?? '').slice(0, 10), num(point?.revenue)]),
  )

  return dates.map(date => revenueByDate.get(date) ?? 0)
}

function trendDelta(total: number, previousRevenue: number | undefined): number | null {
  if (!previousRevenue || previousRevenue <= 0)
    return null

  return Math.round(((total - previousRevenue) / previousRevenue) * 1000) / 10
}

function mapTrendRow(series: any, dates: string[], previous: Map<string, number>): TrendRow {
  const points: any[] = Array.isArray(series?.points) ? series.points : []
  const id = String(series?.product_id ?? series?.product_name ?? '')
  const total = num(series?.total_revenue)
  return {
    id,
    name: series?.product_name ?? '—',
    units: points.reduce((sum, point) => sum + num(point?.qty ?? point?.quantity), 0),
    revenue: total,
    delta: trendDelta(total, previous.get(String(series?.product_id ?? ''))),
    spark: trendSpark(points, dates),
  }
}

function mapTrends(raw: any, previousRaw?: any): TrendRow[] {
  const previous = new Map<string, number>(
    trendSeries(previousRaw).map(series => [String(series?.product_id ?? ''), num(series?.total_revenue)]),
  )

  const dates = rangeDayKeys(raw)
  return trendSeries(raw).map(series => mapTrendRow(series, dates, previous))
}

/* ---------- Loader ---------- */
let productsRequestId = 0

function responseData(res: any) { return res?.data?.data ?? res?.data ?? null }
function mapPrep(opsRaw: any): PrepRow[] {
  // Operations sends camelCase prepByCategory. Keep the snake_case fallback
  // for an older deployment during a rolling release.
  const prepRows = Array.isArray(opsRaw?.prepByCategory)
    ? opsRaw.prepByCategory
    : Array.isArray(opsRaw?.prep_by_category) ? opsRaw.prep_by_category : []

  return prepRows.map((row: any) => {
    const seconds = num(row?.avg_prep_seconds)
    const minuteValue = row?.mins ?? row?.avg_prep_minutes
    return {
      label: String(row?.category ?? row?.label ?? '—'),
      mins: (minuteValue === undefined || minuteValue === null) ? seconds / 60 : num(minuteValue),
      target: num(row?.target ?? row?.target_minutes),
      orders: num(row?.orders ?? row?.count),
    }
  }).filter((row: PrepRow) => row.label !== '—')
}
function overviewDeltas(ovRaw: any, ovPrevRaw: any) {
  let deltas: { units: number | null; revenue: number | null } = { units: null, revenue: null }
  if (ovPrevRaw) {
    const prevUnits = num(ovPrevRaw.total_units)
    const prevRev = num(ovPrevRaw.total_revenue)
    const curUnits = num(ovRaw?.total_units)
    const curRev = num(ovRaw?.total_revenue)

    deltas = {
      units: prevUnits > 0 ? Math.round(((curUnits - prevUnits) / prevUnits) * 1000) / 10 : null,
      revenue: prevRev > 0 ? Math.round(((curRev - prevRev) / prevRev) * 1000) / 10 : null,
    }
  }

  return deltas
}
async function loadPrevious(trRaw: any) {
  const previousQuery = trRaw?.previous_period?.query

  const previousParams = (previousQuery?.datetime_from && previousQuery?.datetime_to)
    ? buildDateParams({
      fromAt: String(previousQuery.datetime_from),
      toAt: String(previousQuery.datetime_to),
    })
    : null

  return previousParams
    ? await Promise.all([
      getDashboard('/analytics/products/overview', { params: previousParams }).catch(() => null),
      getDashboard('/analytics/products/trends', { params: { ...previousParams, top_n: 50 } }).catch(() => null),
    ])
    : [null, null]
}

async function loadDashboard() {
  const requestId = ++productsRequestId
  const optionalErrors: unknown[] = []
  const optional = (error: unknown) => { optionalErrors.push(error); return null }

  loading.value = true
  loadError.value = null
  partialError.value = null

  const rangeKey = JSON.stringify(sharedRange.value)
  if (rangeKey !== loadedRangeKey)
    data.value = null
  loadedRangeKey = rangeKey
  try {
    const sr = sharedRange.value
    const range = (sr?.from && sr?.to) ? sr : businessPreset('30d')
    const curParams = buildDateParams(range)

    const [ovRes, catRes, parRes, trRes, opsRes] = await Promise.all([
      getDashboard('/analytics/products/overview', { params: curParams }),
      getDashboard('/analytics/products/categories', { params: curParams }).catch(optional),
      getDashboard('/analytics/products/pareto', { params: curParams }).catch(optional),
      getDashboard('/analytics/products/trends', { params: { ...curParams, top_n: 6 } }).catch(optional),

      // The useful category-speed insight used to be isolated on Operations.
      // Keep it with the product/category decisions it informs.
      getDashboard('/dashboard/operations', { params: curParams }).catch(() => null),
    ])

    const ovRaw = responseData(ovRes)
    const catRaw = responseData(catRes)
    const parRaw = responseData(parRes)
    const trRaw = responseData(trRes)
    if (requestId !== productsRequestId)
      return
    const [ovPrevRes, trPrevRes] = await loadPrevious(trRaw)

    if (requestId !== productsRequestId)
      return
    const ovPrevRaw = responseData(ovPrevRes)
    const trPrevRaw = responseData(trPrevRes)
    const opsRaw = responseData(opsRes)

    const prepByCategory = mapPrep(opsRaw)

    const categories = mapCategories(catRaw)
    const deltas = overviewDeltas(ovRaw, ovPrevRaw)

    partialError.value = optionalErrors[0] ?? null
    data.value = {
      overview: mapOverview(ovRaw, categories.length, deltas),
      categories,
      pareto: mapPareto(parRaw),
      paretoTotal: optionalNum(parRaw?.total_revenue),
      trends: mapTrends(trRaw, trPrevRaw),
      prepByCategory,
    }
  }
  catch (err) {
    if (requestId !== productsRequestId)
      return
    loadError.value = err
  }
  finally {
    if (requestId === productsRequestId)
      loading.value = false
  }
}

watch(sharedRange, () => { loadDashboard() })

// Localized label for the active date-picker window (see useWindowLabel).

onMounted(() => {
  loadDashboard()
})
onBeforeUnmount(() => { productsRequestId++ })
</script>

<template>
  <div
    class="dashprod"
    :aria-busy="loading"
  >
    <DashboardNotice
      v-if="loadError"
      :error="loadError"
      :loading="loading"
      :stale="!!data"
      @retry="loadDashboard"
    />
    <DashboardNotice
      v-if="partialError"
      :error="partialError"
      partial
      :loading="loading"
      @retry="loadDashboard"
    />
    <!-- Loading state — skeletons mirror final layout shape -->
    <ReportSkeleton
      v-if="loading && !data"
      :metrics="4"
    />

    <!-- Loaded state -->
    <div
      v-else-if="data"
      class="report-content"
    >
      <!-- 4-up hero KPIs -->
      <div class="grid cols-4 report-metrics">
        <Kpi
          v-for="k in heroKpis"
          :key="k.label"
          :data="k as any"
        />
      </div>

      <!-- Two unit-share charts use their complete available datasets. -->
      <div class="grid dashprod-grid--mix dashprod-distributions">
        <Card class="product-unit-pie">
          <div class="card__head">
            <div class="card__head-text">
              <h3 class="card__title">
                {{ t('dash_products_sold') }}
              </h3><p class="dashprod-leading-hint">
                {{ t('dash_product_units_scope', { n: productsSold.length }) }}
              </p>
            </div>
          </div>
          <div class="card__body">
            <DistributionChart
              :data="productsSold"
              :label="t('Units sold')"
              :unit="t('Units sold')"
              :explore-label="t('dash_product_select')"
              :limit="5"
              visual="donut"
            />
          </div>
        </Card>

        <Card class="category-unit-pie">
          <div class="card__head">
            <div class="card__head-text">
              <h3 class="card__title">
                {{ t('dash_categories_sold') }}
              </h3>
              <p class="dashprod-leading-hint">
                {{ t('dash_category_units_scope', { n: categoriesSold.length }) }}
              </p>
            </div>
          </div>
          <div class="card__body">
            <DistributionChart
              :data="categoriesSold"
              :label="t('Units sold')"
              :unit="t('Units sold')"
              :explore-label="t('Categories')"
              :limit="5"
              visual="donut"
            />
          </div>
        </Card>
      </div>

      <div class="grid dashprod-grid--kitchen">
        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ catMetric === 'units' ? t('Sold units composition') : t('Revenue composition') }}
              </div>
              <h3 class="card__insight">
                {{ t('dash_category_map') }}
              </h3>
            </div>
            <div
              class="seg"
              role="group"
              :aria-label="t('Revenue composition')"
              style="align-self: flex-start;"
            >
              <button
                v-for="m in catMetrics"
                :key="m.key"
                type="button"
                class="seg__btn"
                :class="{ 'is-active': catMetric === m.key }"
                :aria-pressed="catMetric === m.key"
                @click="catMetric = m.key"
              >
                {{ m.label }}
              </button>
            </div>
          </div>
          <div class="card__body product-category-analysis">
            <CategoryMap
              :data="categoryComposition"
              :selected-index="selectedCategory"
              :unit="catMetric === 'units' ? t('Units sold') : 'UZS'"
              @select="selectedCategory = $event"
            />
            <DistributionChart
              class="product-category-distribution"
              visual="bars"
              :limit="5"
              :data="categoryComposition"
              :label="t('Categories')"
              :unit="catMetric === 'units' ? t('Units sold') : 'UZS'"
              ranked
              :selected-index="selectedCategory"
              @select="selectedCategory = $event"
            />
          </div>
        </Card>

        <Card v-if="data?.prepByCategory?.length">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Avg prep time by category') }}
              </div>
              <h3 class="card__title">
                {{ t('Kitchen speed · {window}', { window: windowLabel }) }}
              </h3>
            </div>
          </div>
          <div class="card__body prep-list">
            <div
              v-for="row in data.prepByCategory"
              :key="row.label"
            >
              <div class="prep-list__head">
                <span style="font-size: 13px; font-weight: 600;">{{ row.label }}</span>
                <span
                  class="mono"
                  style="font-size: 12px; font-weight: 700;"
                >
                  {{ row.mins.toFixed(1) }}m<span v-if="row.target"> · {{ t('Target') }} {{ row.target }}m</span><span v-if="row.orders"> · {{ row.orders }} {{ t('Orders') }}</span>
                </span>
              </div>
              <div style="height: 10px; border-radius: 999px; background: rgb(var(--v-theme-chart-track)); overflow: hidden;">
                <div :style="{ width: `${prepBarWidth(row)}%`, height: '100%', borderRadius: 'inherit', background: prepBarColor(row) }" />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <!-- Frequently bought together — switchable views -->
      <Affinity
        :loading="loading"
        :range="sharedRange"
        :window-label="windowLabel"
      />

      <!-- Pareto + sparkline-trends table -->
      <div class="grid dashprod-grid--pareto">
        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Pareto analysis') }}
              </div>
              <h3 class="card__insight">
                {{ t('dash_revenue_concentration') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <ComboPareto
              :data="data.pareto"
              :total-revenue="data.paretoTotal"
              :height="230"
            />
          </div>
        </Card>
        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Product trends · {window}', { window: windowLabel }) }}
              </div>
              <h3 class="card__title">
                {{ t('Movers & shakers') }}
              </h3>
            </div>
          </div>
          <div class="card__divider" />
          <div
            class="dashprod-tablewrap"
            tabindex="0"
            :aria-label="t('Product trends · {window}', { window: windowLabel })"
          >
            <table class="dtable sparktable">
              <thead>
                <tr>
                  <th>{{ t('Product') }}</th>
                  <th class="num col-units">
                    {{ t('Units sold') }}
                  </th>
                  <th class="col-spark">
                    {{ t('Trend') }}
                  </th>
                  <th class="num">
                    {{ t('Revenue') }}
                  </th>
                  <th class="num col-delta">
                    {{ t('Change') }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!data?.trends?.length">
                  <td
                    colspan="5"
                    style="padding: 24px; text-align: center; color: rgb(var(--v-theme-text-secondary));"
                  >
                    <ReportState
                      :title="t('No products yet')"
                      :description="t('Try a different date range.')"
                      icon="box"
                    />
                  </td>
                </tr>
                <tr
                  v-for="p in data?.trends || []"
                  :key="p.id"
                >
                  <td class="cell-strong">
                    {{ p.name }}
                  </td>
                  <td class="num mono">
                    {{ p.units }}
                  </td>
                  <td class="col-spark">
                    <Sparkline
                      :data="p.spark"
                      :width="100"
                      :height="28"
                      color-by-trend
                      :dot="false"
                    />
                  </td>
                  <td class="num mono cell-strong">
                    {{ formatCurrency(p.revenue) }}
                  </td>
                  <td class="num">
                    <Delta
                      v-if="p.delta !== null"
                      :value="p.delta"
                    />
                    <span
                      v-else
                      class="muted"
                      style="font-size: 12px;"
                    >{{ t('No prior data') }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashprod {
  display: block;
}
.sk-box {
  background: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 4px;
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
