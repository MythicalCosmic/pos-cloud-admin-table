<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { getDashboard } from '@/services/dashboardRequests'
import Card from '@/components/design/Card.vue'
import DashboardNotice from '@/components/dashboard/DashboardNotice.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import ReportSkeleton from '@/components/dashboard/ReportSkeleton.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import Delta from '@/components/design/Delta.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import DistributionChart from '@/components/dashboard/DistributionChart.vue'
import TimeSeriesExplorer from '@/components/dashboard/TimeSeriesExplorer.vue'
import DailyLedger from '@/components/dashboard/DailyLedger.vue'
import { fmtAbbr, fmtNum } from '@/components/design/utils/format'
import { useFormatters } from '@/composables/useFormatters'
import { useDashboardData } from '@/composables/useDashboardData'
import { buildDateParams, businessPreset } from '@/composables/useBusinessDay'
import { formatWindow } from '@/composables/useWindowLabel'
import type { Tone } from '@/components/design/utils'

// Uses real backend data for the selected reporting window.
export interface ChannelDay {
  label: string
  values: { hall: number; delivery: number; pickup: number }
}

const { t, locale } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { range: sharedRange } = useDashboardData()
const windowLabel = computed(() => formatWindow(sharedRange.value, t))

// ---------- Data shape mirroring window.DASH ----------
interface DashData {
  monthRevenue: number
  grossMargin: number
  revenue30: number[]
  expense30: number[]
  previousRevenue: number[]
  previousPeriod?: {
    revenue?: string | number
    revenue_series?: Array<string | number>
  }
  dayLabels: string[]
  channelDays: ChannelDay[]
}

interface ExpenseRecord {
  id: string | number
  amount: number
  category: string
  comment: string
  createdAt: string
  shiftId: string | number | null
  cashierName: string
}

interface ExpenseDetails {
  total: number
  rows: ExpenseRecord[]
}

const data = ref<DashData | null>(null)
const loading = ref(true)
const loadError = shallowRef<unknown>(null)
let loadedRangeKey = ''
const expenseDetails = ref<ExpenseDetails | null>(null)
const expenseDetailsLoading = ref(false)
const expenseDetailsError = ref(false)
const isHourly = computed(() => /^\d{1,2}:\d{2}$/.test(String(data.value?.dayLabels?.[0] ?? '')))

// ---------- Hero KPI strip ----------
interface HeroKpiData {
  label: string
  value: number | string
  money?: boolean
  unit?: string
  delta?: number | null
  icon?: string
  tone?: Tone
  spark?: number[]
  sub?: string
}

// BE returns Decimal arrays as strings — coerce defensively.
const toNumArr = (arr: any): number[] => Array.isArray(arr) ? arr.map(v => Number(v) || 0) : []

function orderBucketCounts(D: DashData): number[] {
  return D.channelDays.map(row =>
    (Number(row.values?.hall) || 0)
    + (Number(row.values?.delivery) || 0)
    + (Number(row.values?.pickup) || 0),
  )
}

function signedMoney(value: number) {
  return `${value >= 0 ? '+' : ''}${fmtAbbr(value)}`
}

const heroKpis = computed<HeroKpiData[]>(() => {
  const D = data.value
  if (!D)
    return []

  const revenue30 = toNumArr(D.revenue30)
  const expense30 = toNumArr(D.expense30)
  const orderBuckets = orderBucketCounts(D)
  const totalOrders = orderBuckets.reduce((sum, value) => sum + value, 0)
  const bucketCount = Math.max(1, D.dayLabels.length || orderBuckets.length)

  const averageOrders = new Intl.NumberFormat(String(locale.value), {
    maximumFractionDigits: 1,
  }).format(totalOrders / bucketCount)

  const previousRevenue = toNumArr(D.previousPeriod?.revenue_series ?? D.previousRevenue)
  const previousSum = Number(D.previousPeriod?.revenue) || previousRevenue.reduce((a, b) => a + b, 0)
  const monthRevenue = Number(D.monthRevenue) || 0

  // Diff is only meaningful if we ACTUALLY have a prior-month baseline. Otherwise
  // "+360.9M vs last month" is a confident lie — it's just the current value with
  // a green plus sign. When lastMonthSum is 0 we hide the comparison (— UZS).
  const hasPrevious = !!D.previousPeriod || previousRevenue.length > 0
  const vsPreviousDiff = monthRevenue - previousSum
  return [
    {
      label: t('Revenue · {window}', { window: windowLabel.value }),
      value: monthRevenue,
      money: true,
      unit: 'UZS',
      icon: 'wallet',
      tone: 'primary',
      spark: revenue30.slice(-14),
    },
    {
      label: t('Change vs previous period'),
      value: hasPrevious ? signedMoney(vsPreviousDiff) : '—',
      unit: hasPrevious ? 'UZS' : '',
      icon: 'trend',
      tone: hasPrevious ? (vsPreviousDiff >= 0 ? 'success' : 'error') : 'neutral',
    },
    {
      label: isHourly.value ? t('Average orders per hour') : t('Average orders per day'),
      value: averageOrders,
      icon: 'bars',
      tone: 'info',
      sub: `${t('Total Orders')}: ${fmtNum(totalOrders)}`,
    },
    {
      label: isHourly.value ? t('Peak revenue hour') : t('Peak revenue day'),
      value: revenue30.length ? Math.max(...revenue30) : 0,
      money: true,
      unit: 'UZS',
      icon: 'star',
      tone: 'warning',
    },
    {
      label: t('Expenses · {window}', { window: windowLabel.value }),
      value: expense30.reduce((a, b) => a + b, 0),
      money: true,
      unit: 'UZS',
      icon: 'receipt',
      tone: 'error',
      spark: expense30.slice(-14),
    },
  ]
})

// ---------- Category targets (bullets) ----------
interface BulletItem {
  label: string
  value: number
  target: number
}

// Real data only — bullets stay empty until BE returns category targets
// Category targets require a dedicated backend field or endpoint.
const bullets = computed<BulletItem[]>(() => [])

// ---------- Daily orders + revenue bars (sepettakip-style per-day breakdown) ----------
// Day count comes from channelDays' hall+delivery+pickup sum, revenue from
// revenue30. Each bar carries the formatted value as a top-label.
function bucketLabel(label: string): string {
  const s = label || ''
  if (/^\d{1,2}:\d{2}$/.test(s))
    return s.padStart(5, '0')
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [year, month, day] = s.split('-').map(Number)
    return new Intl.DateTimeFormat(String(locale.value), {
      day: 'numeric', month: 'short',
    }).format(new Date(year, month - 1, day))
  }
  return s
}

const ordersByDay = computed(() => {
  const D = data.value
  if (!D || !D.channelDays?.length)
    return [] as { label: string; value: number }[]
  return D.channelDays.map((d: any) => ({
    label: bucketLabel(d.label || ''),
    value: (d.values?.hall ?? 0) + (d.values?.delivery ?? 0) + (d.values?.pickup ?? 0),
  }))
})

const revenueByDay = computed(() => {
  const D = data.value
  if (!D)
    return [] as { label: string; value: number }[]
  const rev = toNumArr(D.revenue30)
  const labels = Array.isArray(D.dayLabels) ? D.dayLabels : []
  return rev.map((v, i) => ({ label: bucketLabel(labels[i] || ''), value: v }))
})

const expenseRecords = computed(() => expenseDetails.value?.rows ?? [])

function formatExpenseDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return ''
  return new Intl.DateTimeFormat(String(locale.value), {
    timeZone: 'Asia/Tashkent',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function expenseTitle(row: ExpenseRecord): string {
  return row.comment || row.category || t('Cash drawer expense')
}

function expenseMeta(row: ExpenseRecord): string {
  const parts: string[] = []
  if (row.comment && row.category)
    parts.push(row.category)
  const createdAt = formatExpenseDateTime(row.createdAt)
  if (createdAt)
    parts.push(createdAt)
  if (row.cashierName)
    parts.push(row.cashierName)
  if (row.shiftId !== null && row.shiftId !== undefined)
    parts.push(`${t('Shift')} #${row.shiftId}`)
  return parts.join(' · ')
}

const ordersChartTitle = computed(() => isHourly.value
  ? t('Orders by hour')
  : t('Daily orders'))

const orderTypeMix = computed(() => {
  const D = data.value
  if (!D)
    return [] as Array<{ label: string; value: number; color: string }>

  const totals = D.channelDays.reduce((acc, row) => {
    acc.hall += Number(row.values?.hall) || 0
    acc.delivery += Number(row.values?.delivery) || 0
    acc.pickup += Number(row.values?.pickup) || 0
    return acc
  }, { hall: 0, delivery: 0, pickup: 0 })

  return [
    { label: t('Hall'), value: totals.hall, color: 'rgb(var(--v-theme-c1))' },
    { label: t('Delivery'), value: totals.delivery, color: 'rgb(var(--v-theme-c3))' },
    { label: t('Pickup'), value: totals.pickup, color: 'rgb(var(--v-theme-c2))' },
  ].filter(row => row.value > 0)
})

// ---------- Revenue/Expense chart series ----------
// BE returns Decimal as string. Coerce before passing to LineAreaChart — maxV's
// loop does numeric > comparison, but '22720000' > '8085000' is lex (false), so
// the wrong peak is picked and the area path overshoots above viewBox.
const chartSeries = computed(() => {
  const D = data.value
  if (!D)
    return []
  return [
    { key: 'revenue', label: t('Revenue'), color: 'rgb(var(--v-theme-chart-revenue))', data: toNumArr(D.revenue30) },
    { key: 'expense', label: t('Expenses'), color: 'rgb(var(--v-theme-chart-expense))', data: toNumArr(D.expense30) },
  ]
})

// ---------- Data loader ----------
let salesRequestId = 0

function normalizeExpenseDetails(raw: any): ExpenseDetails {
  const rows = Array.isArray(raw?.expenses) ? raw.expenses : []
  return {
    total: Number(raw?.total_expense) || 0,
    rows: rows.map((row: any, index: number) => ({
      id: row?.id ?? index,
      amount: Number(row?.amount) || 0,
      category: typeof row?.category === 'string' ? row.category.trim() : '',
      comment: typeof row?.comment === 'string' ? row.comment.trim() : '',
      createdAt: typeof row?.created_at === 'string' ? row.created_at : '',
      shiftId: row?.shift_id ?? null,
      cashierName: typeof row?.cashier_name === 'string' ? row.cashier_name.trim() : '',
    })),
  }
}

function normalizeSales(raw: any): DashData {
  // BE channelDays shape: { day, hall, delivery, pickup }. FE stacked-bar
  // template uses { label, values: { hall, delivery, pickup } }. Adapt here
  // instead of touching N template bindings.
  const channelDays = Array.isArray(raw?.channelDays)
    ? raw.channelDays.map((d: any) => ({
      label: String(d.day || ''),
      values: {
        hall: Number(d.hall) || 0,
        delivery: Number(d.delivery) || 0,
        pickup: Number(d.pickup) || 0,
      },
    }))
    : []

  return {
    ...raw,
    channelDays,
    dayLabels: Array.isArray(raw?.dayLabels) ? raw.dayLabels.map(String) : [],
    previousPeriod: raw?.previous_period,
    previousRevenue: toNumArr(raw?.previous_period?.revenue_series ?? raw?.lastMonthRev),
  }
}

async function loadDashboard() {
  const requestId = ++salesRequestId

  loading.value = true
  loadError.value = null

  const rangeKey = JSON.stringify(sharedRange.value)
  if (rangeKey !== loadedRangeKey)
    data.value = null
  loadedRangeKey = rangeKey
  expenseDetailsLoading.value = true
  expenseDetailsError.value = false
  expenseDetails.value = null
  try {
    const r = sharedRange.value
    const fallback = businessPreset('30d')

    const range = (r?.from && r?.to)
      ? r
      : { ...fallback, fromTime: r?.fromTime, toTime: r?.toTime }

    const params = buildDateParams(range)
    const expenseParams: Record<string, string> = { ...params, limit: '8' }

    delete expenseParams.granularity

    const [res, expenseRes] = await Promise.all([
      getDashboard('/dashboard/sales', { params }),
      getDashboard('/dashboard/sales/expenses', { params: expenseParams }).catch(() => null),
    ])

    if (requestId !== salesRequestId)
      return
    const raw = res.data?.data ?? res.data

    data.value = normalizeSales(raw)
    if (expenseRes) {
      const expensesRaw = expenseRes.data?.data ?? expenseRes.data

      expenseDetails.value = normalizeExpenseDetails(expensesRaw)
    }
    else {
      expenseDetailsError.value = true
    }
  }
  catch (error) {
    if (requestId !== salesRequestId)
      return
    loadError.value = error
    expenseDetails.value = null
    expenseDetailsError.value = true
  }
  finally {
    if (requestId === salesRequestId) {
      loading.value = false
      expenseDetailsLoading.value = false
    }
  }
}

// Re-fetch on hub range change.

watch(sharedRange, () => { loadDashboard() })

// Localized label for the active date-picker window, interpolated into the
// range-scoped card titles below so they stop hardcoding "· 30 days".

onMounted(() => {
  loadDashboard()
})
onBeforeUnmount(() => { salesRequestId++ })
</script>

<template>
  <div
    class="sales-dash"
    :aria-busy="loading"
  >
    <DashboardNotice
      v-if="loadError"
      :error="loadError"
      :loading="loading"
      :stale="!!data"
      @retry="loadDashboard"
    />
    <!-- Loading state (DashLoading fallback) -->
    <ReportSkeleton
      v-if="loading && !data"
      :metrics="5"
    />

    <!-- Loaded state -->
    <div
      v-else-if="data"
      class="report-content"
    >
      <!-- Hero KPI strip -->
      <div class="grid sales-hero report-metrics">
        <div
          v-for="k in heroKpis"
          :key="k.label"
          class="herokpi"
        >
          <div class="herokpi__top">
            <span class="herokpi__label">{{ k.label }}</span>
            <span
              v-if="k.icon"
              class="herokpi__icon"
              :class="`t-${k.tone || 'primary'}`"
            >
              <DesignIcon
                :name="k.icon"
                :size="17"
              />
            </span>
          </div>
          <div class="herokpi__value">
            <template v-if="k.money && typeof k.value === 'number'">
              {{ formatCurrency(k.value) }}
            </template>
            <template v-else-if="typeof k.value === 'number'">
              {{ fmtNum(k.value) }}
            </template>
            <template v-else>
              {{ k.value }}
            </template>
            <span
              v-if="k.unit"
              class="herokpi__unit"
            >{{ k.unit }}</span>
          </div>
          <div
            v-if="k.sub || k.delta !== undefined"
            class="herokpi__foot"
          >
            <Delta
              v-if="k.delta !== undefined && k.delta !== null"
              :value="k.delta"
            />
            <span
              v-if="k.sub"
              class="herokpi__sub"
            >{{ k.sub }}</span>
          </div>
        </div>
      </div>

      <!-- Row 2: Revenue vs expenses + category targets -->
      <div class="grid sales-revenue-grid">
        <Card>
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Revenue vs expenses · {window}', { window: windowLabel }) }}
              </div>
              <h3 class="card__insight">
                {{ data?.grossMargin === undefined || data?.grossMargin === null ? t('Revenue vs expenses') : t('Margin holding at {pct}%', { pct: Math.round(Number(data.grossMargin) * 100) }) }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <TimeSeriesExplorer
              v-if="data"
              :categories="data.dayLabels"
              :series="chartSeries as any"
              :height="260"
              unit="UZS"
            />
          </div>
        </Card>

        <Card v-if="bullets.length">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Category targets') }}
              </div>
              <h3 class="card__title">
                {{ t('Actual vs target') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <!-- Inline Bullet fallback (replace w/ <Bullet> in phase 2) -->
            <div style="display: flex; flex-direction: column; gap: 16px;">
              <div
                v-for="(it, i) in bullets"
                :key="i"
              >
                <div
                  class="row between"
                  style="margin-bottom: 6px;"
                >
                  <span style="font-size: 13px; font-weight: 600;">{{ it.label }}</span>
                  <span
                    class="row"
                    style="gap: 8px; font-size: 12px;"
                  >
                    <span
                      class="mono"
                      style="font-weight: 700;"
                    >{{ fmtAbbr(it.value) }}</span>
                    <span class="tertiary mono">/ {{ fmtAbbr(it.target) }}</span>
                    <span
                      class="badge"
                      :class="it.value >= it.target ? 't-success' : 't-warning'"
                    >{{ Math.round(it.value / it.target * 100) }}%</span>
                  </span>
                </div>
                <div style="position: relative; height: 14px; background: rgb(var(--v-theme-chart-track)); border-radius: 99px;">
                  <div
                    :style="{
                      position: 'absolute',
                      inset: 0,
                      width: `${Math.min(100, it.value / (Math.max(it.value, it.target) * 1.25) * 100)}%`,
                      background: it.value >= it.target ? 'rgb(var(--v-theme-success))' : 'rgb(var(--v-theme-primary))',
                      borderRadius: '99px',
                    }"
                  />
                  <div
                    :style="{
                      position: 'absolute',
                      top: '-3px',
                      bottom: '-3px',
                      left: `${Math.min(100, it.target / (Math.max(it.value, it.target) * 1.25) * 100)}%`,
                      width: '3px',
                      borderRadius: '2px',
                      background: 'rgb(var(--v-theme-on-surface))',
                      opacity: 0.55,
                    }"
                    :title="t('Actual vs target')"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <DailyLedger
        v-if="data"
        :dates="data.dayLabels"
        :revenue="data.revenue30"
        :expenses="data.expense30"
        :channels="data.channelDays"
      />

      <!-- Row 3: expense summary + order-type chart. -->
      <div class="grid sales-expense-grid">
        <!-- The weekly distribution chart was removed: it did not give a reliable, range-aware insight. -->
        <Card class="sales-order-type">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Order type mix · {window}', { window: windowLabel }) }}
              </div>
              <h3 class="card__title">
                {{ t('Where orders come from') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <DistributionChart
              :data="orderTypeMix"
              :label="t('Orders')"
            />
          </div>
        </Card>

        <Card class="sales-expense-list">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('Cash drawer expenses') }}
              </div>
              <h3 class="card__title">
                {{ t('Latest expense records') }}
              </h3>
            </div>
            <strong
              v-if="expenseDetails && !expenseDetailsError"
              class="sales-expense-list__total mono"
            >{{ formatCurrency(expenseDetails.total) }}</strong>
          </div>
          <div class="card__body">
            <div
              v-if="expenseDetailsLoading"
              class="sales-expense-list__loading"
              aria-busy="true"
            >
              <Skeleton
                v-for="i in 3"
                :key="i"
                :h="34"
                w="100%"
              />
            </div>
            <ReportState
              v-else-if="expenseDetailsError"
              :title="t('Expense details unavailable')"
              :action="t('Retry')"
              error
              @action="loadDashboard"
            />
            <div
              v-else-if="expenseRecords.length"
              class="sales-expense-list__rows"
            >
              <div
                v-for="row in expenseRecords"
                :key="row.id"
                class="sales-expense-list__row"
              >
                <span class="sales-expense-list__copy">
                  <span class="sales-expense-list__name">{{ expenseTitle(row) }}</span>
                  <span
                    v-if="expenseMeta(row)"
                    class="sales-expense-list__meta"
                  >{{ expenseMeta(row) }}</span>
                </span>
                <strong class="mono">{{ formatCurrency(row.amount) }}</strong>
              </div>
            </div>
            <ReportState
              v-else
              :title="t('No expenses recorded')"
              :description="t('dash_expenses_empty_body')"
              icon="receipt"
            />
          </div>
        </Card>
      </div>

      <!-- Rows 4–5: order count and revenue each have their own row. -->
      <div
        v-if="ordersByDay.length || revenueByDay.length"
        class="grid sales-bottom-grid"
      >
        <Card v-if="ordersByDay.length">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('{window} · order count', { window: windowLabel }) }}
              </div>
              <h3 class="card__title">
                {{ ordersChartTitle }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <TimeSeriesExplorer
              :categories="ordersByDay.map(row => row.label)"
              :series="[{ key: 'orders', label: t('Orders'), data: ordersByDay.map(row => row.value) }]"
              :height="240"
              mode="bar"
              compact
            />
          </div>
        </Card>
        <Card v-if="revenueByDay.length">
          <div class="card__head">
            <div class="card__head-text">
              <div class="kpi__label">
                {{ t('{window} · revenue', { window: windowLabel }) }}
              </div>
              <h3 class="card__title">
                {{ t('Daily revenue') }}
              </h3>
            </div>
          </div>
          <div class="card__body">
            <TimeSeriesExplorer
              :categories="revenueByDay.map(row => row.label)"
              :series="[{ key: 'revenue', label: t('Revenue'), data: revenueByDay.map(row => row.value) }]"
              :height="240"
              unit="UZS"
              compact
            />
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sales-dash {
  display: block;
}

.grid {
  display: grid;
  gap: var(--sp-6);
}

.sales-hero {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

@media (max-width: 1100px) {
  .sales-hero {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .sales-hero {
    grid-template-columns: 1fr;
  }
}

/* KPI cards use the shared design-herokpi.css styles. */

/* Chart legend (re-declared scoped — matches design-shell.css). */
.chart-legend {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  color: rgb(var(--v-theme-text-secondary));
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: 0 0 10px;
}

/* Bullet — badge pills. */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: var(--r-pill);
  font-size: 11px;
  font-weight: 600;
}
.badge.t-success {
  color: rgb(var(--v-theme-success));
  background: rgb(var(--v-theme-success-weak));
}
.badge.t-warning {
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
}

/* Range-aware dashboard sections. */
.sales-revenue-grid {
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, .85fr);
}
.sales-expense-grid {
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, .85fr);
}
.sales-expense-list__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sales-expense-list__loading {
  display: grid;
  gap: 10px;
}
.sales-expense-list__total {
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-sm);
  white-space: nowrap;
}
.sales-expense-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 8px 0;
  border-bottom: 1px solid rgb(var(--v-theme-border));
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
}
.sales-expense-list__row:last-child {
  border-bottom: 0;
}
.sales-expense-list__row strong {
  color: rgb(var(--v-theme-on-surface));
  white-space: nowrap;
}
.sales-expense-list__copy {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: 2px;
}
.sales-expense-list__name {
  color: rgb(var(--v-theme-on-surface));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sales-expense-list__meta {
  overflow: hidden;
  color: rgb(var(--v-theme-text-tertiary));
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sales-order-type :deep(.donut-row) {
  justify-content: center;
}
.sales-bottom-grid {
  grid-template-columns: minmax(0, 1fr);
}

@media (max-width: 900px) {
  .sales-revenue-grid,
  .sales-expense-grid,
  .sales-bottom-grid {
    grid-template-columns: 1fr;
  }
}

.row {
  display: flex;
  align-items: center;
}
.row.between {
  justify-content: space-between;
}
.row.wrap {
  flex-wrap: wrap;
}
.mono {
  font-family: var(--font-mono);
  font-feature-settings: "tnum" 1;
}
.tertiary {
  color: rgb(var(--v-theme-text-tertiary));
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
