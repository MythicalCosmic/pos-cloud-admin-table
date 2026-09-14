<script setup lang="ts">
import '@styles/pages/dashboard.css'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { getDashboard } from '@/services/dashboardRequests'
import Card from '@/components/design/Card.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import DistributionChart from '@/components/dashboard/DistributionChart.vue'
import TimeSeriesExplorer from '@/components/dashboard/TimeSeriesExplorer.vue'
import OrderChannelChart, { type ChannelPoint } from '@/components/dashboard/OrderChannelChart.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import ReportSkeleton from '@/components/dashboard/ReportSkeleton.vue'
import TodaySalesPulse from '@/components/dashboard/TodaySalesPulse.vue'
import { fmtNum } from '@/components/design/utils/format'
import { useApiError } from '@/composables/useApiError'
import { useFormatters } from '@/composables/useFormatters'
import { useDashboardData } from '@/composables/useDashboardData'
import { buildDateParams, businessPreset } from '@/composables/useBusinessDay'
import type { Tone } from '@/components/design/utils'

const emit = defineEmits<{ (event: 'reportStatus', status: 'loading' | 'ready' | 'error' | 'stale'): void }>()
const { t, locale } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { translate: translateError } = useApiError()

// Range totals and optional breakdowns come from the existing dashboard APIs.
interface PaymentSlice {
  label: string
  value: number
  color: string
}
interface CategoryRow {
  label: string
  value: number
}
interface LiveOrder {
  id: number
  displayId: string
  type: 'HALL' | 'DELIVERY' | 'PICKUP'
  info: string
  total: number
  ts: number | null
  status: 'PREPARING' | 'READY' | 'COMPLETED'
}
interface SummaryMetric {
  label: string
  value: number | string
  money: boolean
  unit?: string
  icon: string
  metric?: MetricKey
  spark?: number[]
  sub?: string
}
interface DashData {
  monthRevenue: number
  monthOrders: number
  paidOrders: number
  cancelledOrders: number
  unitsSold: number
  avgAov: number
  grossMargin: number | null
  repeatRate: number
  monthTarget: number
  revenue30: number[]
  orders30: number[]
  channelDays: ChannelPoint[]
  aov30: number[]

  /** Revenue for the equal-length business-day window immediately before the selected one. */
  previousPeriodRev: number[]
  dayLabels: string[]
  paymentMix: PaymentSlice[]
  categories: CategoryRow[]
  liveFeed: LiveOrder[]
}

const data = ref<DashData | null>(null)
const loading = ref(true)
const loadError = shallowRef<unknown>(null)
const salesUnavailable = ref(false)

watchEffect(() => { emit('reportStatus', loading.value ? 'loading' : loadError.value ? data.value ? 'stale' : 'error' : 'ready') })

const loadErrorMessage = computed(() => translateError(loadError.value))
const categoryPeriod = ref<'range' | 'today'>('range')
const { range: sharedRange, fetchShared, fetchToday } = useDashboardData()

const isHourly = computed(() => /^\d{1,2}:\d{2}$/.test(String(data.value?.dayLabels?.[0] ?? '')))

// Primary totals stay visible together; supporting measures form a compact strip.
const supportingKpis = computed<SummaryMetric[]>(() => {
  const D = data.value
  if (!D)
    return []
  return [
    { label: t('Total Orders'), value: D.monthOrders, money: false, icon: 'receipt', metric: 'ord', spark: D.orders30.slice(-14), sub: t('dash_order_volume') },
    { label: t('Avg Order Value'), value: D.avgAov, money: true, unit: 'UZS', icon: 'trend', metric: 'aov', spark: D.aov30.slice(-14), sub: t('dash_per_paid_order') },
    { label: t('Units sold'), value: D.unitsSold, money: false, icon: 'box', sub: t('dash_selected_period') },
  ]
})

const secondaryKpis = computed(() => {
  const D = data.value
  if (!D)
    return []

  const rows = [
    { label: t('Paid orders'), value: fmtNum(D.paidOrders), tone: 'success' },
    { label: t('Cancelled orders'), value: fmtNum(D.cancelledOrders), tone: 'error' },
  ]

  if (D.dayLabels.length) {
    const total = D.orders30.reduce((sum, value) => sum + value, 0)

    rows.push({ label: isHourly.value ? t('Average orders per hour') : t('Average orders per day'), value: new Intl.NumberFormat(String(locale.value), { maximumFractionDigits: 1 }).format(total / D.dayLabels.length), tone: 'primary' })
  }
  rows.push({ label: t('Gross Margin'), value: D.grossMargin === null ? '—' : `${D.grossMargin}%`, tone: 'primary' })
  if (D.repeatRate > 0)
    rows.push({ label: t('Repeat Rate'), value: `${D.repeatRate}%`, tone: 'primary' })
  return rows
})

// Number of days in the currently-loaded range — drives the metrics-chart
// subtitle so it no longer hard-says "last 30 days" when the picker changed.
const rangeDays = computed(() => data.value?.dayLabels?.length || 0)

// A single business-day comes back as HH:00 hourly buckets — the subtitle must
// then read "hourly", not "24 days".

// Metric and comparison selections survive refreshes.
type MetricKey = 'rev' | 'ord' | 'aov'

const metricKey = ref<MetricKey>('rev')
const compare = ref(false)
const comparisonRange = ref<{ from: string; to: string } | null>(null)

/**
 * Format a date as a local calendar date. Using local noon is intentional:
 * parsing a bare date through UTC would shift it back one day in Tashkent.
 */
function formatComparisonDate(ymd: string): string {
  const [year, month, day] = String(ymd).split('-').map(Number)
  if (!year || !month || !day)
    return String(ymd)
  return new Intl.DateTimeFormat(String(locale.value), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(year, month - 1, day, 12))
}

const comparisonLabel = computed(() => {
  const range = comparisonRange.value
  if (!range)
    return t('Previous period')
  const from = formatComparisonDate(range.from)
  const to = formatComparisonDate(range.to)
  return range.from === range.to
    ? `${t('Previous period')} · ${from}`
    : `${t('Previous period')} · ${from}–${to}`
})

const metrics = computed(() => {
  const D = data.value
  if (!D)
    return [] as Array<{ key: MetricKey; label: string; data: number[] }>
  return [
    { key: 'rev' as MetricKey, label: t('Revenue'), data: D.revenue30 },
    { key: 'ord' as MetricKey, label: t('Orders'), data: D.orders30 },
    { key: 'aov' as MetricKey, label: t('Avg Order'), data: D.aov30 },
  ]
})

const activeMetric = computed(() => metrics.value.find(m => m.key === metricKey.value) || metrics.value[0])

const switchSeries = computed(() => {
  const m = activeMetric.value
  const D = data.value
  if (!m || !D)
    return []
  const base = [{ key: m.key, label: m.label, color: 'rgb(var(--v-theme-chart-revenue))', data: m.data }]
  if (compare.value && metricKey.value === 'rev' && D.previousPeriodRev?.length)
    base.push({ key: 'cmp', label: comparisonLabel.value, color: 'rgb(var(--v-theme-chart-target))', data: D.previousPeriodRev, dashed: true } as any)
  return base
})

// Target progress is hidden until a target is available.
const targetPct = computed(() => {
  const D = data.value
  if (!D || !D.monthTarget)
    return 0
  return Math.min(100, Math.round((D.monthRevenue / D.monthTarget) * 100))
})

// The feed is a server snapshot, updated by the same reporting refresh.
const feed = ref<LiveOrder[]>([])
const expandedFeed = ref(false)
const visibleFeed = computed(() => expandedFeed.value ? feed.value : feed.value.slice(0, 4))

function tone(o: LiveOrder): Tone {
  if (o.status === 'READY')
    return 'success'
  if (o.status === 'COMPLETED')
    return 'neutral'
  return 'warning'
}

function typeTone(type: LiveOrder['type']): Tone {
  if (type === 'DELIVERY')
    return 'info'
  if (type === 'PICKUP')
    return 'primary'
  return 'neutral'
}

function ago(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000))
  if (s < 60)
    return t('{n}s ago', { n: s })
  if (s < 3600)
    return t('{n}m ago', { n: Math.round(s / 60) })
  return new Intl.RelativeTimeFormat(String(locale.value), { numeric: 'auto', style: 'short' }).format(-Math.round(s / (s < 86400 ? 3600 : 86400)), s < 86400 ? 'hour' : 'day')
}

// ---------- Locale-aware insight string ----------
// Only render the period-over-period headline when we can compute it from BE
// data (current range revenue vs the immediately preceding equal-length range).
// The headline is hidden when either period is unavailable.
const insightStr = computed<string | null>(() => {
  const D = data.value
  if (!D)
    return null
  const last = Array.isArray(D.previousPeriodRev) ? D.previousPeriodRev.reduce((a, b) => a + (Number(b) || 0), 0) : 0
  const cur = Number(D.monthRevenue) || 0
  if (!last || !cur)
    return null
  const pct = Math.round(((cur - last) / last) * 100)
  if (pct >= 0)
    return t('Revenue is up {pct}% vs previous period', { pct })
  return t('Revenue is down {pct}% vs previous period', { pct: Math.abs(pct) })
})

// Missing series stay empty; an unavailable request must never look like zero sales.
function emptyDash(): DashData {
  return {
    monthRevenue: 0,
    monthOrders: 0,
    paidOrders: 0,
    cancelledOrders: 0,
    unitsSold: 0,
    avgAov: 0,
    grossMargin: null,
    repeatRate: 0,
    monthTarget: 0,
    revenue30: [],
    orders30: [],
    channelDays: [],
    aov30: [],

    // A failed comparison request must not render a fake all-zero comparison.
    previousPeriodRev: [],
    dayLabels: [],
    paymentMix: [],
    categories: [],
    liveFeed: [],
  }
}

// BE returns money as integer-so'm strings (see dashboard_service._uzs).
function asNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function channelCount(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '')
    return null
  const number = Number(value)

  return (Number.isFinite(number) && number >= 0) ? number : null
}

// Payment mix colors (kept stable across renders so DonutChart legend is consistent).
// Keys are LOWERCASED before lookup: /dashboard returns { cash, card, payme, … }
// while /dashboard/today returns { CASH, UZCARD, HUMO, … }. Matching on one case
// silently missed every key, so every slice fell back to an undefined CSS var
// (--v-theme-neutral doesn't exist) -> invalid color -> the donut painted black.
const PAY_COLORS: Record<string, string> = {
  cash: 'rgb(var(--v-theme-success))',
  card: 'rgb(var(--v-theme-info))',
  uzcard: 'rgb(var(--v-theme-info))',
  humo: 'rgb(var(--v-theme-warning))',
  payme: 'rgb(var(--v-theme-primary))',
  mixed: 'rgb(var(--v-theme-text-tertiary))',
}

// i18n key per tender; brand names (Humo/Uzcard/Payme) stay as-is.
const PAY_LABEL: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  uzcard: 'Uzcard',
  humo: 'Humo',
  payme: 'Payme',
  mixed: 'Mixed',
}

const PAY_FALLBACK = 'rgb(var(--v-theme-text-tertiary))' // a var that actually exists

/** Build donut slices from either payload shape, skipping nested objects
 *  (/dashboard ships a `card_detail: { UZCARD, HUMO, CARD }` breakdown). */
function toPaymentMix(pay: Record<string, unknown>): PaymentSlice[] {
  return Object.entries(pay ?? {})
    .filter(([, v]) => v !== null && typeof v !== 'object')
    .map(([k, v]) => {
      const key = k.toLowerCase()
      return {
        label: PAY_LABEL[key] ?? k,
        value: asNum(v),
        color: PAY_COLORS[key] ?? PAY_FALLBACK,
      }
    })
    .filter(s => s.value > 0)
}

function mapRangePayload(p: any): DashData {
  const d = emptyDash()
  const rev = asNum(p?.revenue)
  const orders = asNum(p?.paid_orders ?? p?.orders)

  d.monthRevenue = rev
  d.monthOrders = asNum(p?.orders ?? p?.today?.orders ?? orders)
  d.paidOrders = orders
  d.cancelledOrders = asNum(p?.cancelled ?? p?.cancelled_orders ?? p?.today?.cancelled)
  d.unitsSold = asNum(p?.units_sold ?? p?.today?.units_sold)
  d.avgAov = orders > 0 ? Math.round(rev / orders) : 0

  d.paymentMix = toPaymentMix(p?.payment_breakdown)

  // /dashboard (range) now returns category_stats over the selected window
  // (same shape as /dashboard/today's category_stats_today). Consume it so the
  // category card reflects the picked range instead of falling back to today.
  const cats = Array.isArray(p?.category_stats) ? p.category_stats : []

  d.categories = cats
    .map((c: any) => ({ label: String(c?.category ?? '—'), value: asNum(c?.revenue) }))
    .filter((c: { value: number }) => c.value > 0)
  return d
}

function mapTodayPayload(p: any): DashData {
  const d = emptyDash()
  const today = p?.today ?? {}
  const rev = asNum(today.revenue)
  const orders = asNum(today.paid_orders ?? today.orders)

  d.monthRevenue = rev
  d.monthOrders = asNum(p?.orders ?? p?.today?.orders ?? orders)
  d.paidOrders = orders
  d.cancelledOrders = asNum(p?.cancelled ?? p?.cancelled_orders ?? p?.today?.cancelled)
  d.unitsSold = asNum(p?.units_sold ?? p?.today?.units_sold)
  d.avgAov = orders > 0 ? Math.round(rev / orders) : 0

  d.paymentMix = toPaymentMix(p?.payment_breakdown_today)

  const cats = Array.isArray(p?.category_stats_today) ? p.category_stats_today : []

  d.categories = cats
    .map((c: any) => ({ label: String(c?.category ?? '—'), value: asNum(c?.revenue) }))
    .filter((c: { value: number }) => c.value > 0)

  return d
}

function responseData(response: any) {
  return response?.data?.data ?? response?.data ?? null
}

function numberSeries(input: unknown): number[] {
  return Array.isArray(input) ? input.map(asNum) : []
}

function applySalesBreakdown(mapped: DashData, sales: any) {
  if (!sales)
    return
  mapped.revenue30 = numberSeries(sales.revenue30)
  mapped.previousPeriodRev = numberSeries(sales.previous_period?.revenue_series)
  mapped.dayLabels = Array.isArray(sales.dayLabels) ? sales.dayLabels.map(String) : []

  const days = Array.isArray(sales.channelDays) ? sales.channelDays : []

  mapped.channelDays = days.map((day: { day?: string; hall?: unknown; delivery?: unknown; pickup?: unknown }, index: number) => ({
    label: day.day ?? mapped.dayLabels[index] ?? '',
    hall: channelCount(day.hall),
    delivery: channelCount(day.delivery),
    pickup: channelCount(day.pickup),
  }))

  mapped.orders30 = days.map((day: any) => asNum(day?.hall) + asNum(day?.delivery) + asNum(day?.pickup))

  // Missing revenue buckets must not become a made-up zero AOV series.
  if (mapped.revenue30.length && mapped.revenue30.length === mapped.orders30.length)
    mapped.aov30 = mapped.orders30.map((count, i) => count > 0 ? Math.round(mapped.revenue30[i] / count) : 0)
  const margin = Number(sales.grossMargin)
  if (sales.grossMargin !== null && sales.grossMargin !== undefined && Number.isFinite(margin))
    mapped.grossMargin = Math.round(margin * 100)
}

function applyCategoryFallback(mapped: DashData, todayPayload: any) {
  categoryPeriod.value = 'range'
  if (!todayPayload || mapped.categories.length)
    return
  const today = mapTodayPayload(todayPayload)
  if (today.categories.length) {
    mapped.categories = today.categories
    categoryPeriod.value = 'today'
  }
}

function orderTimestamp(input: string | undefined): number | null {
  if (!input)
    return null
  const timestamp = new Date(input).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function orderInfo(order: any): string {
  const table = order?.table?.name ?? order?.table_number
  return table ? `${t('Table')} ${table}` : (order?.delivery_address || '—')
}

function mapLiveOrder(order: any): LiveOrder {
  return {
    id: Number(order?.id ?? order?.display_id) || 0,
    displayId: String(order?.order_number ?? order?.display_id ?? order?.id ?? ''),
    type: ['HALL', 'DELIVERY', 'PICKUP'].includes(order?.order_type) ? order.order_type : 'HALL',
    info: orderInfo(order),
    total: asNum(order?.total_amount),
    ts: orderTimestamp(order?.created_at),
    status: order?.status === 'COMPLETED' ? 'COMPLETED' : order?.status === 'READY' ? 'READY' : 'PREPARING',
  }
}

function previousRange(sales: any): { from: string; to: string } | null {
  const range = sales?.previous_period?.range
  if (!range?.from || !range?.to)
    return null
  return { from: String(range.from), to: String(range.to) }
}

async function retryDashboard() {
  if (loading.value)
    return
  loading.value = true

  // Keep the hub's export/freshness state aligned when retrying this view.
  await fetchShared({ ...(sharedRange.value ?? businessPreset('30d')) })
}

let dashboardRequestId = 0
let loadedRangeKey = ''

async function loadDashboard() {
  const requestId = ++dashboardRequestId
  const sr = sharedRange.value
  const range = (sr?.from && sr?.to) ? sr : businessPreset('30d')
  const params = buildDateParams(range)
  const rangeKey = JSON.stringify(params)
  if (rangeKey !== loadedRangeKey) {
    data.value = null
    feed.value = []
    comparisonRange.value = null
  }
  loadedRangeKey = rangeKey
  loading.value = true
  loadError.value = null
  try {
    const [rangeRes, todayPayload, salesRes] = await Promise.all([
      getDashboard('/dashboard', { params }),
      fetchToday(),
      getDashboard('/dashboard/sales', { params }).catch(() => null),
    ])

    if (requestId !== dashboardRequestId)
      return
    const rangePayload = responseData(rangeRes) ?? {}
    const mapped = mapRangePayload(rangePayload)
    const sales = responseData(salesRes)

    salesUnavailable.value = salesRes === null

    applyCategoryFallback(mapped, todayPayload)
    applySalesBreakdown(mapped, sales)

    const liveRows = Array.isArray(rangePayload.live_order_feed) ? rangePayload.live_order_feed : []

    mapped.liveFeed = liveRows.map(mapLiveOrder).filter((order: LiveOrder) => order.id > 0)
    data.value = mapped
    comparisonRange.value = previousRange(sales)
    feed.value = mapped.liveFeed
    toast.dismiss('dashboard-load')
  }
  catch (error) {
    if (requestId !== dashboardRequestId)
      return
    loadError.value = error
    toast.error(t('Could not load dashboard'), {
      id: 'dashboard-load',
      description: loadErrorMessage.value,
      duration: 7000,
    })
  }
  finally {
    if (requestId === dashboardRequestId)
      loading.value = false
  }
}

// ---------- Sparkline (tiny inline SVG, no chart lib) ----------
function sparkPath(values: number[], w = 96, h = 30): string {
  if (!values?.length)
    return ''
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min)
      min = v
    if (v > max)
      max = v
  }
  const span = max - min || 1
  const stepX = values.length > 1 ? w / (values.length - 1) : w
  return values
    .map((v, i) => {
      const x = i * stepX
      const y = h - ((v - min) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

const selectedPeriod = computed(() => {
  const range = sharedRange.value?.from ? sharedRange.value : businessPreset('30d')
  const from = formatComparisonDate(range.from)
  return range.from === range.to ? from : `${from} – ${formatComparisonDate(range.to)}`
})

const activeValue = computed(() => {
  const D = data.value
  if (!D)
    return '—'
  return metricKey.value === 'ord'
    ? fmtNum(D.monthOrders)
    : formatCurrency(metricKey.value === 'aov' ? D.avgAov : D.monthRevenue)
})

const chartHasData = computed(() => !!data.value?.dayLabels.length && !!activeMetric.value?.data.length)
const isCompact = useMediaQuery('(max-width: 600px)')
const chartHeight = computed(() => isCompact.value ? 230 : 260)
const paymentSlices = computed(() => data.value?.paymentMix.map(slice => ({ ...slice, label: t(slice.label) })) ?? [])

watch(sharedRange, () => { loadDashboard() })
onMounted(() => { loadDashboard() })
onBeforeUnmount(() => { dashboardRequestId++ })
</script>

<template>
  <div
    class="exec-dash dashboard-overview"
    :aria-busy="loading"
  >
    <div
      v-if="loading && !data"
      class="overview-skeleton"
      role="status"
      :aria-label="t('Loading')"
    >
      <div class="summary-board">
        <Card class="summary-lead summary-lead--loading">
          <Skeleton
            :h="16"
            w="40%"
          />
          <Skeleton
            :h="44"
            w="85%"
          />
          <Skeleton
            :h="14"
            w="65%"
          />
        </Card>
        <div class="summary-metrics">
          <Card
            v-for="i in 3"
            :key="i"
            class="summary-metric"
          >
            <Skeleton
              :h="14"
              w="65%"
            />
            <Skeleton
              :h="28"
              w="80%"
            />
          </Card>
        </div>
      </div>
      <ReportSkeleton
        :metrics="0"
        overview
      />
    </div>

    <section
      v-else-if="loadError && !data"
      class="overview-unavailable"
      role="alert"
    >
      <span class="overview-empty-icon"><DesignIcon
        name="alert"
        :size="26"
      /></span>
      <h2>{{ t('Could not load dashboard') }}</h2>
      <p>{{ loadErrorMessage }}</p>
      <Button
        icon="retry"
        :loading="loading"
        @click="retryDashboard"
      >
        {{ t('Retry') }}
      </Button>
    </section>

    <div
      v-else-if="data"
      class="overview-content"
    >
      <div
        v-if="loadError"
        class="overview-stale"
        role="alert"
      >
        <DesignIcon
          name="alert"
          :size="18"
        />
        <span>{{ t('Showing the last values we had. Check your connection and try again.') }}</span>
        <Button
          size="sm"
          :loading="loading"
          @click="retryDashboard"
        >
          {{ t('Retry') }}
        </Button>
      </div>

      <section
        class="summary-board"
        :aria-label="t('Overview')"
      >
        <Card
          class="summary-lead"
          :class="{ 'is-selected': metricKey === 'rev' }"
        >
          <button
            class="summary-select"
            type="button"
            :aria-label="t('dash_show_trend', { metric: t('Revenue') })"
            :aria-pressed="metricKey === 'rev'"
            @click="metricKey = 'rev'"
          />
          <div class="summary-lead__head">
            <span>{{ t('Revenue') }}</span>
            <span class="summary-lead__icon"><DesignIcon
              name="wallet"
              :size="20"
            /></span>
          </div>
          <div class="summary-lead__amount">
            <span>{{ formatCurrency(data.monthRevenue) }}</span>
            <span class="summary-lead__unit">UZS</span>
          </div>

          <div class="summary-lead__foot">
            <span class="summary-lead__period">{{ t('dash_selected_period') }}</span>
            <svg
              v-if="data.revenue30.length > 1"
              class="summary-lead__spark"
              viewBox="0 -3 96 36"
              aria-hidden="true"
            >
              <path
                :d="sparkPath(data.revenue30)"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
        </Card>

        <div class="summary-metrics">
          <Card
            v-for="k in supportingKpis"
            :key="k.label"
            class="summary-metric"
            :class="{ 'is-selected': k.metric && metricKey === k.metric }"
          >
            <button
              v-if="k.metric"
              class="summary-select"
              type="button"
              :aria-label="t('dash_show_trend', { metric: k.label })"
              :aria-pressed="metricKey === k.metric"
              @click="metricKey = k.metric"
            />
            <div class="summary-metric__head">
              <span class="summary-metric__label">{{ k.label }}</span>
              <DesignIcon
                :name="k.icon"
                :size="17"
              />
            </div>
            <div class="summary-metric__value">
              <span>{{ k.money && typeof k.value === 'number' ? formatCurrency(k.value) : typeof k.value === 'number' ? fmtNum(k.value) : k.value }}</span>
              <span
                v-if="k.unit"
                class="summary-metric__unit"
              >{{ k.unit }}</span>
            </div>
            <div
              v-if="k.sub || (k.spark && k.spark.length > 1)"
              class="summary-metric__foot"
            >
              <span v-if="k.sub">{{ k.sub }}</span>
              <svg
                v-if="k.spark && k.spark.length > 1"
                viewBox="0 -3 96 36"
                aria-hidden="true"
              >
                <path
                  :d="sparkPath(k.spark)"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </div>
          </Card>
        </div>
      </section>

      <TodaySalesPulse />

      <div
        class="overview-context"
        :aria-label="t('dash_order_health')"
      >
        <div
          v-for="metric in secondaryKpis"
          :key="metric.label"
        >
          <i :class="`is-${metric.tone}`" /><span>{{ metric.label }}</span><strong>{{ metric.value }}</strong>
        </div>
      </div>

      <div class="overview-charts">
        <Card class="overview-panel overview-performance">
          <div class="overview-panel__head">
            <div>
              <h2>{{ t('Performance') }}</h2>
              <p>{{ isHourly ? t('dash_hourly') : rangeDays ? t('dash_daily', { n: rangeDays }) : t('dash_selected_period') }}</p>
            </div>
            <div class="overview-chart-value">
              <strong>{{ activeValue }}</strong>
              <span>{{ metricKey === 'ord' ? t('Orders') : 'UZS' }}</span>
            </div>
            <span
              v-if="loading"
              class="overview-updating"
              role="status"
            >{{ t('dash_updating') }}</span>
          </div>

          <p
            v-if="insightStr"
            class="summary-lead__insight"
          >
            <DesignIcon
              name="trend"
              :size="15"
            />{{ insightStr }}
          </p>
          <div
            v-if="chartHasData"
            class="overview-plot"
          >
            <TimeSeriesExplorer
              :categories="data.dayLabels"
              :series="switchSeries"
              :height="chartHeight"
              mode="bar"
              :unit="metricKey === 'ord' ? undefined : 'UZS'"
            >
              <template #controls>
                <div class="overview-chart-controls">
                  <div
                    class="overview-segments"
                    role="group"
                    :aria-label="t('Performance')"
                  >
                    <button
                      v-for="m in metrics"
                      :key="m.key"
                      type="button"
                      :aria-pressed="metricKey === m.key"
                      @click="metricKey = m.key"
                    >
                      {{ m.label }}
                    </button>
                  </div>
                  <button
                    v-if="data.previousPeriodRev.length && metricKey === 'rev'"
                    class="overview-compare"
                    type="button"
                    :aria-pressed="compare"
                    @click="compare = !compare"
                  >
                    <span class="overview-compare__box"><DesignIcon
                      v-if="compare"
                      name="check"
                      :size="12"
                    /></span>
                    {{ t('Compare') }}
                  </button>
                </div>
              </template>
            </TimeSeriesExplorer>
          </div>
          <ReportState
            v-else
            :title="t(salesUnavailable ? 'dash_series_unavailable' : 'dash_series_empty')"
            :description="t(salesUnavailable ? 'dash_series_unavailable_body' : 'dash_series_empty_body')"
            :action="salesUnavailable ? t('Retry') : undefined"
            :error="salesUnavailable"
            icon="trend"
            @action="retryDashboard"
          />
          <div
            v-if="compare && metricKey === 'rev' && data.previousPeriodRev.length"
            class="overview-chart-key"
          >
            <span><i />{{ t('Revenue') }}</span>
            <span><i class="is-comparison" />{{ comparisonLabel }}</span>
          </div>

          <details
            v-if="chartHasData"
            class="overview-data"
          >
            <summary>
              {{ t('dash_view_data') }}<DesignIcon
                name="chevdown"
                :size="15"
              />
            </summary>
            <div
              class="overview-data__scroll"
              tabindex="0"
              :aria-label="t('dash_view_data')"
            >
              <table>
                <caption>{{ activeMetric?.label }} · {{ selectedPeriod }}</caption>
                <thead>
                  <tr>
                    <th scope="col">
                      {{ t('Date') }}
                    </th><th scope="col">
                      {{ activeMetric?.label }}{{ metricKey !== 'ord' ? ' · UZS' : '' }}
                    </th><th
                      v-if="compare && metricKey === 'rev' && data.previousPeriodRev.length"
                      scope="col"
                    >
                      {{ comparisonLabel }} · UZS
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(label, i) in data.dayLabels"
                    :key="i"
                  >
                    <th scope="row">
                      {{ label }}
                    </th><td>{{ activeMetric?.data[i] === undefined ? '—' : fmtNum(activeMetric.data[i]) }}</td><td v-if="compare && metricKey === 'rev' && data.previousPeriodRev.length">
                      {{ data.previousPeriodRev[i] === undefined ? '—' : fmtNum(data.previousPeriodRev[i]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </Card>

        <Card class="overview-panel overview-channel-flow">
          <div class="overview-panel__head">
            <div><h2>{{ t('dash_channel_title') }}</h2><p>{{ t('dash_channel_subtitle') }}</p></div>
            <span class="overview-panel__icon"><DesignIcon
              name="grid"
              :size="18"
            /></span>
          </div>
          <OrderChannelChart
            v-if="data.channelDays.length"
            :data="data.channelDays"
          />
          <ReportState
            v-else
            :title="salesUnavailable ? t('Could not load dashboard') : t('dash_no_activity')"
            :description="salesUnavailable ? t('Check your connection and try again.') : t('Try a different date range.')"
            :error="salesUnavailable"
            :action="salesUnavailable ? t('Retry') : undefined"
            @action="retryDashboard"
          />
        </Card>

        <div class="overview-breakdowns">
          <Card class="overview-panel overview-payments">
            <div class="overview-panel__head">
              <div><h2>{{ t('Payment mix') }}</h2><p>{{ t('How guests pay') }}</p></div>
              <span class="overview-panel__icon"><DesignIcon
                name="wallet"
                :size="18"
              /></span>
            </div>
            <DistributionChart
              v-if="data.paymentMix.length"
              visual="donut"
              :data="paymentSlices"
              :label="t('Collected')"
              unit="UZS"
            />
            <ReportState
              v-else
              :title="t('dash_no_payments')"
              :description="t('Try a different date range.')"
              icon="wallet"
            />
          </Card>
          <Card class="overview-panel overview-categories">
            <div class="overview-panel__head">
              <div><h2>{{ t('Top categories') }}</h2><p>{{ categoryPeriod === 'today' ? t('Today') : t('dash_selected_period') }} · UZS</p></div>
              <span class="overview-panel__icon"><DesignIcon
                name="box"
                :size="18"
              /></span>
            </div>
            <DistributionChart
              v-if="data.categories.length"
              visual="donut"
              :limit="5"
              :data="data.categories"
              :label="t('Revenue by category')"
              unit="UZS"
            />
            <ReportState
              v-else
              :title="t('No data for this range')"
              :description="t('Try a different date range.')"
              icon="box"
            />
          </Card>
        </div>
      </div>

      <Card class="overview-panel overview-activity">
        <div class="overview-panel__head">
          <div><h2>{{ t('Recent activity') }}</h2><p>{{ t('dash_recent_orders') }}</p></div>
          <RouterLink
            class="overview-orders-link"
            to="/orders"
          >
            {{ t('dash_open_orders') }}<DesignIcon
              name="arrowright"
              :size="16"
            />
          </RouterLink>
        </div>
        <div
          v-if="feed.length"
          class="overview-feed"
        >
          <table class="overview-order-table">
            <thead>
              <tr>
                <th scope="col">
                  {{ t('Order') }}
                </th><th scope="col">
                  {{ t('Details') }}
                </th><th scope="col">
                  {{ t('Date') }}
                </th><th scope="col">
                  {{ t('Total') }} · UZS
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="o in visibleFeed"
                :key="o.id"
                class="overview-order"
              >
                <td class="overview-order__title">
                  <span
                    class="overview-order__indicator"
                    :class="`is-${o.status.toLowerCase()}`"
                  ><DesignIcon
                    :name="o.status === 'PREPARING' ? 'clock' : 'check'"
                    :size="18"
                  /></span>
                  <strong><RouterLink :to="{ path: '/orders', query: { id: o.displayId } }">#{{ o.displayId }}</RouterLink></strong>
                  <Badge :tone="typeTone(o.type)">
                    {{ t({ HALL: 'Hall', DELIVERY: 'Delivery', PICKUP: 'Pickup' }[o.type]) }}
                  </Badge>
                  <Badge :tone="tone(o)">
                    {{ t({ PREPARING: 'Preparing', READY: 'Ready', COMPLETED: 'dash_order_completed' }[o.status]) }}
                  </Badge>
                </td>
                <td
                  v-if="o.info && o.info !== '—'"
                  class="overview-order__info"
                >
                  {{ o.info }}
                </td>
                <td class="overview-order__time">
                  <time
                    v-if="o.ts !== null"
                    :datetime="new Date(o.ts).toISOString()"
                  >{{ ago(o.ts) }}</time><span v-else>—</span>
                </td>
                <td class="overview-order__amount">
                  {{ formatCurrency(o.total) }}<span>UZS</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <ReportState
          v-else
          :title="t('dash_no_recent_orders')"
          :description="t('Waiting for orders…')"
          icon="receipt"
        >
          <RouterLink
            class="overview-empty-action"
            to="/orders"
          >
            {{ t('dash_open_orders') }}<DesignIcon
              name="arrowright"
              :size="16"
            />
          </RouterLink>
        </ReportState>
        <button
          v-if="feed.length > 4"
          class="overview-feed-more"
          type="button"
          :aria-expanded="expandedFeed"
          @click="expandedFeed = !expandedFeed"
        >
          {{ expandedFeed ? t('Show less') : t('dash_all_recent', { n: feed.length }) }}<DesignIcon
            :name="expandedFeed ? 'sortup' : 'chevdown'"
            :size="16"
          />
        </button>
      </Card>

      <Card
        v-if="data.monthTarget > 0"
        class="overview-panel overview-target"
      >
        <div class="overview-panel__head">
          <h2>{{ t('Revenue goal') }}</h2><span>{{ targetPct }}% {{ t('of target') }}</span>
        </div>
        <progress
          :value="targetPct"
          max="100"
          :aria-label="t('Monthly target')"
        />
        <p>{{ formatCurrency(data.monthRevenue) }} / {{ formatCurrency(data.monthTarget) }} UZS</p>
      </Card>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
