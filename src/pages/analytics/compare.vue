<script setup lang="ts">
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import StateFill from '@/components/design/StateFill.vue'
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import CategoryComparisonChart from '@/components/analytics/compare/CategoryComparisonChart.vue'
import ComparisonControlBar from '@/components/analytics/compare/ComparisonControlBar.vue'
import ComparisonTable from '@/components/analytics/compare/ComparisonTable.vue'
import DeltaHeatmap from '@/components/analytics/compare/DeltaHeatmap.vue'
import HourlyPatternChart from '@/components/analytics/compare/HourlyPatternChart.vue'
import KpiScorecardRow from '@/components/analytics/compare/KpiScorecardRow.vue'
import MixDonutPair from '@/components/analytics/compare/MixDonutPair.vue'
import RevenueTrendChart from '@/components/analytics/compare/RevenueTrendChart.vue'
import TopMoversPanel from '@/components/analytics/compare/TopMoversPanel.vue'
import TopProductsChart from '@/components/analytics/compare/TopProductsChart.vue'
import WeekdayPatternChart from '@/components/analytics/compare/WeekdayPatternChart.vue'
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'
import { businessPreset } from '@/composables/useBusinessDay'
import { dayCount, resolveBFromMode } from '@/composables/useComparison'
import { fmtInt, fmtUZSUnit } from '@/composables/useCurrency'
import { useApiError } from '@/composables/useApiError'
import { getProductComparisonMock } from '@/mocks/productComparisonMock'
import {
  type ComparisonProductOption,
  comparisonEndpointUnavailable,
  getPeriodComparison,
  listComparisonProducts,
} from '@/services/comparisonApi'
import type {
  CompareMode,
  ComparisonParams,
  ComparisonResponse,
  Granularity,
  HourPoint,
  KpiCell,
  MoverRow,
} from '@/types/comparison'

const { t, locale } = useI18n({ useScope: 'global' })
const { translate: translateError } = useApiError()
const route = useRoute()
const router = useRouter()

function monthToDate(): DateRangeValue {
  return { ...businessPreset('month'), preset: 'month' }
}

function asComparisonRange(value: DateRangeValue) {
  return { start: value.from, end: value.to }
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day, 12)

  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
}

function validRange(value: DateRangeValue): boolean {
  return validDate(value.from) && validDate(value.to) && value.from <= value.to
}

function draftDays(value: DateRangeValue): number {
  return validRange(value) ? Math.max(1, dayCount(asComparisonRange(value))) : 0
}

function queryValue(value: unknown): string {
  return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '')
}

const aRange = ref<DateRangeValue>(monthToDate())
const bRange = ref<DateRangeValue>({ from: '', to: '' })
const mode = ref<CompareMode>('previous_month')
const granularity = ref<Granularity>('day')
const avgMode = ref(false)
const productId = ref('')

const allowedModes: CompareMode[] = ['previous_month', 'previous_period', 'same_period_last_year', 'custom']
const allowedGranularities: Granularity[] = ['day', 'week', 'month']

function hydrateFromUrl() {
  const query = route.query
  const aStart = queryValue(query.a_start)
  const aEnd = queryValue(query.a_end)
  const bStart = queryValue(query.b_start)
  const bEnd = queryValue(query.b_end)
  const queryMode = queryValue(query.mode) as CompareMode
  const queryGranularity = queryValue(query.gran) as Granularity

  if (validDate(aStart) && validDate(aEnd) && aStart <= aEnd)
    aRange.value = { from: aStart, to: aEnd }
  if (validDate(bStart) && validDate(bEnd) && bStart <= bEnd)
    bRange.value = { from: bStart, to: bEnd }
  if (allowedModes.includes(queryMode))
    mode.value = queryMode
  if (allowedGranularities.includes(queryGranularity))
    granularity.value = queryGranularity

  avgMode.value = queryValue(query.avg) === '1'
  productId.value = queryValue(query.product_id)
}

function syncBaseline() {
  if (mode.value === 'custom' || !validRange(aRange.value))
    return

  const baseline = resolveBFromMode(asComparisonRange(aRange.value), mode.value)

  bRange.value = { from: baseline.start, to: baseline.end }
}

watch([aRange, mode], syncBaseline, { deep: true })

async function quickPreset(preset: 'month' | '30d' | 'year') {
  if (preset === 'month') {
    aRange.value = monthToDate()
    mode.value = 'previous_month'
  }
  else if (preset === '30d') {
    aRange.value = { ...businessPreset('30d'), preset: '30d' }
    mode.value = 'previous_period'
  }
  else {
    mode.value = 'same_period_last_year'
  }
  syncBaseline()
  await nextTick()
  await loadComparison()
}

function swapPeriods() {
  const current = { ...aRange.value }

  aRange.value = { ...bRange.value }
  bRange.value = current
  mode.value = 'custom'
}

const data = shallowRef<ComparisonResponse | null>(null)
const loading = ref(false)
const initialLoading = ref(true)
const loadError = shallowRef<unknown>(null)
const usingMock = ref(false)
const catalog = shallowRef<ComparisonProductOption[]>([])
const catalogLoading = ref(true)
let requestId = 0
let activeController: AbortController | null = null

const productOptions = computed(() => {
  const products = new Map<string, ComparisonProductOption>()

  for (const product of catalog.value)
    products.set(product.id, product)
  for (const product of data.value?.products ?? []) {
    const id = String(product.id)

    if (!products.has(id))
      products.set(id, { id, name: product.name, category: product.category })
  }
  const responseSelection = data.value?.selection
  if (responseSelection?.product_id != null && responseSelection.product_name) {
    const id = String(responseSelection.product_id)

    if (!products.has(id)) {
      products.set(id, {
        id,
        name: responseSelection.product_name,
        category: responseSelection.category_name ?? undefined,
      })
    }
  }

  return [
    { value: '', label: t('All products'), keywords: t('Full catalog') },
    ...[...products.values()].map(product => ({
      value: product.id,
      label: product.name,
      keywords: product.category,
    })),
  ]
})

const selectedCatalogProduct = computed(() => catalog.value.find(product => product.id === productId.value))

function comparisonParams(): ComparisonParams {
  return {
    a_start: aRange.value.from,
    a_end: aRange.value.to,
    b_start: bRange.value.from,
    b_end: bRange.value.to,
    granularity: granularity.value,
    ...(productId.value ? { product_id: productId.value } : {}),
    tz: 'Asia/Tashkent',
  }
}

function signature() {
  return JSON.stringify({
    ...comparisonParams(),
    mode: mode.value,
    avg: avgMode.value,
  })
}

interface AppliedComparison {
  params: ComparisonParams
  mode: CompareMode
  avg: boolean
}

function appliedState(): AppliedComparison {
  return {
    params: comparisonParams(),
    mode: mode.value,
    avg: avgMode.value,
  }
}

function appliedStateSignature(state: AppliedComparison): string {
  return JSON.stringify({ ...state.params, mode: state.mode, avg: state.avg })
}

const appliedSignature = ref('')
const dirty = computed(() => !!appliedSignature.value && signature() !== appliedSignature.value)
const controlsValid = computed(() => validRange(aRange.value) && validRange(bRange.value))
const errorMessage = computed(() => loadError.value ? translateError(loadError.value) : '')

async function syncUrl(state: AppliedComparison) {
  const params = state.params

  await router.replace({
    query: {
      a_start: params.a_start,
      a_end: params.a_end,
      b_start: params.b_start,
      b_end: params.b_end,
      mode: state.mode,
      gran: params.granularity,
      avg: state.avg ? '1' : '0',
      ...(params.product_id ? { product_id: params.product_id } : {}),
    },
  }).catch(() => { /* A newer comparison superseded this URL update. */ })
}

async function applyPreviewData(state: AppliedComparison, stateSignature: string) {
  const params = state.params
  const selected = catalog.value.find(product => product.id === String(params.product_id ?? ''))

  const selection = params.product_id
    ? {
      id: String(params.product_id),
      name: selected?.name ?? t('Selected product'),
      category: selected?.category,
    }
    : undefined

  data.value = getProductComparisonMock(params, selection)
  usingMock.value = true
  appliedSignature.value = stateSignature
  await syncUrl(state)
}

async function loadComparison() {
  if (loading.value || initialLoading.value || !controlsValid.value)
    return

  const currentRequest = ++requestId
  const requestState = appliedState()
  const requestSignature = appliedStateSignature(requestState)
  const params = requestState.params

  activeController?.abort()

  const controller = new AbortController()

  activeController = controller
  loading.value = true
  loadError.value = null

  try {
    const result = await getPeriodComparison(params, controller.signal)
    if (currentRequest !== requestId)
      return

    data.value = result
    usingMock.value = false
    appliedSignature.value = requestSignature
    await syncUrl(requestState)
  }
  catch (error) {
    if (currentRequest !== requestId || controller.signal.aborted)
      return

    if (comparisonEndpointUnavailable(error))
      await applyPreviewData(requestState, requestSignature)
    else
      loadError.value = error
  }
  finally {
    if (currentRequest === requestId)
      loading.value = false
  }
}

async function loadCatalog() {
  catalogLoading.value = true
  try {
    catalog.value = await listComparisonProducts()
  }
  catch {
    // The comparison itself remains usable. Products from its response are
    // merged into the selector and the all-products scope still works.
  }
  finally {
    catalogLoading.value = false
  }
}

function formatRange(value: DateRangeValue): string {
  if (!validRange(value))
    return '—'

  const formatter = new Intl.DateTimeFormat(String(locale.value), {
    day: 'numeric',
    month: 'short',
    year: aRange.value.from.slice(0, 4) !== bRange.value.from.slice(0, 4) ? 'numeric' : undefined,
  })

  const format = (date: string) => {
    const [year, month, day] = date.split('-').map(Number)

    return formatter.format(new Date(year, month - 1, day, 12))
  }

  return value.from === value.to ? format(value.from) : `${format(value.from)} – ${format(value.to)}`
}

const labelA = computed(() => formatRange({
  from: data.value?.period_a.start ?? aRange.value.from,
  to: data.value?.period_a.end ?? aRange.value.to,
}))

const labelB = computed(() => formatRange({
  from: data.value?.period_b.start ?? bRange.value.from,
  to: data.value?.period_b.end ?? bRange.value.to,
}))

const daysA = computed(() => draftDays(aRange.value))
const daysB = computed(() => draftDays(bRange.value))
const loadedDaysA = computed(() => data.value?.period_a.days ?? Math.max(1, daysA.value))
const loadedDaysB = computed(() => data.value?.period_b.days ?? Math.max(1, daysB.value))
const revenueSpark = computed(() => data.value?.revenue_timeseries.a.map(point => point.value).slice(-14) ?? [])

const totalA = computed(() => data.value?.kpis.gross_revenue?.a
  ?? data.value?.products.reduce((total, product) => total + product.a_revenue, 0)
  ?? 0)

const productMovers = computed<MoverRow[]>(() => (data.value?.products ?? []).map(product => ({
  name: product.name,
  a: product.a_revenue,
  b: product.b_revenue,
  delta: product.a_revenue - product.b_revenue,
  delta_pct: product.delta_pct,
})))

const primaryKpi = computed<KpiCell | null>(() => data.value?.kpis.net_revenue ?? data.value?.kpis.gross_revenue ?? null)
const itemsKpi = computed(() => data.value?.kpis.items_sold ?? null)
const isProductScope = computed(() => data.value?.selection?.scope === 'product' || (!!productId.value && !dirty.value))

const focusName = computed(() => data.value?.selection?.product_name
  ?? selectedCatalogProduct.value?.name
  ?? t('All products'))

const headline = computed(() => {
  const kpi = primaryKpi.value
  if (!kpi)
    return t('See what changed between your sales periods')
  if (kpi.b === 0 && kpi.a > 0)
    return t('New sales appeared in the current period')
  if (kpi.delta_pct === null)
    return t('Sales changed between the selected periods')

  const percent = new Intl.NumberFormat(String(locale.value), { maximumFractionDigits: 1 }).format(Math.abs(kpi.delta_pct))
  if (kpi.delta_pct > 0)
    return t('Sales grew by {percent}%', { percent })
  if (kpi.delta_pct < 0)
    return t('Sales fell by {percent}%', { percent })
  return t('Sales held steady')
})

function peakHour(rows: HourPoint[] | undefined): HourPoint | null {
  if (!rows?.length)
    return null

  return rows.reduce((peak, row) => row.value > peak.value ? row : peak)
}

function hourWindow(point: HourPoint | null): string {
  if (!point)
    return '—'
  const hour = Number(point.hour)

  return `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00`
}

const peakA = computed(() => peakHour(data.value?.by_hour.a))
const peakB = computed(() => peakHour(data.value?.by_hour.b))

const hasActivity = computed(() => {
  const kpis = Object.values(data.value?.kpis ?? {}) as KpiCell[]

  return kpis.some(kpi => kpi.a !== 0 || kpi.b !== 0)
    || !!data.value?.products.length
    || !!data.value?.revenue_timeseries.a.length
    || !!data.value?.revenue_timeseries.b.length
})

onMounted(async () => {
  hydrateFromUrl()
  if (mode.value !== 'custom' || !validRange(bRange.value))
    syncBaseline()

  const catalogPromise = loadCatalog()
  if (productId.value)
    await catalogPromise
  initialLoading.value = false
  await loadComparison()
})

onBeforeUnmount(() => {
  requestId++
  activeController?.abort()
})
</script>

<template>
  <WorkspacePage class="cmp product-comparison-page">
    <PageHeader
      :eyebrow="t('Sales intelligence')"
      :title="t('Product comparison')"
      :subtitle="t('Compare one product or your full catalog across any two sales periods.')"
    >
      <template #actions>
        <Badge
          v-if="data"
          :tone="usingMock ? 'warning' : 'success'"
          dot
        >
          {{ usingMock ? t('Preview data') : t('Live comparison') }}
        </Badge>
      </template>
    </PageHeader>

    <ComparisonControlBar
      v-model:a-range="aRange"
      v-model:b-range="bRange"
      v-model:mode="mode"
      v-model:granularity="granularity"
      v-model:avg-mode="avgMode"
      v-model:product-id="productId"
      :days-a="daysA"
      :days-b="daysB"
      :product-options="productOptions"
      :products-loading="catalogLoading"
      :loading="loading || initialLoading"
      :dirty="dirty"
      :valid="controlsValid"
      @compare="loadComparison"
      @swap="swapPeriods"
      @quick-preset="quickPreset"
    />

    <div
      v-if="loadError && data"
      class="cmp-alert cmp-alert--error"
      role="alert"
    >
      <span class="cmp-alert__icon"><DesignIcon
        name="alert"
        :size="19"
      /></span>
      <div>
        <strong>{{ t('Comparison could not be loaded') }}</strong>
        <p>{{ errorMessage || t('Keep your current results while you retry.') }}</p>
      </div>
      <Button
        size="sm"
        icon="retry"
        :loading="loading"
        @click="loadComparison"
      >
        {{ t('Retry') }}
      </Button>
    </div>

    <div
      v-if="(loading || initialLoading) && !data"
      class="cmp-skeleton"
      role="status"
      :aria-label="t('Loading comparison')"
    >
      <div class="cmp-skeleton__hero" />
      <div class="cmp-skeleton__cards">
        <div
          v-for="index in 4"
          :key="index"
        />
      </div>
      <div class="cmp-skeleton__chart" />
    </div>

    <StateFill
      v-else-if="!data && loadError"
      icon="chart"
      :title="t('Comparison could not be loaded')"
      :sub="errorMessage"
      error
    >
      <template #action>
        <Button
          icon="retry"
          :loading="loading"
          @click="loadComparison"
        >
          {{ t('Retry') }}
        </Button>
      </template>
    </StateFill>

    <template v-else-if="data">
      <div
        v-if="usingMock"
        class="cmp-alert cmp-alert--preview"
        role="status"
      >
        <span class="cmp-alert__icon"><DesignIcon
          name="sparkle"
          :size="19"
        /></span>
        <div><strong>{{ t('Comparison preview') }}</strong><p>{{ t('This page is using deterministic preview data because the comparison endpoint is not available yet.') }}</p></div>
      </div>

      <section
        class="cmp-signal"
        aria-labelledby="comparison-signal-title"
      >
        <div class="cmp-signal__copy">
          <div class="cmp-signal__meta">
            <span><DesignIcon
              :name="isProductScope ? 'box' : 'grid'"
              :size="15"
            />{{ focusName }}</span>
            <span>{{ labelA }} {{ t('vs') }} {{ labelB }}</span>
          </div>
          <p class="cmp-signal__eyebrow">
            {{ t('Comparison signal') }}
          </p>
          <h2 id="comparison-signal-title">
            {{ headline }}
          </h2>
          <p class="cmp-signal__sub">
            {{ isProductScope ? t('Selected product performance across both periods.') : t('Full catalog performance across both periods.') }}
          </p>
        </div>

        <div class="cmp-signal__numbers">
          <article class="cmp-period-number cmp-period-number--a">
            <span>A · {{ t('Current') }}</span><strong>{{ primaryKpi ? fmtUZSUnit(primaryKpi.a) : '—' }}</strong><small>{{ labelA }}</small>
          </article>
          <article class="cmp-period-number cmp-period-number--b">
            <span>B · {{ t('Baseline') }}</span><strong>{{ primaryKpi ? fmtUZSUnit(primaryKpi.b) : '—' }}</strong><small>{{ labelB }}</small>
          </article>
          <article class="cmp-period-number cmp-period-number--delta">
            <span>{{ t('Net difference') }}</span>
            <strong :class="primaryKpi && primaryKpi.delta < 0 ? 'is-negative' : primaryKpi && primaryKpi.delta > 0 ? 'is-positive' : ''">{{ primaryKpi ? `${primaryKpi.delta > 0 ? '+' : primaryKpi.delta < 0 ? '−' : ''}${fmtUZSUnit(Math.abs(primaryKpi.delta))}` : '—' }}</strong>
            <small>{{ t('Current minus baseline') }}</small>
          </article>
        </div>

        <div class="cmp-signal__facts">
          <div>
            <span class="cmp-fact__icon"><DesignIcon
              name="box"
              :size="17"
            /></span><span><small>{{ t('Items sold') }}</small><strong>{{ itemsKpi ? fmtInt(itemsKpi.a) : '—' }}</strong></span><em>{{ itemsKpi ? `${itemsKpi.delta > 0 ? '+' : itemsKpi.delta < 0 ? '−' : ''}${fmtInt(Math.abs(itemsKpi.delta))}` : '—' }}</em>
          </div>
          <div>
            <span class="cmp-fact__icon"><DesignIcon
              name="clock"
              :size="17"
            /></span><span><small>{{ t('Peak hour') }} · A</small><strong>{{ hourWindow(peakA) }}</strong></span><em>{{ peakA ? t('{count} orders', { count: fmtInt(peakA.value) }) : '—' }}</em>
          </div>
          <div>
            <span class="cmp-fact__icon"><DesignIcon
              name="history"
              :size="17"
            /></span><span><small>{{ t('Peak hour') }} · B</small><strong>{{ hourWindow(peakB) }}</strong></span><em>{{ peakB ? t('{count} orders', { count: fmtInt(peakB.value) }) : '—' }}</em>
          </div>
        </div>
      </section>

      <KpiScorecardRow
        :kpis="data.kpis"
        :days-a="loadedDaysA"
        :days-b="loadedDaysB"
        :avg-mode="avgMode"
        :revenue-spark="revenueSpark"
      />

      <StateFill
        v-if="!hasActivity"
        icon="chart"
        :title="t('No comparison activity')"
        :sub="t('No sales were found in either selected period.')"
      />

      <template v-else>
        <section class="cmp-section">
          <header class="cmp-section__head">
            <div><span>{{ t('Direction') }}</span><h2>{{ t('Sales over time') }}</h2><p>{{ t('Follow the shape and size of change across both periods.') }}</p></div><span class="cmp-section__index">01</span>
          </header>
          <RevenueTrendChart
            :series="data.revenue_timeseries"
            :label-a="labelA"
            :label-b="labelB"
          />
        </section>

        <section class="cmp-section">
          <header class="cmp-section__head">
            <div><span>{{ t('Sales rhythm') }}</span><h2>{{ t('When sales happen') }}</h2><p>{{ t('See the strongest hours and weekdays in each period.') }}</p></div><span class="cmp-section__index">02</span>
          </header>
          <div class="cmp-grid2">
            <HourlyPatternChart
              :by-hour="data.by_hour"
              :label-a="labelA"
              :label-b="labelB"
            />
            <WeekdayPatternChart
              :by-weekday="data.by_weekday"
              :label-a="labelA"
              :label-b="labelB"
            />
          </div>
          <DeltaHeatmap
            v-if="data.hour_weekday"
            :matrix="data.hour_weekday"
          />
        </section>

        <section class="cmp-section">
          <header class="cmp-section__head">
            <div><span>{{ t('Customer mix') }}</span><h2>{{ t('How these orders were paid and served') }}</h2><p>{{ t('Payment and service-channel shares for both periods.') }}</p></div><span class="cmp-section__index">03</span>
          </header>
          <div class="cmp-grid2">
            <MixDonutPair
              :a="data.payment_methods.a"
              :b="data.payment_methods.b"
              :label-a="labelA"
              :label-b="labelB"
              :eyebrow="t('Payment mix')"
              :title="t('How guests pay')"
              kind="payment"
            />
            <MixDonutPair
              :a="data.order_types.a"
              :b="data.order_types.b"
              :label-a="labelA"
              :label-b="labelB"
              :eyebrow="t('Order types')"
              :title="t('Channel mix')"
              kind="order_type"
            />
          </div>
        </section>

        <section
          v-if="!isProductScope"
          class="cmp-section"
        >
          <header class="cmp-section__head">
            <div><span>{{ t('Catalog movement') }}</span><h2>{{ t('Which products gained or lost') }}</h2><p>{{ t('Find category shifts, leaders, and products that need attention.') }}</p></div><span class="cmp-section__index">04</span>
          </header>
          <div class="cmp-grid2">
            <CategoryComparisonChart
              :categories="data.categories"
              :label-a="labelA"
              :label-b="labelB"
            />
            <TopMoversPanel :movers="productMovers" />
          </div>
          <TopProductsChart
            :products="data.products"
            :label-a="labelA"
            :label-b="labelB"
          />
        </section>

        <section class="cmp-section cmp-section--detail">
          <header class="cmp-section__head">
            <div><span>{{ t('Evidence') }}</span><h2>{{ isProductScope ? t('{product} performance', { product: focusName }) : t('Every product, side by side') }}</h2><p>{{ t('Search, sort, and export the exact values behind the charts.') }}</p></div><span class="cmp-section__index">{{ isProductScope ? '04' : '05' }}</span>
          </header>
          <ComparisonTable
            :products="data.products"
            :total-a="totalA"
          />
        </section>
      </template>
    </template>
  </WorkspacePage>
</template>

<style scoped>
.cmp { display: flex; flex-direction: column; gap: 20px; padding-block-end: 44px; color: var(--text); }
.cmp-alert { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 15px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-xs); }
.cmp-alert__icon { display: grid; inline-size: 36px; block-size: 36px; place-items: center; border-radius: 11px; }
.cmp-alert strong { display: block; font-size: 13px; }
.cmp-alert p { margin: 2px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.cmp-alert--preview { border-color: var(--warning-border); background: color-mix(in srgb, var(--warning-weak) 66%, var(--surface)); }
.cmp-alert--preview .cmp-alert__icon { color: var(--warning-strong); background: var(--warning-weak); }
.cmp-alert--error { border-color: var(--error-border); }
.cmp-alert--error .cmp-alert__icon { color: var(--error); background: var(--error-weak); }

.cmp-signal { position: relative; overflow: hidden; display: grid; grid-template-columns: minmax(250px, .9fr) minmax(430px, 1.35fr); gap: 26px; padding: clamp(22px, 3vw, 34px); border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--border)); border-radius: 26px; background: var(--surface); box-shadow: 0 24px 64px color-mix(in srgb, var(--text) 9%, transparent); }
.cmp-signal::after { position: absolute; inline-size: 220px; block-size: 220px; border: 44px solid color-mix(in srgb, var(--primary) 7%, transparent); border-radius: 50%; content: ''; inset-block-start: -130px; inset-inline-end: -90px; pointer-events: none; }
.cmp-signal__copy, .cmp-signal__numbers, .cmp-signal__facts { position: relative; z-index: 1; }
.cmp-signal__meta { display: flex; flex-wrap: wrap; gap: 7px; margin-block-end: 30px; }
.cmp-signal__meta span { display: inline-flex; align-items: center; gap: 6px; max-inline-size: 100%; padding: 6px 9px; border: 1px solid var(--border); border-radius: 10px; color: var(--text-secondary); background: var(--surface-2); font-size: 11px; font-weight: 650; overflow-wrap: anywhere; }
.cmp-signal__eyebrow, .cmp-section__head span:first-child { margin: 0 0 7px; color: var(--primary); font-size: 10px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.cmp-signal h2 { max-inline-size: 620px; margin: 0; font-size: clamp(27px, 3.2vw, 48px); font-weight: 620; letter-spacing: -.045em; line-height: 1.04; text-wrap: balance; }
.cmp-signal__sub { max-inline-size: 540px; margin: 14px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }
.cmp-signal__numbers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; align-content: start; }
.cmp-period-number { display: grid; gap: 7px; min-inline-size: 0; padding: 16px; border: 1px solid var(--border); border-radius: 17px; background: var(--surface-2); box-shadow: inset 3px 0 0 var(--color-period-a); }
.cmp-period-number--b { box-shadow: inset 3px 0 0 var(--color-period-b); }
.cmp-period-number--delta { grid-column: 1 / -1; box-shadow: none; background: var(--surface-inset); }
.cmp-period-number > span { color: var(--text-tertiary); font-size: 10px; font-weight: 750; letter-spacing: .09em; text-transform: uppercase; }
.cmp-period-number strong { min-inline-size: 0; font-family: var(--font-mono); font-size: clamp(18px, 2vw, 27px); font-variant-numeric: tabular-nums; letter-spacing: -.025em; overflow-wrap: anywhere; }
.cmp-period-number small { color: var(--text-secondary); font-size: 11px; }
.cmp-period-number strong.is-positive { color: var(--color-positive); }
.cmp-period-number strong.is-negative { color: var(--color-negative); }
.cmp-signal__facts { display: grid; grid-column: 1 / -1; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding-block-start: 3px; }
.cmp-signal__facts > div { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 12px; border-top: 1px solid var(--border); }
.cmp-fact__icon { display: grid; inline-size: 34px; block-size: 34px; place-items: center; border-radius: 11px; color: var(--primary); background: var(--primary-weak); }
.cmp-signal__facts span:nth-child(2) { display: grid; min-inline-size: 0; }
.cmp-signal__facts small { color: var(--text-tertiary); font-size: 10px; }
.cmp-signal__facts strong { font-family: var(--font-mono); font-size: 14px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.cmp-signal__facts em { color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px; font-style: normal; font-variant-numeric: tabular-nums; text-align: end; }

.cmp-section { display: flex; flex-direction: column; gap: 14px; padding-block-start: 10px; scroll-margin-block-start: 90px; }
.cmp-section__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; padding-inline: 4px; }
.cmp-section__head > div { min-inline-size: 0; }
.cmp-section__head h2 { margin: 0; font-size: clamp(22px, 2.2vw, 31px); font-weight: 620; letter-spacing: -.035em; line-height: 1.15; }
.cmp-section__head p { max-inline-size: 660px; margin: 6px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.55; }
.cmp-section__head .cmp-section__index { flex: 0 0 auto; margin: 0; color: color-mix(in srgb, var(--primary) 24%, var(--text-tertiary)); font: 600 clamp(28px, 4vw, 48px)/1 var(--font-mono); letter-spacing: -.06em; }
.cmp-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.cmp-section :deep(.card) { min-inline-size: 0; border: 1px solid var(--border); border-radius: 20px; background: var(--surface); box-shadow: 0 13px 38px color-mix(in srgb, var(--text) 6%, transparent); }
.cmp-section :deep(.card__head) { align-items: flex-start; gap: 12px; padding: 19px 20px 12px; }
.cmp-section :deep(.card__body) { padding: 6px 20px 20px; }
.cmp-section--detail :deep(.card) { box-shadow: var(--shadow-xs); }

.cmp-skeleton { display: grid; gap: 15px; }
.cmp-skeleton > *, .cmp-skeleton__cards > * { position: relative; overflow: hidden; border-radius: 18px; background: var(--surface-2); }
.cmp-skeleton > *::after, .cmp-skeleton__cards > *::after { position: absolute; background: color-mix(in srgb, var(--surface) 58%, transparent); content: ''; inset: 0; animation: cmp-pulse 1.4s ease-in-out infinite; }
.cmp-skeleton__hero { block-size: 250px; }
.cmp-skeleton__cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.cmp-skeleton__cards > * { block-size: 115px; }
.cmp-skeleton__chart { block-size: 360px; }
@keyframes cmp-pulse { 50% { opacity: .35; } }

@media (max-width: 980px) {
  .cmp-signal { grid-template-columns: minmax(0, 1fr); }
  .cmp-signal__meta { margin-block-end: 20px; }
  .cmp-grid2 { grid-template-columns: minmax(0, 1fr); }
  .cmp-skeleton__cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 650px) {
  .cmp { gap: 16px; padding-block-end: 76px; }
  .cmp-alert { grid-template-columns: auto minmax(0, 1fr); padding: 12px; }
  .cmp-alert :deep(.btn) { grid-column: 1 / -1; inline-size: 100%; }
  .cmp-signal { gap: 20px; padding: 19px 16px; border-radius: 21px; }
  .cmp-signal h2 { font-size: 29px; }
  .cmp-signal__numbers { grid-template-columns: minmax(0, 1fr); }
  .cmp-period-number--delta { grid-column: auto; }
  .cmp-signal__facts { grid-template-columns: minmax(0, 1fr); }
  .cmp-signal__facts > div { padding-inline: 4px; }
  .cmp-section__head { align-items: flex-start; }
  .cmp-section__head .cmp-section__index { font-size: 30px; }
  .cmp-section :deep(.card) { border-radius: 17px; }
  .cmp-section :deep(.card__head) { padding: 16px 16px 10px; }
  .cmp-section :deep(.card__body) { padding: 4px 12px 16px; }
  .cmp-skeleton__cards { grid-template-columns: minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .cmp-skeleton > *::after, .cmp-skeleton__cards > *::after { animation: none; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
