<script setup lang="ts">
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
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

type PreviewReason = 'endpoint' | 'product_scope'

const previewReason = ref<PreviewReason>('endpoint')

async function applyPreviewData(state: AppliedComparison, stateSignature: string, reason: PreviewReason = 'endpoint') {
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
  previewReason.value = reason
  appliedSignature.value = stateSignature
  await syncUrl(state)
}

// Until the backend scopes comparisons to one product, a product request can
// return full-catalog totals; never present those as the product's figures.
function confirmsProductScope(result: ComparisonResponse, productId: string): boolean {
  return result.selection?.scope === 'product'
    && String(result.selection.product_id ?? '') === productId
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

    if (params.product_id && !confirmsProductScope(result, String(params.product_id))) {
      await applyPreviewData(requestState, requestSignature, 'product_scope')

      return
    }

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

  const percent = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Math.abs(kpi.delta_pct))
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

const primaryDeltaLabel = computed(() => {
  const value = primaryKpi.value?.delta_pct
  if (value === undefined)
    return '—'
  if (value === null)
    return t('New')

  const formatted = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Math.abs(value))

  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatted}%`
})

const primaryDeltaTone = computed(() => {
  const value = primaryKpi.value?.delta_pct
  if (value === null || (typeof value === 'number' && value > 0))
    return 'is-positive'
  if (typeof value === 'number' && value < 0)
    return 'is-negative'

  return 'is-flat'
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
    <header class="cmp-header">
      <div class="cmp-header__identity">
        <span
          class="cmp-header__symbol"
          aria-hidden="true"
        >
          <DesignIcon
            name="exchange"
            :size="25"
          />
        </span>
        <div>
          <p>{{ t('Sales intelligence') }}</p>
          <h1>{{ t('Product comparison') }}</h1>
          <span>{{ t('Compare one product or your full catalog across any two sales periods.') }}</span>
        </div>
      </div>
      <div class="cmp-header__status">
        <Badge
          v-if="data"
          :tone="usingMock ? 'warning' : 'success'"
          dot
        >
          {{ usingMock ? t('Preview data') : t('Live comparison') }}
        </Badge>
        <span class="cmp-header__scope">
          <DesignIcon
            :name="productId ? 'box' : 'grid'"
            :size="15"
          />
          {{ focusName }}
        </span>
      </div>
    </header>

    <div class="cmp-workbench">
      <aside class="cmp-builder">
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
      </aside>

      <main class="cmp-canvas">
        <div
          v-if="loadError && data"
          class="cmp-alert cmp-alert--error"
          role="alert"
        >
          <span class="cmp-alert__icon">
            <DesignIcon
              name="alert"
              :size="19"
            />
          </span>
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
            <span class="cmp-alert__icon">
              <DesignIcon
                name="sparkle"
                :size="19"
              />
            </span>
            <div>
              <strong>{{ t('Comparison preview') }}</strong>
              <p>{{ previewReason === 'product_scope' ? t('This page is using deterministic preview data because the comparison endpoint cannot compare a single product yet.') : t('This page is using deterministic preview data because the comparison endpoint is not available yet.') }}</p>
            </div>
          </div>

          <section
            class="cmp-brief"
            aria-labelledby="comparison-signal-title"
          >
            <div class="cmp-brief__grid" />
            <div class="cmp-brief__copy">
              <div class="cmp-brief__meta">
                <span>
                  <DesignIcon
                    :name="isProductScope ? 'box' : 'grid'"
                    :size="14"
                  />{{ focusName }}
                </span>
                <span>{{ labelA }} {{ t('vs') }} {{ labelB }}</span>
              </div>
              <p>{{ t('Comparison signal') }}</p>
              <h2 id="comparison-signal-title">
                {{ headline }}
              </h2>
              <span>{{ isProductScope ? t('Selected product performance across both periods.') : t('Full catalog performance across both periods.') }}</span>
            </div>

            <div
              class="cmp-dial"
              :class="primaryDeltaTone"
              :style="{ '--delta-angle': `${Math.min(100, Math.abs(Number(primaryKpi?.delta_pct ?? 0))) * 3.6}deg` }"
            >
              <div>
                <span>{{ t('Net difference') }}</span>
                <strong>{{ primaryDeltaLabel }}</strong>
                <small>{{ t('Current minus baseline') }}</small>
              </div>
            </div>

            <div class="cmp-brief__ledger">
              <article class="cmp-period cmp-period--a">
                <span><b>A</b>{{ t('Current') }}</span>
                <strong>{{ primaryKpi ? fmtUZSUnit(primaryKpi.a) : '—' }}</strong>
                <small>{{ labelA }}</small>
              </article>
              <div class="cmp-period-difference">
                <DesignIcon
                  name="arrowright"
                  :size="17"
                />
                <span>{{ t('Difference') }}</span>
                <strong :class="primaryKpi && primaryKpi.delta < 0 ? 'is-negative' : primaryKpi && primaryKpi.delta > 0 ? 'is-positive' : ''">
                  {{ primaryKpi ? `${primaryKpi.delta > 0 ? '+' : primaryKpi.delta < 0 ? '−' : ''}${fmtUZSUnit(Math.abs(primaryKpi.delta))}` : '—' }}
                </strong>
              </div>
              <article class="cmp-period cmp-period--b">
                <span><b>B</b>{{ t('Baseline') }}</span>
                <strong>{{ primaryKpi ? fmtUZSUnit(primaryKpi.b) : '—' }}</strong>
                <small>{{ labelB }}</small>
              </article>
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
            <section class="cmp-cluster">
              <header class="cmp-cluster__head">
                <span class="cmp-cluster__symbol">
                  <DesignIcon
                    name="trend"
                    :size="19"
                  />
                </span>
                <div>
                  <p>{{ t('Direction') }}</p>
                  <h2>{{ t('Sales over time') }}</h2>
                  <span>{{ t('Follow the shape and size of change across both periods.') }}</span>
                </div>
              </header>

              <div class="cmp-feature-grid">
                <div class="cmp-chart cmp-chart--trend">
                  <RevenueTrendChart
                    :series="data.revenue_timeseries"
                    :label-a="labelA"
                    :label-b="labelB"
                  />
                </div>

                <aside class="cmp-moments">
                  <header>
                    <span><DesignIcon
                      name="sparkle"
                      :size="17"
                    /></span>
                    <div>
                      <p>{{ t('Comparison signal') }}</p>
                      <strong>{{ t('Today at a glance') }}</strong>
                    </div>
                  </header>
                  <article>
                    <span><DesignIcon
                      name="box"
                      :size="18"
                    /></span>
                    <div>
                      <small>{{ t('Items sold') }}</small>
                      <strong>{{ itemsKpi ? fmtInt(itemsKpi.a) : '—' }}</strong>
                      <em>{{ itemsKpi ? `${itemsKpi.delta > 0 ? '+' : itemsKpi.delta < 0 ? '−' : ''}${fmtInt(Math.abs(itemsKpi.delta))}` : '—' }}</em>
                    </div>
                  </article>
                  <article>
                    <span><DesignIcon
                      name="clock"
                      :size="18"
                    /></span>
                    <div>
                      <small>{{ t('Peak hour') }} · A</small>
                      <strong>{{ hourWindow(peakA) }}</strong>
                      <em>{{ peakA ? t('{count} orders', { count: fmtInt(peakA.value) }) : '—' }}</em>
                    </div>
                  </article>
                  <article>
                    <span><DesignIcon
                      name="history"
                      :size="18"
                    /></span>
                    <div>
                      <small>{{ t('Peak hour') }} · B</small>
                      <strong>{{ hourWindow(peakB) }}</strong>
                      <em>{{ peakB ? t('{count} orders', { count: fmtInt(peakB.value) }) : '—' }}</em>
                    </div>
                  </article>
                </aside>
              </div>
            </section>

            <section class="cmp-cluster">
              <header class="cmp-cluster__head">
                <span class="cmp-cluster__symbol">
                  <DesignIcon
                    name="clock"
                    :size="19"
                  />
                </span>
                <div>
                  <p>{{ t('Sales rhythm') }}</p>
                  <h2>{{ t('When sales happen') }}</h2>
                  <span>{{ t('See the strongest hours and weekdays in each period.') }}</span>
                </div>
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

            <section class="cmp-cluster cmp-cluster--mix">
              <header class="cmp-cluster__head">
                <span class="cmp-cluster__symbol">
                  <DesignIcon
                    name="chart"
                    :size="19"
                  />
                </span>
                <div>
                  <p>{{ t('Customer mix') }}</p>
                  <h2>{{ t('How these orders were paid and served') }}</h2>
                  <span>{{ t('Payment and service-channel shares for both periods.') }}</span>
                </div>
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
              class="cmp-cluster"
            >
              <header class="cmp-cluster__head">
                <span class="cmp-cluster__symbol">
                  <DesignIcon
                    name="bars"
                    :size="19"
                  />
                </span>
                <div>
                  <p>{{ t('Catalog movement') }}</p>
                  <h2>{{ t('Which products gained or lost') }}</h2>
                  <span>{{ t('Find category shifts, leaders, and products that need attention.') }}</span>
                </div>
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

            <section class="cmp-cluster cmp-cluster--detail">
              <header class="cmp-cluster__head">
                <span class="cmp-cluster__symbol">
                  <DesignIcon
                    name="table"
                    :size="19"
                  />
                </span>
                <div>
                  <p>{{ t('Evidence') }}</p>
                  <h2>{{ isProductScope ? t('{product} performance', { product: focusName }) : t('Every product, side by side') }}</h2>
                  <span>{{ t('Search, sort, and export the exact values behind the charts.') }}</span>
                </div>
              </header>
              <ComparisonTable
                :products="data.products"
                :total-a="totalA"
              />
            </section>
          </template>
        </template>
      </main>
    </div>
  </WorkspacePage>
</template>

<style scoped>
.cmp {
  --cmp-edge: color-mix(in srgb, var(--text) 10%, var(--surface));
  --cmp-shadow: 0 2px 3px -2px color-mix(in srgb, var(--text) 11%, transparent), 0 18px 50px -28px color-mix(in srgb, var(--text) 32%, transparent);

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-block-end: 52px;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

.cmp::before { position: absolute; z-index: -1; inline-size: 520px; block-size: 520px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--primary) 8%, transparent), transparent 68%); content: ''; inset-block-start: 80px; inset-inline-end: -180px; pointer-events: none; }

.cmp-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 22px;
  border: 1px solid var(--cmp-edge);
  border-radius: 24px;
  background: radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--primary) 10%, transparent), transparent 34%), color-mix(in srgb, var(--surface) 96%, var(--primary));
  box-shadow: var(--cmp-shadow);
}
.cmp-header__identity { display: flex; align-items: center; min-inline-size: 0; gap: 16px; }
.cmp-header__symbol { display: grid; flex: 0 0 54px; inline-size: 54px; block-size: 54px; place-items: center; border: 1px solid color-mix(in srgb, var(--on-primary) 18%, transparent); border-radius: 17px; color: var(--on-primary); background: var(--primary); box-shadow: 0 14px 30px -18px color-mix(in srgb, var(--primary) 80%, transparent); }
.cmp-header__identity > div { min-inline-size: 0; }
.cmp-header__identity p,
.cmp-header__identity h1,
.cmp-header__identity span { margin: 0; }
.cmp-header__identity p { color: var(--primary); font-size: 9px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.cmp-header__identity h1 { margin-block-start: 2px; font-size: 32px; font-weight: 620; letter-spacing: -.035em; line-height: 1.15; overflow-wrap: anywhere; }
.cmp-header__identity span { display: block; margin-block-start: 6px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.cmp-header__status { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.cmp-header__scope { display: inline-flex; align-items: center; max-inline-size: 260px; min-block-size: 32px; gap: 7px; padding: 6px 9px; border: 1px solid var(--cmp-edge); border-radius: 10px; color: var(--text-secondary); background: var(--surface); font-size: 11px; font-weight: 620; overflow-wrap: anywhere; }
.cmp-header__scope svg { flex: 0 0 auto; color: var(--primary); }

.cmp-workbench { display: grid; grid-template-columns: minmax(300px, 336px) minmax(0, 1fr); align-items: start; gap: 20px; }
.cmp-builder { position: sticky; z-index: 12; min-inline-size: 0; inset-block-start: 78px; }
.cmp-canvas { display: grid; min-inline-size: 0; gap: 20px; }

.cmp-alert { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 13px 15px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface); box-shadow: var(--shadow-xs); }
.cmp-alert__icon { display: grid; inline-size: 36px; block-size: 36px; place-items: center; border-radius: 11px; }
.cmp-alert strong { display: block; font-size: 13px; }
.cmp-alert p { margin: 2px 0 0; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.cmp-alert--preview { border-color: var(--warning-border); background: color-mix(in srgb, var(--warning-weak) 66%, var(--surface)); }
.cmp-alert--preview .cmp-alert__icon { color: var(--warning-strong); background: var(--warning-weak); }
.cmp-alert--error { border-color: var(--error-border); }
.cmp-alert--error .cmp-alert__icon { color: var(--error); background: var(--error-weak); }

.cmp-brief { position: relative; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 26px; padding: clamp(23px, 3vw, 34px); border: 1px solid color-mix(in srgb, var(--primary) 28%, var(--cmp-edge)); border-radius: 28px; background: radial-gradient(circle at 84% 8%, color-mix(in srgb, var(--c4) 13%, transparent), transparent 29%), radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--primary) 12%, transparent), transparent 34%), var(--surface); box-shadow: 0 28px 70px -38px color-mix(in srgb, var(--primary) 48%, transparent), var(--cmp-shadow); }
.cmp-brief__grid { position: absolute; opacity: .42; background-image: linear-gradient(color-mix(in srgb, var(--primary) 9%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--primary) 9%, transparent) 1px, transparent 1px); background-size: 28px 28px; mask-image: linear-gradient(115deg, transparent 4%, #000 44%, transparent 86%); inset: 0; pointer-events: none; }
.cmp-brief__copy,
.cmp-dial,
.cmp-brief__ledger { position: relative; z-index: 1; }
.cmp-brief__meta { display: flex; flex-wrap: wrap; gap: 7px; margin-block-end: 28px; }
.cmp-brief__meta span { display: inline-flex; align-items: center; max-inline-size: 100%; min-block-size: 28px; gap: 6px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 9px; color: var(--text-secondary); background: color-mix(in srgb, var(--surface) 86%, transparent); font-size: 10px; font-weight: 650; overflow-wrap: anywhere; }
.cmp-brief__copy > p { margin: 0 0 7px; color: var(--primary); font-size: 9px; font-weight: 820; letter-spacing: .15em; text-transform: uppercase; }
.cmp-brief__copy h2 { max-inline-size: 650px; margin: 0; font-size: clamp(31px, 3.4vw, 52px); font-weight: 610; letter-spacing: -.05em; line-height: 1.02; text-wrap: balance; }
.cmp-brief__copy > span { display: block; max-inline-size: 560px; margin-block-start: 14px; color: var(--text-secondary); font-size: 13px; line-height: 1.6; }

.cmp-dial { --delta-color: var(--text-tertiary); display: grid; flex: 0 0 auto; inline-size: 178px; block-size: 178px; place-items: center; border-radius: 50%; background: conic-gradient(from -90deg, var(--delta-color) var(--delta-angle), color-mix(in srgb, var(--delta-color) 10%, var(--surface)) 0); box-shadow: 0 16px 40px -26px var(--delta-color); }
.cmp-dial::before { position: absolute; border: 1px solid color-mix(in srgb, var(--delta-color) 22%, var(--border)); border-radius: 50%; background: color-mix(in srgb, var(--surface) 94%, var(--delta-color)); content: ''; inset: 10px; }
.cmp-dial.is-positive { --delta-color: var(--color-positive); }
.cmp-dial.is-negative { --delta-color: var(--color-negative); }
.cmp-dial > div { position: relative; z-index: 1; display: grid; max-inline-size: 130px; place-items: center; text-align: center; }
.cmp-dial span { color: var(--text-secondary); font-size: 9px; font-weight: 760; letter-spacing: .1em; text-transform: uppercase; }
.cmp-dial strong { margin-block: 5px 2px; color: var(--delta-color); font-family: var(--font-mono); font-size: 30px; font-variant-numeric: tabular-nums; letter-spacing: -.06em; }
.cmp-dial small { color: var(--text-tertiary); font-size: 8px; line-height: 1.35; }

.cmp-brief__ledger { display: grid; grid-column: 1 / -1; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: stretch; gap: 10px; padding-block-start: 4px; }
.cmp-period { display: grid; min-inline-size: 0; gap: 6px; padding: 14px 15px; border: 1px solid color-mix(in srgb, var(--color-period-a) 24%, var(--border)); border-radius: 16px; background: color-mix(in srgb, var(--color-period-a) 6%, var(--surface)); }
.cmp-period--b { border-color: color-mix(in srgb, var(--color-period-b) 30%, var(--border)); background: color-mix(in srgb, var(--color-period-b) 8%, var(--surface)); }
.cmp-period > span { display: flex; align-items: center; gap: 7px; color: var(--text-secondary); font-size: 9px; font-weight: 720; letter-spacing: .08em; text-transform: uppercase; }
.cmp-period b { display: grid; inline-size: 23px; block-size: 23px; place-items: center; border-radius: 8px; color: #fff; background: var(--color-period-a); font-family: var(--font-mono); font-size: 8px; }
.cmp-period--b b { background: var(--color-period-b); }
.cmp-period > strong { font-family: var(--font-mono); font-size: clamp(19px, 2vw, 27px); font-variant-numeric: tabular-nums; letter-spacing: -.04em; overflow-wrap: anywhere; }
.cmp-period > small { color: var(--text-tertiary); font-size: 9px; overflow-wrap: anywhere; }
.cmp-period-difference { display: grid; min-inline-size: 116px; place-content: center; place-items: center; gap: 3px; padding-inline: 10px; color: var(--text-tertiary); text-align: center; }
.cmp-period-difference svg { color: var(--primary); }
.cmp-period-difference span { font-size: 8px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.cmp-period-difference strong { font-family: var(--font-mono); font-size: 12px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.is-positive { color: var(--color-positive); }
.is-negative { color: var(--color-negative); }

.cmp-cluster { display: grid; gap: 14px; padding-block-start: 7px; }
.cmp-cluster__head { display: flex; align-items: center; gap: 12px; padding-inline: 3px; }
.cmp-cluster__symbol { display: grid; flex: 0 0 42px; inline-size: 42px; block-size: 42px; place-items: center; border: 1px solid color-mix(in srgb, var(--primary) 20%, var(--border)); border-radius: 13px; color: var(--primary); background: var(--primary-weak); }
.cmp-cluster__head > div { min-inline-size: 0; }
.cmp-cluster__head p,
.cmp-cluster__head h2,
.cmp-cluster__head span { margin: 0; }
.cmp-cluster__head p { color: var(--primary); font-size: 8px; font-weight: 820; letter-spacing: .14em; text-transform: uppercase; }
.cmp-cluster__head h2 { margin-block-start: 2px; font-size: clamp(21px, 2.2vw, 29px); font-weight: 630; letter-spacing: -.035em; line-height: 1.15; }
.cmp-cluster__head > div > span { display: block; margin-block-start: 4px; color: var(--text-secondary); font-size: 11px; line-height: 1.45; }
.cmp-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.cmp-feature-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(210px, 238px); gap: 14px; }
.cmp-chart { min-inline-size: 0; }

.cmp-moments { overflow: hidden; display: grid; align-content: start; border: 1px solid color-mix(in srgb, var(--primary) 25%, var(--cmp-edge)); border-radius: 22px; background: linear-gradient(160deg, color-mix(in srgb, var(--primary) 11%, var(--surface)), var(--surface)); box-shadow: var(--cmp-shadow); }
.cmp-moments > header { display: flex; align-items: center; gap: 9px; padding: 15px; border-block-end: 1px solid var(--border); }
.cmp-moments > header > span { display: grid; inline-size: 34px; block-size: 34px; place-items: center; border-radius: 11px; color: var(--primary); background: var(--primary-weak); }
.cmp-moments header p,
.cmp-moments header strong { margin: 0; }
.cmp-moments header p { color: var(--primary); font-size: 7px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.cmp-moments header strong { font-size: 12px; }
.cmp-moments article { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 9px; padding: 15px; border-block-end: 1px solid var(--border); }
.cmp-moments article:last-child { border-block-end: 0; }
.cmp-moments article > span { display: grid; inline-size: 33px; block-size: 33px; place-items: center; border-radius: 10px; color: var(--primary); background: var(--surface); }
.cmp-moments article > div { display: grid; min-inline-size: 0; }
.cmp-moments article small { color: var(--text-tertiary); font-size: 8px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
.cmp-moments article strong { margin-block-start: 2px; font-family: var(--font-mono); font-size: 17px; font-variant-numeric: tabular-nums; letter-spacing: -.03em; overflow-wrap: anywhere; }
.cmp-moments article em { margin-block-start: 2px; color: var(--text-secondary); font-family: var(--font-mono); font-size: 9px; font-style: normal; }

.cmp-cluster :deep(.card) { min-inline-size: 0; border: 1px solid var(--cmp-edge); border-radius: 22px; background: var(--surface); box-shadow: var(--cmp-shadow); }
.cmp-cluster :deep(.card__head) { align-items: flex-start; gap: 12px; padding: 18px 18px 10px; }
.cmp-cluster :deep(.card__body) { padding: 5px 18px 18px; }
.cmp-cluster--mix :deep(.card) { background: radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--primary) 6%, transparent), transparent 34%), var(--surface); }
.cmp-cluster--detail :deep(.card) { box-shadow: var(--shadow-xs); }

.cmp-skeleton { display: grid; gap: 15px; }
.cmp-skeleton > *,
.cmp-skeleton__cards > * { position: relative; overflow: hidden; border-radius: 20px; background: var(--surface-2); }
.cmp-skeleton > *::after,
.cmp-skeleton__cards > *::after { position: absolute; background: color-mix(in srgb, var(--surface) 58%, transparent); content: ''; inset: 0; animation: cmp-pulse 1.4s ease-in-out infinite; }
.cmp-skeleton__hero { block-size: 360px; }
.cmp-skeleton__cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; padding: 1px; background: var(--border); }
.cmp-skeleton__cards > * { block-size: 150px; border-radius: 0; }
.cmp-skeleton__chart { block-size: 390px; }
@keyframes cmp-pulse { 50% { opacity: .35; } }

@media (max-width: 1380px) {
  .cmp-workbench { grid-template-columns: minmax(280px, 310px) minmax(0, 1fr); }
  .cmp-feature-grid { grid-template-columns: minmax(0, 1fr); }
  .cmp-moments { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cmp-moments > header { grid-column: 1 / -1; }
  .cmp-moments article { border-block-end: 0; border-inline-end: 1px solid var(--border); }
  .cmp-moments article:last-child { border-inline-end: 0; }
}

@media (max-width: 1120px) {
  .cmp-workbench { grid-template-columns: minmax(0, 1fr); }
  .cmp-builder { position: relative; inset-block-start: auto; }
}

@media (max-width: 820px) {
  .cmp-header { align-items: flex-start; flex-direction: column; }
  .cmp-header__status { justify-content: flex-start; }
  .cmp-brief { grid-template-columns: minmax(0, 1fr); }
  .cmp-dial { inline-size: 150px; block-size: 150px; }
  .cmp-brief__ledger { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cmp-period-difference { grid-column: 1 / -1; grid-row: 2; min-block-size: 56px; }
  .cmp-period-difference svg { transform: rotate(90deg); }
  .cmp-grid2 { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 650px) {
  .cmp { gap: 15px; padding-block-end: 84px; }
  .cmp::before { display: none; }
  .cmp-header { gap: 16px; padding: 17px 15px; border-radius: 20px; }
  .cmp-header__identity { align-items: flex-start; gap: 12px; }
  .cmp-header__symbol { flex-basis: 46px; inline-size: 46px; block-size: 46px; border-radius: 15px; }
  .cmp-header__identity h1 { font-size: 27px; }
  .cmp-header__status { inline-size: 100%; }
  .cmp-header__scope { flex: 1; max-inline-size: none; }
  .cmp-workbench,
  .cmp-canvas { gap: 15px; }
  .cmp-alert { grid-template-columns: auto minmax(0, 1fr); padding: 12px; }
  .cmp-alert :deep(.btn) { grid-column: 1 / -1; inline-size: 100%; }
  .cmp-brief { gap: 20px; padding: 19px 15px; border-radius: 22px; }
  .cmp-brief__meta { margin-block-end: 20px; }
  .cmp-brief__copy h2 { font-size: 34px; }
  .cmp-dial { inline-size: 138px; block-size: 138px; }
  .cmp-dial strong { font-size: 25px; }
  .cmp-brief__ledger { grid-template-columns: minmax(0, 1fr); }
  .cmp-period-difference { grid-column: auto; grid-row: auto; }
  .cmp-moments { grid-template-columns: minmax(0, 1fr); }
  .cmp-moments > header { grid-column: auto; }
  .cmp-moments article { border-block-end: 1px solid var(--border); border-inline-end: 0; }
  .cmp-moments article:last-child { border-block-end: 0; }
  .cmp-cluster__head { align-items: flex-start; }
  .cmp-cluster__symbol { flex-basis: 39px; inline-size: 39px; block-size: 39px; }
  .cmp-cluster :deep(.card) { border-radius: 18px; }
  .cmp-cluster :deep(.card__head) { padding: 16px 14px 9px; }
  .cmp-cluster :deep(.card__body) { padding: 4px 11px 15px; }
  .cmp-skeleton__cards { grid-template-columns: minmax(0, 1fr); }
}

@media (prefers-reduced-motion: reduce) {
  .cmp-skeleton > *::after,
  .cmp-skeleton__cards > *::after { animation: none; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
