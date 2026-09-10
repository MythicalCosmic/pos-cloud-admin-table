<script setup lang="ts">
/* Hour × weekday DELTA heatmap: cell = Period A − Period B (orders). Green =
   busier now, red = quieter. Renders only when the matrices are present. */
import ChartCard from '@/components/design/ChartCard.vue'
import EChart from './EChart.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtInt } from '@/composables/useCurrency'
import type { EChartsOption } from 'echarts'

const { t } = useI18n({ useScope: 'global' })
const { tokens, tooltip } = useEChartTheme()

interface Props { matrix: { a: number[][], b: number[][] } }
const props = defineProps<Props>()

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))

const cells = computed(() => {
  const out: [number, number, number][] = []
  let maxAbs = 1
  for (let w = 0; w < 7; w++) {
    for (let h = 0; h < 24; h++) {
      const a = props.matrix.a?.[w]?.[h] ?? 0
      const b = props.matrix.b?.[w]?.[h] ?? 0
      const d = a - b
      if (Math.abs(d) > maxAbs) maxAbs = Math.abs(d)
      out.push([h, w, d])
    }
  }
  return { data: out, maxAbs }
})

const option = computed<EChartsOption>(() => ({
  grid: { left: 8, right: 12, top: 8, bottom: 40, containLabel: true },
  tooltip: tooltip({
    position: 'top',
    formatter: (p: any) => {
      const [h, w, d] = p.data
      const sign = d > 0 ? '+' : d < 0 ? '−' : ''
      return `${t(DOW[w])} ${hours[h]}:00<br/><b>${sign}${fmtInt(Math.abs(d))}</b> ${t('orders')}`
    },
  }),
  xAxis: {
    type: 'category', data: hours,
    axisLabel: { color: tokens.value.textTertiary, fontFamily: tokens.value.fontMono, fontSize: 10, interval: 1 },
    axisLine: { show: false }, axisTick: { show: false }, splitArea: { show: false },
  },
  yAxis: {
    type: 'category', data: DOW.map(d => t(d)),
    axisLabel: { color: tokens.value.textTertiary, fontFamily: tokens.value.fontUI, fontSize: 11 },
    axisLine: { show: false }, axisTick: { show: false },
  },
  visualMap: {
    min: -cells.value.maxAbs, max: cells.value.maxAbs,
    calculable: true, orient: 'horizontal', left: 'center', bottom: 0,
    itemWidth: 12, itemHeight: 120,
    textStyle: { color: tokens.value.textTertiary, fontFamily: tokens.value.fontMono, fontSize: 10 },
    inRange: { color: [tokens.value.negative, tokens.value.surface2, tokens.value.positive] },
  },
  series: [{
    type: 'heatmap',
    data: cells.value.data,
    itemStyle: { borderColor: tokens.value.surface, borderWidth: 1 },
    emphasis: { itemStyle: { borderColor: tokens.value.text, borderWidth: 1 } },
  }],
}))
</script>

<template>
  <ChartCard :eyebrow="t('Demand shift')" :title="t('Busier / quieter by hour × weekday')" :sub="t('Green = busier this period, red = quieter')">
    <EChart :option="option" :height="300" />
  </ChartCard>
</template>
