<script setup lang="ts">
/* Hero chart: Period A vs Period B revenue overlaid on a shared relative axis
   (Day 1..N) so the two periods actually line up. Tooltip shows both real
   dates + the per-point delta. Axis-label toggle: relative index vs A's dates. */
import ChartCard from '@/components/design/ChartCard.vue'
import EChart from './EChart.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { alignSeries } from '@/composables/useComparison'
import { abbrUZS, fmtUZS } from '@/composables/useCurrency'
import type { EChartsOption } from 'echarts'
import type { RevenueTimeseries } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })
const { tokens, baseGrid, axisLabel, axisLine, splitLine, tooltip, legend } = useEChartTheme()

interface Props {
  series: RevenueTimeseries
  labelA: string
  labelB: string
  loading?: boolean
}
const props = defineProps<Props>()

const axisMode = ref<'index' | 'date'>('index')
const aligned = computed(() => alignSeries(props.series.a, props.series.b))

const option = computed<EChartsOption>(() => {
  const pts = aligned.value
  const xLabels = pts.map(p => axisMode.value === 'date' ? (p.aDate ?? String(p.index)) : String(p.index))
  const aVals = pts.map(p => p.aValue)
  const bVals = pts.map(p => p.bValue)

  return {
    color: [tokens.value.periodA, tokens.value.periodB],
    grid: baseGrid(),
    legend: legend(),
    tooltip: tooltip({
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: tokens.value.border } },
      formatter: (params: any) => {
        const i = Array.isArray(params) ? params[0]?.dataIndex ?? 0 : 0
        const p = pts[i]
        if (!p) return ''
        const av = p.aValue ?? 0
        const bv = p.bValue ?? 0
        const delta = av - bv
        const dSign = delta > 0 ? '+' : delta < 0 ? '−' : ''
        const dColor = delta > 0 ? tokens.value.positive : delta < 0 ? tokens.value.negative : tokens.value.textTertiary
        const row = (color: string, label: string, date: string | null, val: number | null) =>
          `<div style="display:flex;align-items:center;gap:6px;margin-top:3px;">
             <span style="width:9px;height:9px;border-radius:2px;background:${color};display:inline-block;"></span>
             <span style="color:${tokens.value.textSecondary};">${label}</span>
             <span style="color:${tokens.value.textTertiary};font-size:11px;">${date ?? '—'}</span>
             <b style="margin-left:auto;font-family:${tokens.value.fontMono};">${val === null ? '—' : fmtUZS(val)}</b>
           </div>`
        return `<div style="min-width:220px;">
            <div style="font-weight:600;">${t('Day')} ${p.index}</div>
            ${row(tokens.value.periodA, props.labelA, p.aDate, p.aValue)}
            ${row(tokens.value.periodB, props.labelB, p.bDate, p.bValue)}
            <div style="margin-top:5px;padding-top:5px;border-top:1px solid ${tokens.value.border};display:flex;justify-content:space-between;">
              <span style="color:${tokens.value.textTertiary};">${t('Difference')}</span>
              <b style="color:${dColor};font-family:${tokens.value.fontMono};">${dSign}${fmtUZS(Math.abs(delta))}</b>
            </div>
          </div>`
      },
    }),
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xLabels,
      axisLabel: { ...axisLabel(), hideOverlap: true },
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
      {
        name: props.labelA,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: aVals,
        lineStyle: { width: 2.4 },
        areaStyle: { color: tokens.value.periodA, opacity: 0.08 },
      },
      {
        name: props.labelB,
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: bVals,
        lineStyle: { width: 2, type: 'dashed' },
      },
    ],
  }
})
</script>

<template>
  <ChartCard
    :eyebrow="t('Revenue over time')"
    :title="t('Period A vs Period B')"
  >
    <template #actions>
      <div class="seg">
        <button
          type="button"
          class="seg__btn"
          :class="{ 'is-active': axisMode === 'index' }"
          @click="axisMode = 'index'"
        >{{ t('Aligned') }}</button>
        <button
          type="button"
          class="seg__btn"
          :class="{ 'is-active': axisMode === 'date' }"
          @click="axisMode = 'date'"
        >{{ t('Dates') }}</button>
      </div>
    </template>
    <EChart :option="option" :height="320" :loading="loading" />
  </ChartCard>
</template>

<style scoped>
.seg { display: inline-flex; background: var(--surface-2); border-radius: var(--r-sm); padding: 2px; gap: 2px; }
.seg__btn {
  border: 0; background: transparent; cursor: pointer;
  font-family: inherit; font-size: 12px; font-weight: 500;
  color: var(--text-secondary); padding: 4px 10px; border-radius: calc(var(--r-sm) - 2px);
}
.seg__btn.is-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-xs); font-weight: 600; }
</style>
