<script setup lang="ts">
/* Revenue by weekday (Mon-Sun, 0=Mon), A vs B grouped bars. */
import ChartCard from '@/components/design/ChartCard.vue'
import EChart from './EChart.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { abbrUZS, fmtUZS } from '@/composables/useCurrency'
import type { EChartsOption } from 'echarts'
import type { WeekdayPoint } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })
const { tokens, baseGrid, axisLabel, axisLine, splitLine, tooltip, legend } = useEChartTheme()

interface Props { byWeekday: { a: WeekdayPoint[], b: WeekdayPoint[] }, labelA: string, labelB: string }
const props = defineProps<Props>()

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const labels = computed(() => DOW.map(d => t(d)))
const val = (arr: WeekdayPoint[]) => DOW.map((_, w) => arr.find(p => p.weekday === w)?.value ?? 0)

const option = computed<EChartsOption>(() => ({
  color: [tokens.value.periodA, tokens.value.periodB],
  grid: baseGrid(),
  legend: legend(),
  tooltip: tooltip({ trigger: 'axis', valueFormatter: (v: any) => fmtUZS(Number(v)) }),
  xAxis: { type: 'category', data: labels.value, axisLabel: axisLabel(), axisLine: axisLine(), axisTick: { show: false } },
  yAxis: { type: 'value', axisLabel: { ...axisLabel(), formatter: (v: number) => abbrUZS(v) }, splitLine: splitLine(), axisLine: { show: false } },
  series: [
    { name: props.labelA, type: 'bar', data: val(props.byWeekday.a), barMaxWidth: 18 },
    { name: props.labelB, type: 'bar', data: val(props.byWeekday.b), barMaxWidth: 18 },
  ],
}))
</script>

<template>
  <ChartCard :eyebrow="t('Weekday')" :title="t('Revenue by weekday')">
    <EChart :option="option" :height="280" />
  </ChartCard>
</template>
