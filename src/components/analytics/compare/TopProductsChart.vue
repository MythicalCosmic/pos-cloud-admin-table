<script setup lang="ts">
/* Top N products by Period-A revenue, A vs B grouped vertical bars. */
import ChartCard from '@/components/design/ChartCard.vue'
import EChart from './EChart.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { abbrUZS, fmtUZS } from '@/composables/useCurrency'
import type { EChartsOption } from 'echarts'
import type { ProductRow } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })
const { tokens, baseGrid, axisLabel, axisLine, splitLine, tooltip, legend } = useEChartTheme()

interface Props { products: ProductRow[], labelA: string, labelB: string, topN?: number }
const props = withDefaults(defineProps<Props>(), { topN: 10 })

const top = computed(() => [...props.products].sort((a, b) => b.a_revenue - a.a_revenue).slice(0, props.topN))

const option = computed<EChartsOption>(() => ({
  color: [tokens.value.periodA, tokens.value.periodB],
  grid: { ...baseGrid(), bottom: 24 },
  legend: legend(),
  tooltip: tooltip({ trigger: 'axis', valueFormatter: (v: any) => fmtUZS(Number(v)) }),
  xAxis: {
    type: 'category',
    data: top.value.map(p => p.name),
    axisLabel: { ...axisLabel(), interval: 0, rotate: 32, hideOverlap: false },
    axisLine: axisLine(),
    axisTick: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: { ...axisLabel(), formatter: (v: number) => abbrUZS(v) },
    splitLine: splitLine(),
    axisLine: { show: false },
  },
  series: [
    { name: props.labelA, type: 'bar', data: top.value.map(p => p.a_revenue), barMaxWidth: 16 },
    { name: props.labelB, type: 'bar', data: top.value.map(p => p.b_revenue), barMaxWidth: 16 },
  ],
}))
</script>

<template>
  <ChartCard :eyebrow="t('Top products')" :title="t('Top products by revenue')">
    <EChart :option="option" :height="320" />
  </ChartCard>
</template>
