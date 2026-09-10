<script setup lang="ts">
import TimeSeriesExplorer from '@/components/dashboard/TimeSeriesExplorer.vue'
import DistributionChart from '@/components/dashboard/DistributionChart.vue'
import Select from '@/components/design/Select.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtNum } from '@/components/design/utils/format'
import { formatMonthCodeLabel } from '@/utils/monthLabels'

export interface AIChartConfig {
  type: 'line' | 'bar' | 'donut' | 'hbar'
  title?: string
  subtitle?: string
  categories?: string[]
  series?: { label: string; data: number[]; color?: string }[]
  data?: { label: string; value: number; color?: string }[]
}

interface Props {
  config: AIChartConfig

  /** Set true while the AI is mid-stream so we don't try to render half-typed JSON. */
  streaming?: boolean
}

const props = withDefaults(defineProps<Props>(), { streaming: false })
const { t } = useI18n({ useScope: 'global' })

const { tokens } = useEChartTheme()
const palette = computed(() => [tokens.value.primary, tokens.value.secondary, tokens.value.positive, tokens.value.expense, tokens.value.periodA, tokens.value.negative])
const selected = ref(0)
const expanded = ref(false)
const colorFor = (index: number) => palette.value[index % palette.value.length]

function num(v: unknown): number {
  if (v === null || v === undefined || v === '')
    return Number.NaN
  const n = typeof v === 'string' ? Number(v) : (v as number)
  return Number.isFinite(n) ? n : Number.NaN
}

function validChartValues(c: AIChartConfig): boolean {
  const rowsValid = !!c.data?.length && c.data.every(row => Number.isFinite(row.value))
  const seriesValid = !!c.categories?.length && !!c.series?.length && c.series.every(series => series.data.length === c.categories?.length && series.data.every(Number.isFinite))
  return c.type === 'line' ? seriesValid : (rowsValid || (c.type === 'bar' && seriesValid))
}

const safeConfig = computed<AIChartConfig | null>(() => {
  const source = props.config
  const c = { ...source }
  if (!c || typeof c !== 'object')
    return null
  if (!['line', 'bar', 'donut', 'hbar'].includes(c.type))
    return null
  if (Array.isArray(c.categories))
    c.categories = c.categories.map(label => formatMonthCodeLabel(label, t))

  // Coerce strings → numbers (BE/AI sometimes returns Decimal strings).
  if (Array.isArray(c.series)) {
    c.series = c.series.map((s, i) => ({
      label: formatMonthCodeLabel(s?.label, t),
      color: s?.color || colorFor(i),
      data: Array.isArray(s?.data) ? s.data.map(num) : [],
    }))
  }
  if (Array.isArray(c.data)) {
    c.data = c.data.map((d, i) => ({
      label: formatMonthCodeLabel(d?.label, t),
      value: num(d?.value),
      color: d?.color || colorFor(i),
    }))
  }
  if (!validChartValues(c))
    return null
  return c
})

const lineSeries = computed(() => {
  const c = safeConfig.value
  if (!c?.series?.length)
    return []
  return c.series.map((s, i) => ({
    key: `s${i}`,
    label: s.label,
    color: s.color || colorFor(i),
    data: s.data,
  }))
})

const barData = computed(() => {
  const c = safeConfig.value

  // BarChart wants [{label, value}] — derive from first series if user passed series[].
  if (c?.data?.length)
    return c.data
  if (c?.series?.length && c.categories?.length) {
    const s = c.series[0]
    return c.categories.map((label, i) => ({ label, value: s.data[i] ?? 0, color: s.color }))
  }
  return []
})

const donutData = computed(() => {
  const c = safeConfig.value
  if (!c?.data?.length)
    return []
  return c.data.map((d, i) => ({
    label: d.label,
    value: d.value,
    color: d.color || colorFor(i),
  }))
})

const plotSeries = computed(() => lineSeries.value.length ? lineSeries.value : [{ key: 'value', label: safeConfig.value?.title || t('Value'), data: barData.value.map(row => row.value) }])
const plotCategories = computed(() => safeConfig.value?.categories?.length ? safeConfig.value.categories : barData.value.map(row => row.label))
const chartRows = computed(() => safeConfig.value?.data ?? [])
const visibleRanked = computed(() => expanded.value ? chartRows.value : chartRows.value.slice(0, 6))
const maxValue = computed(() => Math.max(1, ...chartRows.value.map(row => Math.abs(row.value))))
const hasNegative = computed(() => chartRows.value.some(row => row.value < 0))
const rankedOptions = computed(() => chartRows.value.map((row, index) => ({ value: String(index), label: row.label })))
const selectedRow = computed(() => chartRows.value[selected.value])
const subtitle = computed(() => safeConfig.value?.subtitle?.match(/^from\s+\//i) ? t('ai_chart_reported_data') : safeConfig.value?.subtitle)

watch(() => props.config, () => { selected.value = 0; expanded.value = false })
</script>

<template>
  <div
    v-if="!streaming && safeConfig"
    class="aichart"
  >
    <div class="aichart__head">
      <div>
        <div class="aichart__title">
          {{ safeConfig.title || t('ai_chart_reported_data') }}
        </div><div
          v-if="subtitle"
          class="aichart__sub"
          :title="safeConfig.subtitle"
        >
          {{ subtitle }}
        </div>
      </div>
      <DesignIcon
        name="chart"
        :size="18"
      />
    </div>
    <TimeSeriesExplorer
      v-if="safeConfig.type === 'line' || safeConfig.type === 'bar'"
      :series="plotSeries"
      :categories="plotCategories"
      :mode="safeConfig.type === 'line' ? 'area' : 'bar'"
      :height="250"
      :colors="palette"
      compact
    />
    <DistributionChart
      v-else-if="safeConfig.type === 'donut'"
      :data="donutData"
      visual="donut"
      :limit="6"
    />
    <template v-else-if="safeConfig.type === 'hbar'">
      <div class="ai-ranking__readout">
        <span>{{ selectedRow?.label }}</span><strong>{{ selectedRow ? fmtNum(selectedRow.value) : '—' }}</strong>
      </div>
      <div class="ai-ranking">
        <button
          v-for="(row, index) in visibleRanked"
          :key="index"
          type="button"
          :aria-pressed="selected === index"
          :style="{ '--rank-color': colorFor(index) }"
          @click="selected = index"
        >
          <span class="ai-ranking__rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="ai-ranking__label">{{ row.label }}</span><strong>{{ fmtNum(row.value) }}</strong>
          <span
            class="ai-ranking__track"
            :class="{ 'is-diverging': hasNegative }"
            aria-hidden="true"
          ><span :style="{ width: `${Math.abs(row.value) / maxValue * (hasNegative ? 50 : 100)}%`, marginLeft: hasNegative ? `${row.value < 0 ? 50 - Math.abs(row.value) / maxValue * 50 : 50}%` : undefined }" /></span>
        </button>
      </div>
      <Select
        v-if="chartRows.length > 12"
        :model-value="String(selected)"
        :options="rankedOptions"
        :aria-label="t('ai_chart_select_value')"
        @update:model-value="selected = Number($event)"
      />
      <button
        v-else-if="chartRows.length > 6"
        type="button"
        class="ai-ranking__more"
        @click="expanded = !expanded"
      >
        {{ expanded ? t('Show less') : t('Show all {n}', { n: chartRows.length }) }}<DesignIcon
          :name="expanded ? 'chevup' : 'chevdown'"
          :size="15"
        />
      </button>
    </template>
    <details class="aichart__data">
      <summary>{{ t('View chart data') }}</summary><div class="aichart__table-wrap">
        <table>
          <thead>
            <tr>
              <th>{{ t('Name') }}</th><th
                v-for="series in plotSeries"
                :key="series.key"
              >
                {{ series.label }}
              </th>
            </tr>
          </thead><tbody>
            <tr
              v-for="(label, index) in plotCategories"
              :key="index"
            >
              <th>{{ label }}</th><td
                v-for="series in plotSeries"
                :key="series.key"
              >
                {{ Number.isFinite(series.data[index]) ? fmtNum(series.data[index]) : '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </div>
  <div
    v-else-if="streaming"
    class="aichart aichart--placeholder"
    role="status"
  >
    <div
      class="aichart__skeleton"
      aria-hidden="true"
    >
      <span /><span /><span /><span /><span />
    </div><span>{{ t('Generating chart…') }}</span>
  </div>
  <details
    v-else
    class="aichart md-chart-fallback"
  >
    <summary>{{ t('ai_workspace_chart_error') }}</summary><pre>{{ JSON.stringify(config, null, 2) }}</pre>
  </details>
</template>

<style scoped>
.aichart { min-width: 0; border: 1px solid var(--assistant-edge, var(--border)); border-radius: 16px; padding: 18px; margin: 18px 0; background: color-mix(in srgb, var(--surface-2) 35%, var(--surface)); }
.aichart__head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.aichart__head > .ic { color: var(--primary); flex-shrink: 0; }
.aichart__title { font-size: 14px; font-weight: 600; line-height: 1.5; color: var(--text); }
.aichart__sub { font-size: 11px; color: var(--text-secondary); margin-top: 3px; }
.ai-ranking__readout { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 10px; }
.ai-ranking__readout span { font-size: 12px; }
.ai-ranking__readout strong { font-size: 21px; font-weight: 600; font-variant-numeric: tabular-nums; }
.ai-ranking { display: grid; gap: 2px; }
.ai-ranking > button { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px 10px; align-items: center; padding: 12px 8px; border: 1px solid transparent; border-radius: 10px; text-align: start; min-width: 0; }
.ai-ranking > button:hover, .ai-ranking > button[aria-pressed="true"] { border-color: color-mix(in srgb, var(--rank-color) 25%, var(--border)); background: color-mix(in srgb, var(--rank-color) 4%, var(--surface)); }
.ai-ranking__rank { grid-row: 1 / 3; align-self: start; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 8px; background: color-mix(in srgb, var(--rank-color) 12%, var(--surface)); font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text); }
.ai-ranking__label { font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
.ai-ranking > button > strong { font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; color: var(--text); }
.ai-ranking > button[aria-pressed="true"] > strong { padding: 4px 6px; border-radius: 5px; background: #171923; color: #fff; }
.ai-ranking__track { position: relative; grid-column: 2 / -1; height: 18px; border-radius: 5px; background: var(--surface-2); }
.ai-ranking__track.is-diverging::before { content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--border-strong); }
.ai-ranking__track > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(135deg, color-mix(in srgb, var(--rank-color) 45%, white), var(--rank-color)); }
.ai-ranking__more { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; width: 100%; color: var(--primary); font-size: 11px; margin-top: 10px; }
.aichart__data { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-secondary); }
.aichart__data summary { cursor: pointer; min-height: 24px; }
.aichart__table-wrap { max-width: 100%; overflow-x: auto; margin-top: 10px; }
.aichart__data table { width: 100%; border-collapse: collapse; }
.aichart__data th, .aichart__data td { padding: 10px; border-bottom: 1px solid var(--border); text-align: right; font-variant-numeric: tabular-nums; }
.aichart__data th:first-child { text-align: left; }
.aichart__data tbody th { font-weight: 400; }
.aichart--placeholder { color: var(--text-secondary); font-size: 12px; text-align: center; }
.aichart__skeleton { display: flex; align-items: end; justify-content: center; height: 68px; gap: 8px; margin-bottom: 12px; }
.aichart__skeleton span { width: 12%; height: 60%; border-radius: 5px; background: var(--surface-inset); }
.aichart__skeleton span:nth-child(even) { height: 85%; }
.aichart button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@media (max-width: 600px) { .aichart { padding: 12px; } .ai-ranking > button { padding: 10px 0; gap: 7px; } .ai-ranking__readout { padding: 10px; } .ai-ranking__readout strong { font-size: 18px; } }
@media (prefers-reduced-motion: no-preference) { .aichart__skeleton { animation: ai-chart-pending 1.6s ease-in-out infinite; } }
@keyframes ai-chart-pending { 50% { opacity: .4; } }
</style>
