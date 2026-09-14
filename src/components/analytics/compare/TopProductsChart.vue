<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import ChartCard from '@/components/design/ChartCard.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { abbrUZS, fmtUZS } from '@/composables/useCurrency'
import type { ProductRow } from '@/types/comparison'

/* Top products by Period-A revenue. Horizontal bars keep long translated
   product names readable on desktop and narrow phone layouts. */
interface Props { products: ProductRow[]; labelA: string; labelB: string; topN?: number }

const props = withDefaults(defineProps<Props>(), { topN: 10 })
const { t } = useI18n({ useScope: 'global' })
const { tokens, axisLabel, splitLine, tooltip, legend } = useEChartTheme()

const top = computed(() => [...props.products]
  .sort((a, b) => b.a_revenue - a.a_revenue)
  .slice(0, props.topN)
  .reverse())

function compactName(value: string): string {
  return value.length > 30 ? `${value.slice(0, 28)}…` : value
}

const option = computed<EChartsOption>(() => ({
  color: [tokens.value.periodA, tokens.value.periodB],
  grid: { left: 8, right: 18, top: 34, bottom: 8, containLabel: true },
  legend: legend(),
  tooltip: tooltip({ trigger: 'axis', valueFormatter: (v: any) => fmtUZS(Number(v)) }),
  xAxis: {
    type: 'value',
    axisLabel: { ...axisLabel(), formatter: (v: number) => abbrUZS(v) },
    splitLine: splitLine(),
    axisLine: { show: false },
  },
  yAxis: {
    type: 'category',
    data: top.value.map(p => p.name),
    axisLabel: { ...axisLabel(), formatter: compactName, width: 176, overflow: 'truncate' },
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [
    { name: props.labelA, type: 'bar', data: top.value.map(p => p.a_revenue), barMaxWidth: 16 },
    { name: props.labelB, type: 'bar', data: top.value.map(p => p.b_revenue), barMaxWidth: 16 },
  ],
}))

const height = computed(() => Math.max(260, top.value.length * 42 + 60))
</script>

<template>
  <ChartCard
    :eyebrow="t('Top products')"
    :title="t('Top products by revenue')"
  >
    <EChart
      :option="option"
      :height="height"
      :aria-label="t('Top products by revenue')"
    />
  </ChartCard>
</template>
