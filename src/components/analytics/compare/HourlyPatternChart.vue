<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import EChart from './EChart.vue'
import ChartCard from '@/components/design/ChartCard.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtInt } from '@/composables/useCurrency'
import type { HourPoint } from '@/types/comparison'

/* Period A and B orders by hour reveal changes in peak demand. */
interface Props { byHour: { a: HourPoint[]; b: HourPoint[] }; labelA: string; labelB: string }

const props = defineProps<Props>()
const { t } = useI18n({ useScope: 'global' })
const { tokens, baseGrid, axisLabel, axisLine, splitLine, tooltip, legend } = useEChartTheme()
const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const val = (arr: HourPoint[]) => hours.map((_, h) => arr.find(p => p.hour === h)?.value ?? 0)

const option = computed<EChartsOption>(() => ({
  color: [tokens.value.periodA, tokens.value.periodB],
  grid: baseGrid(),
  legend: legend(),
  tooltip: tooltip({ trigger: 'axis', valueFormatter: (v: any) => fmtInt(Number(v)) }),
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: hours,
    axisLabel: { ...axisLabel(), interval: 1 },
    axisLine: axisLine(),
    axisTick: { show: false },
  },
  yAxis: { type: 'value', axisLabel: axisLabel(), splitLine: splitLine(), axisLine: { show: false } },
  series: [
    { name: props.labelA, type: 'line', smooth: true, showSymbol: false, data: val(props.byHour.a), lineStyle: { width: 2.2 }, areaStyle: { color: tokens.value.periodA, opacity: 0.06 } },
    { name: props.labelB, type: 'line', smooth: true, showSymbol: false, data: val(props.byHour.b), lineStyle: { width: 2, type: 'dashed' } },
  ],
}))
</script>

<template>
  <ChartCard
    :eyebrow="t('Time of day')"
    :title="t('Orders by hour')"
  >
    <EChart
      :option="option"
      :height="280"
      :aria-label="t('Orders by hour')"
    />
  </ChartCard>
</template>
