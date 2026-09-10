<script setup lang="ts">
import { color as chartColor, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'
import ReportState from './ReportState.vue'
import Select from '@/components/design/Select.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import { fmtAbbr, fmtNum, fmtPct } from '@/components/design/utils/format'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { orderChannelColors } from '@/components/design/charts/orderChannelColors'

export interface ChannelPoint { label: string; hall: number | null; delivery: number | null; pickup: number | null }
const props = defineProps<{ data: ChannelPoint[] }>()
const { t } = useI18n({ useScope: 'global' })
const { tokens } = useEChartTheme()
const reducedMotion = usePreferredReducedMotion()
const root = ref<HTMLElement>()
const ready = ref(false)
const selected = ref('total')
const active = ref<number | null>(null)
const keys = ['hall', 'delivery', 'pickup'] as const
const names = computed(() => [t('Hall'), t('Delivery'), t('Pickup')])

const colors = computed(() => {
  const palette = orderChannelColors(tokens.value)
  return keys.map(key => palette[key])
})

const totals = computed(() => Object.fromEntries(keys.map(key => [key, props.data.some(row => row[key] === null) ? null : props.data.reduce((sum, row) => sum + (row[key] ?? 0), 0)])) as Record<typeof keys[number], number | null>)
const current = computed(() => selected.value === 'total' ? totals.value : props.data[Number(selected.value)] ?? totals.value)
const total = computed(() => keys.some(key => current.value[key] === null) ? null : keys.reduce((sum, key) => sum + (current.value[key] ?? 0), 0))
const hasActivity = computed(() => keys.some(key => (current.value[key] ?? 0) > 0))
const hasKnownData = computed(() => keys.some(key => current.value[key] !== null))
const hasMissingData = computed(() => keys.some(key => current.value[key] === null))
const options = computed(() => [{ value: 'total', label: t('dash_selected_period') }, ...props.data.map((row, index) => ({ value: String(index), label: row.label }))])
let observer: IntersectionObserver | undefined

use([SVGRenderer, BarChart, GridComponent, TooltipComponent])
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { ready.value = true; observer?.disconnect() }
  }, { rootMargin: '250px' })
  if (root.value)
    observer.observe(root.value)
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => props.data, () => { selected.value = 'total'; active.value = null })

const option = computed<EChartsOption>(() => {
  const C = tokens.value
  return {
    animation: reducedMotion.value !== 'reduce',
    animationDuration: 360,
    animationDurationUpdate: 180,
    grid: { top: 42, left: 4, right: 4, bottom: 10, containLabel: true },
    tooltip: {
      trigger: 'item',
      renderMode: 'richText',
      confine: true,
      backgroundColor: '#171923',
      borderColor: '#ffffff26',
      textStyle: { color: '#FFFFFF', fontFamily: C.fontUI, fontSize: 12 },
      valueFormatter: value => (value === null || value === undefined) ? '—' : fmtNum(Number(value)),
    },
    xAxis: { type: 'category', data: names.value, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: C.textSecondary, fontFamily: C.fontUI, fontSize: 11, margin: 14 } },
    yAxis: { type: 'value', min: 0, splitNumber: 3, axisLabel: { color: C.textSecondary, fontSize: 10, formatter: (value: number) => fmtAbbr(value) }, splitLine: { lineStyle: { color: C.border, type: [4, 6], opacity: 0.45 } } },
    series: [{
      type: 'bar',
      barMaxWidth: 104,
      barCategoryGap: '22%',
      data: keys.map((key, index) => ({
        name: names.value[index],
        value: current.value[key],
        itemStyle: { opacity: (active.value === null || active.value === index) ? 1 : 0.5, borderRadius: [12, 12, 5, 5], color: { type: 'linear' as const, x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: chartColor.lift(colors.value[index], 0.36) }, { offset: 1, color: colors.value[index] }] } },
      })),
      label: { show: true, position: 'top', distance: 10, color: '#FFFFFF', backgroundColor: '#171923', borderRadius: 5, padding: [5, 7], fontSize: 11, formatter: params => fmtNum(Number(params.value)) },
      emphasis: { itemStyle: { opacity: 1 } },
    }],
  }
})
</script>

<template>
  <div
    ref="root"
    class="channel-flow"
  >
    <div class="channel-flow__scope">
      <Select
        :model-value="selected"
        :options="options"
        :aria-label="t('dash_channel_date')"
        @update:model-value="selected = $event"
      /><span>{{ t('Orders') }} <strong>{{ fmtNum(total) }}</strong></span>
    </div>
    <ReportState
      v-if="!hasActivity"
      :title="t(hasKnownData ? 'dash_no_activity' : 'dash_series_unavailable')"
      :description="t(hasKnownData ? 'Try a different date range.' : 'dash_series_unavailable_body')"
    />
    <div
      v-else
      class="channel-flow__chart"
    >
      <VChart
        v-if="ready"
        :option="option"
        :init-options="{ renderer: 'svg' }"
        autoresize
        @click="active = active === $event.dataIndex ? null : $event.dataIndex"
      />
      <Skeleton
        v-else
        :h="310"
        w="100%"
      />
    </div>
    <p
      v-if="hasMissingData"
      class="channel-flow__notice"
    >
      {{ t('dash_channel_incomplete') }}
    </p>
    <dl
      v-if="data.length"
      class="channel-flow__selection"
      aria-live="polite"
    >
      <div
        v-for="(key, index) in keys"
        :key="key"
      >
        <dt><i :style="{ background: colors[index] }" />{{ names[index] }}</dt><dd>{{ fmtNum(current[key]) }} <small>{{ total && current[key] !== null ? fmtPct(current[key]! / total * 100, 1) : '—' }}</small></dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
.channel-flow { min-width: 0; }
.channel-flow__scope { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.channel-flow__scope > .control--select { width: 180px; max-width: 65%; }
.channel-flow__scope > span { display: grid; gap: 2px; color: var(--text-secondary); text-align: right; font-size: 11px; }
.channel-flow__scope strong { color: var(--text); font-size: 23px; font-weight: 600; font-variant-numeric: tabular-nums; }
.channel-flow__chart { width: 100%; height: 310px; }
.channel-flow__notice { color: var(--text-secondary); font-size: 11px; line-height: 1.5; margin: 0 0 12px; }
.channel-flow__selection { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding-top: 16px; border-top: 1px solid var(--border); margin: 0; }
.channel-flow__selection dt { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-secondary); }
.channel-flow__selection i { width: 6px; height: 6px; border-radius: 2px; }
.channel-flow__selection dd { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 9px; margin: 6px 0 0; font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.channel-flow__selection small { font-size: 10px; font-weight: 500; color: var(--text-secondary); }
@media (max-width: 650px) { .channel-flow__chart { height: 240px; } .channel-flow__scope strong { font-size: 20px; } }
</style>
