<script setup lang="ts">
import LineAreaChart from '@/components/design/charts/LineAreaChart.vue'
import BarChart from '@/components/design/charts/BarChart.vue'
import DonutChart from '@/components/design/charts/DonutChart.vue'
import HBarChart from '@/components/design/charts/HBarChart.vue'
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

const PALETTE = [
  'rgb(var(--v-theme-c1))',
  'rgb(var(--v-theme-c2))',
  'rgb(var(--v-theme-c3))',
  'rgb(var(--v-theme-c4))',
  'rgb(var(--v-theme-c5))',
  'rgb(var(--v-theme-primary))',
]

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
      color: s?.color || PALETTE[i % PALETTE.length],
      data: Array.isArray(s?.data) ? s.data.map(num) : [],
    }))
  }
  if (Array.isArray(c.data)) {
    c.data = c.data.map((d, i) => ({
      label: formatMonthCodeLabel(d?.label, t),
      value: num(d?.value),
      color: d?.color || PALETTE[i % PALETTE.length],
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
    color: s.color || PALETTE[i % PALETTE.length],
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
    color: d.color || PALETTE[i % PALETTE.length],
  }))
})

const hbarData = computed(() => {
  const c = safeConfig.value
  if (!c?.data?.length)
    return []
  return c.data.map(item => ({
    name: item.label,
    value: item.value,
  }))
})
</script>

<template>
  <div
    v-if="!streaming && safeConfig"
    class="aichart"
  >
    <div
      v-if="safeConfig.title"
      class="aichart__head"
    >
      <div class="aichart__title">
        {{ safeConfig.title }}
      </div>
      <div
        v-if="safeConfig.subtitle"
        class="aichart__sub"
      >
        {{ safeConfig.subtitle }}
      </div>
    </div>
    <LineAreaChart
      v-if="safeConfig.type === 'line' && safeConfig.categories && lineSeries.length"
      :series="lineSeries"
      :categories="safeConfig.categories"
      :height="220"
    />
    <BarChart
      v-else-if="safeConfig.type === 'bar' && barData.length"
      :data="barData"
      :height="220"
      :value-label="safeConfig.series?.[0]?.label || ''"
    />
    <DonutChart
      v-else-if="safeConfig.type === 'donut' && donutData.length"
      :data="donutData"
      :size="200"
      :center-label="safeConfig.title || ''"
    />
    <HBarChart
      v-else-if="safeConfig.type === 'hbar' && hbarData.length"
      :data="hbarData"
    />
  </div>
  <div
    v-else-if="streaming"
    class="aichart aichart--placeholder"
  >
    <span class="aichart__placeholder-label">{{ t('Generating chart…') }}</span>
  </div>
  <details
    v-else
    class="aichart md-chart-fallback"
  >
    <summary>{{ t('ai_workspace_chart_error') }}</summary>
    <pre>{{ JSON.stringify(config, null, 2) }}</pre>
  </details>
</template>

<style scoped>
.aichart {
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  padding: var(--sp-3);
  margin: var(--sp-3) 0;
  background: var(--surface);
}
.aichart__head {
  margin-bottom: var(--sp-2);
}
.aichart__title {
  font-weight: var(--fw-semibold);
  font-size: var(--fs-md);
  color: var(--text);
}
.aichart__sub {
  font-size: var(--fs-sm);
  color: var(--text-secondary);
  margin-top: 2px;
}
.aichart--placeholder {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: var(--fs-sm);
}
</style>
