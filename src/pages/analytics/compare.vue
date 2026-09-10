<script setup lang="ts">
import PageHeader from '@/components/design/PageHeader.vue'

/* ============================================================
   ALPHA POS — Compare Periods analytics page (/analytics/compare)
   User picks Period A (primary) + Period B (baseline); every sales metric is
   shown side by side with deltas. Runs on a mock until the BE endpoint ships
   (auto-wires: tries the real endpoint, falls back to the mock).
   ============================================================ */
import axiosIns from '@/plugins/axios'
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'
import ComparisonControlBar from '@/components/analytics/compare/ComparisonControlBar.vue'
import KpiScorecardRow from '@/components/analytics/compare/KpiScorecardRow.vue'
import RevenueTrendChart from '@/components/analytics/compare/RevenueTrendChart.vue'
import CategoryComparisonChart from '@/components/analytics/compare/CategoryComparisonChart.vue'
import TopProductsChart from '@/components/analytics/compare/TopProductsChart.vue'
import TopMoversPanel from '@/components/analytics/compare/TopMoversPanel.vue'
import HourlyPatternChart from '@/components/analytics/compare/HourlyPatternChart.vue'
import WeekdayPatternChart from '@/components/analytics/compare/WeekdayPatternChart.vue'
import MixDonutPair from '@/components/analytics/compare/MixDonutPair.vue'
import DeltaHeatmap from '@/components/analytics/compare/DeltaHeatmap.vue'
import ComparisonTable from '@/components/analytics/compare/ComparisonTable.vue'
import { resolveBFromMode } from '@/composables/useComparison'
import { businessPreset } from '@/composables/useBusinessDay'
import { getComparisonMock } from '@/mocks/comparisonMock'
import type { CompareMode, ComparisonParams, ComparisonResponse, Granularity, MoverRow } from '@/types/comparison'

const { t, locale } = useI18n({ useScope: 'global' })
const route = useRoute()
const router = useRouter()

// ---------- helpers ----------
function monthToDate(): DateRangeValue {
  return { ...businessPreset('month'), preset: 'month' }
}
function toRange(v: DateRangeValue): { start: string; end: string } {
  return { start: v.from, end: v.to }
}

// ---------- state (hydrated from URL) ----------
const aRange = ref<DateRangeValue>(monthToDate())
const bRange = ref<DateRangeValue>({ from: '', to: '' })
const mode = ref<CompareMode>('previous_period')
const granularity = ref<Granularity>('day')
const avgMode = ref(false)

function hydrateFromUrl() {
  const q = route.query
  if (q.a_start && q.a_end)
    aRange.value = { from: String(q.a_start), to: String(q.a_end) }
  if (q.b_start && q.b_end)
    bRange.value = { from: String(q.b_start), to: String(q.b_end) }
  if (q.mode)
    mode.value = q.mode as CompareMode
  if (q.gran)
    granularity.value = q.gran as Granularity
  if (q.avg)
    avgMode.value = q.avg === '1'
}

// Derive B from mode + A (unless custom).
function syncB() {
  if (mode.value === 'custom')
    return
  const b = resolveBFromMode(toRange(aRange.value), mode.value)

  bRange.value = { from: b.start, to: b.end }
}

watch([aRange, mode], () => { syncB(); load() }, { deep: true })
watch(bRange, () => {
  if (mode.value === 'custom')
    load()
}, { deep: true })
watch(granularity, () => { load() })

// URL sync (shareable)
watchEffect(() => {
  router.replace({
    query: {
      a_start: aRange.value.from,
      a_end: aRange.value.to,
      b_start: bRange.value.from,
      b_end: bRange.value.to,
      mode: mode.value,
      gran: granularity.value,
      avg: avgMode.value ? '1' : '0',
    },
  }).catch(() => { /* Navigation was superseded by another range change. */ })
})

// ---------- data ----------
const data = ref<ComparisonResponse | null>(null)
const loading = ref(true)
const error = ref(false)
const usingMock = ref(false)

function params(): ComparisonParams {
  return {
    a_start: aRange.value.from,
    a_end: aRange.value.to,
    b_start: bRange.value.from,
    b_end: bRange.value.to,
    granularity: granularity.value,
    tz: 'Asia/Tashkent',
  }
}

async function load() {
  if (!aRange.value.from || !bRange.value.from)
    return
  loading.value = true
  error.value = false

  const p = params()
  try {
    const res = await axiosIns.get('/analytics/comparison', { params: p })

    data.value = (res.data?.data ?? res.data) as ComparisonResponse
    usingMock.value = false
  }
  catch {
    // Endpoint not shipped yet → mock so the page is fully usable.
    data.value = getComparisonMock(p)
    usingMock.value = true
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  hydrateFromUrl()
  syncB()
  load()
})

// ---------- derived for children ----------
const labelA = computed(() => rangeLabel(aRange.value))
const labelB = computed(() => rangeLabel(bRange.value))
function rangeLabel(v: DateRangeValue): string {
  if (!v.from)
    return '—'

  const fmt = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString(String(locale.value), { month: 'short', day: 'numeric' })
  }

  return v.from === v.to ? fmt(v.from) : `${fmt(v.from)} – ${fmt(v.to)}`
}

const daysA = computed(() => data.value?.period_a.days ?? 1)
const daysB = computed(() => data.value?.period_b.days ?? 1)
const revenueSpark = computed(() => data.value?.revenue_timeseries.a.map(p => p.value).slice(-14) ?? [])
const totalA = computed(() => data.value?.kpis.gross_revenue?.a ?? data.value?.products.reduce((s, p) => s + p.a_revenue, 0) ?? 0)

// Movers computed from the full product list so abs/% ranking is correct.
const productMovers = computed<MoverRow[]>(() =>
  (data.value?.products ?? []).map(p => ({
    name: p.name,
    a: p.a_revenue,
    b: p.b_revenue,
    delta: p.a_revenue - p.b_revenue,
    delta_pct: p.delta_pct,
  })),
)
</script>

<template>
  <div class="page cmp">
    <PageHeader
      :title="t('Compare Periods')"
      :subtitle="t('What changed between two periods — and by how much')"
    />

    <ComparisonControlBar
      v-model:a-range="aRange"
      v-model:b-range="bRange"
      v-model:mode="mode"
      v-model:granularity="granularity"
      v-model:avg-mode="avgMode"
      :days-a="daysA"
      :days-b="daysB"
    />

    <!-- Loading skeleton -->
    <div
      v-if="loading && !data"
      class="cmp__skel"
    >
      <div
        v-for="n in 6"
        :key="n"
        class="sk-box cmp__skel-kpi"
      />
    </div>

    <template v-else-if="data">
      <KpiScorecardRow
        :kpis="data.kpis"
        :days-a="daysA"
        :days-b="daysB"
        :avg-mode="avgMode"
        :revenue-spark="revenueSpark"
      />

      <RevenueTrendChart
        :series="data.revenue_timeseries"
        :label-a="labelA"
        :label-b="labelB"
      />

      <div class="cmp__grid2">
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

      <div class="cmp__grid2">
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

      <div class="cmp__grid2">
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

      <DeltaHeatmap
        v-if="data.hour_weekday"
        :matrix="data.hour_weekday"
      />

      <ComparisonTable
        :products="data.products"
        :total-a="totalA"
      />
    </template>
  </div>
</template>

<style scoped>
.cmp { display: flex; flex-direction: column; gap: var(--sp-4); }
.cmp__mockchip {
  margin-left: 8px; font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--warning, #B26A00);
  background: color-mix(in srgb, var(--warning, #B26A00) 14%, transparent);
  padding: 2px 8px; border-radius: 99px;
}
.cmp__grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }
@media (max-width: 980px) { .cmp__grid2 { grid-template-columns: 1fr; } }
.cmp__skel { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: var(--sp-3); }
.cmp__skel-kpi { height: 110px; border-radius: var(--r-lg); }
.sk-box { background: rgba(var(--v-theme-on-surface), 0.08); animation: sk-pulse 1.5s ease-in-out infinite; }
@keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
