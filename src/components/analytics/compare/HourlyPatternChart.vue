<script setup lang="ts">
/* Orders by hour (0-23), A vs B overlaid — reveals peak-hour shifts. */
import ChartCard from '@/components/design/ChartCard.vue'
import EChart from './EChart.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtInt } from '@/composables/useCurrency'
import type { EChartsOption } from 'echarts'
import type { HourPoint } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })
const { tokens, baseGrid, axisLabel, axisLine, splitLine, tooltip, legend } = useEChartTheme()

interface Props { byHour: { a: HourPoint[], b: HourPoint[] }, labelA: string, labelB: string }
const props = defineProps<Props>()

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
  <ChartCard :eyebrow="t('Time of day')" :title="t('Orders by hour')">
    <EChart :option="option" :height="280" />
  </ChartCard>
</template>
