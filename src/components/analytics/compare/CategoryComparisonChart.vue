<script setup lang="ts">
/* Category revenue A vs B. Two views:
   - Grouped: horizontal bars, A and B side by side per category.
   - Delta: a single diverging bar of Δ% (gainers right/green, losers left/red). */
import ChartCard from '@/components/design/ChartCard.vue'
import EChart from './EChart.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { abbrUZS, fmtUZS } from '@/composables/useCurrency'
import type { EChartsOption } from 'echarts'
import type { CategoryRow } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })
const { tokens, axisLabel, axisLine, splitLine, tooltip, legend } = useEChartTheme()

interface Props { categories: CategoryRow[], labelA: string, labelB: string }
const props = defineProps<Props>()

const view = ref<'grouped' | 'delta'>('grouped')

const sorted = computed(() => [...props.categories].sort((a, b) => a.a_revenue - b.a_revenue))
const names = computed(() => sorted.value.map(c => c.name))

const option = computed<EChartsOption>(() => {
  const base = {
    grid: { left: 8, right: 16, top: 26, bottom: 6, containLabel: true },
    yAxis: {
      type: 'category' as const,
      data: names.value,
      axisLabel: axisLabel(),
      axisLine: axisLine(),
      axisTick: { show: false },
    },
  }
  if (view.value === 'delta') {
    const data = sorted.value.map(c => ({
      value: c.delta_pct ?? 0,
      itemStyle: { color: (c.delta_pct ?? 0) >= 0 ? tokens.value.positive : tokens.value.negative },
    }))
    return {
      ...base,
      tooltip: tooltip({
        trigger: 'axis',
        formatter: (p: any) => {
          const c = sorted.value[p[0]?.dataIndex ?? 0]
          const pct = c?.delta_pct
          return `<b>${c?.name}</b><br/>${t('Change')}: ${pct === null ? t('New') : `${pct! >= 0 ? '+' : '−'}${Math.abs(Math.round(pct! * 10) / 10)}%`}`
        },
      }),
      xAxis: {
        type: 'value',
        axisLabel: { ...axisLabel(), formatter: '{value}%' },
        splitLine: splitLine(),
      },
      series: [{ type: 'bar', data, barMaxWidth: 18, label: { show: false } }],
    }
  }
  return {
    ...base,
    color: [tokens.value.periodA, tokens.value.periodB],
    legend: legend(),
    tooltip: tooltip({
      trigger: 'axis',
      valueFormatter: (v: any) => fmtUZS(Number(v)),
    }),
    xAxis: {
      type: 'value',
      axisLabel: { ...axisLabel(), formatter: (v: number) => abbrUZS(v) },
      splitLine: splitLine(),
    },
    series: [
      { name: props.labelA, type: 'bar', data: sorted.value.map(c => c.a_revenue), barMaxWidth: 12 },
      { name: props.labelB, type: 'bar', data: sorted.value.map(c => c.b_revenue), barMaxWidth: 12 },
    ],
  }
})

const height = computed(() => Math.max(240, names.value.length * 38 + 40))
</script>

<template>
  <ChartCard
    :eyebrow="t('Category breakdown')"
    :title="t('Revenue by category')"
  >
    <template #actions>
      <div class="seg">
        <button type="button" class="seg__btn" :class="{ 'is-active': view === 'grouped' }" @click="view = 'grouped'">{{ t('Side by side') }}</button>
        <button type="button" class="seg__btn" :class="{ 'is-active': view === 'delta' }" @click="view = 'delta'">{{ t('Change') }}</button>
      </div>
    </template>
    <EChart :option="option" :height="height" />
  </ChartCard>
</template>

<style scoped>
.seg { display: inline-flex; background: var(--surface-2); border-radius: var(--r-sm); padding: 2px; gap: 2px; }
.seg__btn { border: 0; background: transparent; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 500; color: var(--text-secondary); padding: 4px 10px; border-radius: calc(var(--r-sm) - 2px); }
.seg__btn.is-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-xs); font-weight: 600; }
</style>
