<script setup lang="ts">
import { color as chartColor, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { BarChart, LineChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, MarkPointComponent, TooltipComponent } from 'echarts/components'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'
import ReportState from './ReportState.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtAbbr, fmtNum } from '@/components/design/utils/format'
import { formatMonthCodeLabel } from '@/utils/monthLabels'

const props = withDefaults(defineProps<{
  series: Series[]
  categories: string[]
  height?: number
  unit?: string
  mode?: 'area' | 'bar'
  compact?: boolean
}>(), { height: 340, unit: '', mode: 'area', compact: false })

use([SVGRenderer, LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, MarkPointComponent])
interface Series { key: string; label: string; data: number[]; color?: string; dashed?: boolean }
const { t } = useI18n({ useScope: 'global' })
const { tokens } = useEChartTheme()
const root = ref<HTMLElement>()
const chart = ref<InstanceType<typeof VChart>>()
const ready = ref(false)
const reducedMotion = usePreferredReducedMotion()
const chartMode = ref(props.mode)
const cursor = ref(Math.max(0, props.categories.length - 1))
const zoomed = ref(false)
const exploring = ref(false)
const start = ref(0)
const end = ref(100)
let observer: IntersectionObserver | undefined
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      ready.value = true
      observer?.disconnect()
    }
  }, { rootMargin: '250px' })
  if (root.value)
    observer.observe(root.value)
})
onBeforeUnmount(() => { observer?.disconnect() })
watch(() => props.categories, () => {
  cursor.value = Math.max(0, props.categories.length - 1)
  start.value = 0
  end.value = 100
  zoomed.value = false
})

const hasPoints = computed(() => props.categories.length > 0 && props.series.some(series => series.data.length > 0))

const labels = computed(() => props.categories.map(label => formatMonthCodeLabel(label, t)))
const selectedLabel = computed(() => labels.value[cursor.value] || '—')

const selectedValues = computed(() => props.series.map(series => {
  const value = series.data[cursor.value]
  return { label: series.label, value: Number.isFinite(value) ? `${fmtNum(value)}${props.unit ? ` ${props.unit}` : ''}` : '—' }
}))

const pointDescription = computed(() => `${selectedLabel.value}: ${selectedValues.value.map(row => `${row.label} ${row.value}`).join(', ')}`)

const rangeLabel = computed(() => {
  const last = labels.value.length - 1
  return `${labels.value[Math.round(last * start.value / 100)] || ''} — ${labels.value[Math.round(last * end.value / 100)] || ''}`
})

function moveTo(index: number) {
  cursor.value = Math.max(0, Math.min(props.categories.length - 1, index))
  if (cursor.value < Math.round((props.categories.length - 1) * start.value / 100) || cursor.value > Math.round((props.categories.length - 1) * end.value / 100))
    resetZoom()
  chart.value?.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: cursor.value })
}
function selectPoint(event: Event) { moveTo(Number((event.target as HTMLInputElement).value)) }
function onPointKey(event: KeyboardEvent) {
  const next = { ArrowLeft: cursor.value - 1, ArrowRight: cursor.value + 1, Home: 0, End: props.categories.length - 1 }[event.key]
  if (next !== undefined) { event.preventDefault(); moveTo(next) }
}
function onPointer(event: { dataIndex?: number; axesInfo?: Array<{ value?: number }> }) {
  const index = event.dataIndex ?? event.axesInfo?.[0]?.value
  if (typeof index === 'number' && index >= 0 && index < labels.value.length)
    cursor.value = index
}
function onZoom(event: { start?: number; end?: number; batch?: Array<{ start: number; end: number }> }) {
  const data = event.batch?.[0] ?? event

  start.value = data.start ?? 0
  end.value = data.end ?? 100
  zoomed.value = start.value > 0 || end.value < 100

  const firstIndex = Math.round((props.categories.length - 1) * start.value / 100)
  const lastIndex = Math.round((props.categories.length - 1) * end.value / 100)

  cursor.value = Math.max(firstIndex, Math.min(lastIndex, cursor.value))
}
function zoomRecent() {
  chart.value?.dispatchAction({ type: 'dataZoom', start: Math.max(0, (props.categories.length - 7) / Math.max(1, props.categories.length - 1) * 100), end: 100 })
}
function resetZoom() {
  chart.value?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })
}

function seriesColor(index: number): string {
  if (index === 0)
    return tokens.value.primary
  return props.series[index]?.dashed ? tokens.value.textSecondary : tokens.value.expense
}

function barOption(series: Series, index: number) {
  const C = tokens.value
  const color = seriesColor(index)
  return {
    id: series.key,
    name: series.label,
    type: 'bar' as const,
    data: series.data.map((value, point) => ({
      value,
      itemStyle: {
        color: {
          type: 'linear' as const,
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: index === 0 ? C.secondary : chartColor.lift(color, 0.28) },
            { offset: 1, color },
          ],
        },
        opacity: point === cursor.value ? 1 : 0.84,
      },
      label: { show: point === cursor.value && index === 0, formatter: () => fmtAbbr(value) },
    })),
    barMaxWidth: 48,
    barCategoryGap: '18%',
    itemStyle: { borderRadius: [7, 7, 4, 4], borderColor: `${color}22`, borderWidth: 1 },
    label: { position: 'top' as const, color: '#FFFFFF', backgroundColor: '#171923', borderRadius: 5, padding: [5, 7], fontSize: 11, fontFamily: C.fontUI, distance: 9 },
    emphasis: { focus: 'series' as const, itemStyle: { opacity: 1 } },
  }
}

function pointMarker(series: Series, color: string) {
  return {
    silent: true,
    symbol: 'circle',
    symbolSize: 10,
    itemStyle: { color, borderColor: tokens.value.surface, borderWidth: 2 },
    label: { show: true, position: 'top' as const, distance: 10, color: '#FFFFFF', backgroundColor: '#171923', borderRadius: 5, padding: [5, 7], fontSize: 11, formatter: () => fmtAbbr(series.data[cursor.value]) },
    data: Number.isFinite(series.data[cursor.value]) ? [{ name: labels.value[cursor.value], coord: [cursor.value, series.data[cursor.value]] as [number, number], value: series.data[cursor.value] }] : [],
  }
}

function seriesOption(series: Series, index: number) {
  if (chartMode.value === 'bar' && !series.dashed)
    return barOption(series, index)
  const C = tokens.value
  const color = seriesColor(index)

  return {
    id: series.key,
    name: series.label,
    type: 'line' as const,
    data: series.data,
    smooth: 0.25,
    smoothMonotone: 'x' as const,
    showSymbol: series.data.length === 1,
    symbol: 'circle',
    symbolSize: 9,
    itemStyle: { color, borderColor: C.surface, borderWidth: 3 },
    lineStyle: { color: index === 0 ? { type: 'linear' as const, x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: C.secondary }, { offset: 1, color }] } : color, width: series.dashed ? 1.6 : 2.5, type: series.dashed ? 'dashed' as const : 'solid' as const },
    areaStyle: series.dashed ? undefined : { color: { type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: `${index === 0 ? C.secondary : color}65` }, { offset: 1, color: `${color}08` }] } },
    markPoint: index === 0 ? pointMarker(series, color) : undefined,
    emphasis: { focus: 'series' as const, scale: true },
  }
}

const option = computed<EChartsOption>(() => {
  const C = tokens.value

  // Keep backend labels out of HTML tooltips. ECharts rich text renders text only.
  return {
    animation: reducedMotion.value !== 'reduce',
    animationDuration: 350,
    animationDurationUpdate: 180,
    textStyle: { fontFamily: C.fontUI },
    grid: { left: 4, right: 12, top: 38, bottom: (exploring.value && !props.compact) ? 58 : 12, containLabel: true },
    tooltip: {
      renderMode: 'richText',
      trigger: 'axis',
      confine: true,
      backgroundColor: '#171923',
      borderColor: '#ffffff26',
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: '#FFFFFF', fontFamily: C.fontUI, fontSize: 12 },
      axisPointer: { type: chartMode.value === 'bar' ? 'shadow' : 'line', lineStyle: { color: C.primary, type: 'dashed' }, shadowStyle: { color: C.primary, opacity: 0.06 } },
      valueFormatter: value => `${fmtNum(Number(value))}${props.unit ? ` ${props.unit}` : ''}`,
    },
    xAxis: {
      type: 'category',
      data: labels.value,
      boundaryGap: chartMode.value === 'bar',
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: {
        color: C.textSecondary,
        fontSize: 11,
        margin: 16,
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: false,
        formatter: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8)}/${value.slice(5, 7)}` : value,
      },
      axisPointer: { show: true, snap: true },
    },
    yAxis: {
      type: 'value',
      min: props.series.some(series => series.data.some(value => value < 0)) ? undefined : 0,
      splitNumber: 3,
      axisLabel: { color: C.textSecondary, fontSize: 10, fontFamily: C.fontMono, formatter: (value: number) => fmtAbbr(value) },
      splitLine: { lineStyle: { color: C.border, type: [3, 5], opacity: 0.65 } },
    },
    dataZoom: props.compact
      ? []
      : [{
        type: 'slider',
        show: exploring.value,
        height: 28,
        bottom: 4,
        left: 48,
        right: 14,
        start: start.value,
        end: end.value,
        borderColor: 'transparent',
        backgroundColor: C.surface2,
        fillerColor: `${C.primary}18`,
        dataBackground: { lineStyle: { color: C.primary, opacity: 0.2 }, areaStyle: { color: C.primary, opacity: 0.08 } },
        selectedDataBackground: { lineStyle: { color: C.primary }, areaStyle: { color: C.primary, opacity: 0.2 } },
        handleStyle: { color: C.surface, borderColor: C.primary },
        moveHandleSize: 0,
        showDetail: false,
        brushSelect: false,
        labelFormatter: '',
      }],
    series: props.series.map(seriesOption),
  }
})
</script>

<template>
  <div
    ref="root"
    class="series-explorer"
    :class="{ 'series-explorer--compact': compact, 'series-explorer--exploring': exploring }"
  >
    <ReportState
      v-if="!hasPoints"
      :title="t('No data for this range')"
      :description="t('Try a different date range.')"
    />
    <template v-else>
      <div class="series-explorer__tools">
        <slot name="controls">
          <div class="series-explorer__legend">
            <span
              v-for="(item, index) in series"
              :key="item.key"
            ><i :style="{ background: seriesColor(index) }" />{{ item.label }}</span>
          </div>
        </slot>
        <div class="series-explorer__actions">
          <div
            class="series-explorer__modes"
            role="group"
            :aria-label="t('dash_chart_style')"
          >
            <button
              type="button"
              :aria-pressed="chartMode === 'area'"
              :aria-label="t('dash_chart_area')"
              :title="t('dash_chart_area')"
              @click="chartMode = 'area'"
            >
              <DesignIcon
                name="trend"
                :size="17"
              />
            </button>
            <button
              type="button"
              :aria-pressed="chartMode === 'bar'"
              :aria-label="t('dash_chart_bars')"
              :title="t('dash_chart_bars')"
              @click="chartMode = 'bar'"
            >
              <DesignIcon
                name="bars"
                :size="17"
              />
            </button>
          </div>
          <button
            class="series-explorer__explore"
            type="button"
            :aria-expanded="exploring"
            :aria-label="t('dash_chart_details')"
            :title="t('dash_chart_details')"
            @click="exploring = !exploring"
          >
            <DesignIcon
              name="sliders"
              :size="16"
            />
          </button>
        </div>
      </div>
      <div
        class="series-explorer__canvas"
        :style="{ height: `${height + (exploring && !compact ? 44 : 0)}px` }"
        aria-hidden="true"
      >
        <VChart
          v-if="ready"
          ref="chart"
          :option="option"
          :init-options="{ renderer: 'svg' }"
          :update-options="{ replaceMerge: ['series'] }"
          autoresize
          @update-axis-pointer="onPointer"
          @mouseover="onPointer"
          @click="onPointer"
          @datazoom="onZoom"
        />
        <div
          v-else
          class="series-explorer__placeholder"
        >
          <Skeleton
            v-for="row in 4"
            :key="row"
            w="100%"
            :h="1"
          />
        </div>
      </div>
      <div class="series-explorer__readout">
        <div
          class="series-explorer__point"
          tabindex="0"
          role="group"
          :aria-label="t('dash_chart_point')"
          @keydown="onPointKey"
        >
          <span>{{ selectedLabel }}</span>
          <span
            v-for="(row, index) in selectedValues"
            :key="row.label"
            class="series-explorer__value"
          ><i :style="{ background: seriesColor(index) }" />{{ row.label }}<strong>{{ row.value }}</strong></span>
        </div>
        <div class="series-explorer__steps">
          <button
            type="button"
            :disabled="cursor === 0"
            :aria-label="t('dash_previous_point')"
            @click="moveTo(cursor - 1)"
          >
            <DesignIcon
              name="arrowleft"
              :size="16"
            />
          </button>
          <button
            type="button"
            :disabled="cursor >= categories.length - 1"
            :aria-label="t('dash_next_point')"
            @click="moveTo(cursor + 1)"
          >
            <DesignIcon
              name="arrowright"
              :size="16"
            />
          </button>
        </div>
      </div>
      <div
        v-if="exploring"
        class="series-explorer__details"
      >
        <div
          v-if="!compact && categories.length > 7"
          class="series-explorer__zoom"
        >
          <span>{{ rangeLabel }}</span>
          <button
            v-if="zoomed"
            type="button"
            @click="resetZoom"
          >
            {{ t('dash_chart_reset') }}
          </button>
          <button
            v-else
            type="button"
            @click="zoomRecent"
          >
            {{ t('dash_chart_zoom_week') }}<DesignIcon
              name="arrowright"
              :size="13"
            />
          </button>
        </div>
        <input
          class="series-explorer__scrubber"
          type="range"
          min="0"
          :max="Math.max(0, categories.length - 1)"
          :value="cursor"
          :disabled="!categories.length"
          :aria-label="t('dash_chart_point')"
          :aria-valuetext="pointDescription"
          @input="selectPoint"
        >
      </div>
    </template>
  </div>
</template>

<style scoped>
.series-explorer { min-width: 0; }
.series-explorer__tools { display: flex; justify-content: space-between; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
.series-explorer__legend { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 11px; color: var(--text-secondary); }
.series-explorer__legend span { display: flex; align-items: center; gap: 6px; }
.series-explorer__legend i, .series-explorer__value i { flex-shrink: 0; display: inline-block; width: 6px; height: 6px; border-radius: 2px; }
.series-explorer__actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.series-explorer__modes { display: flex; padding: 3px; background: var(--surface-2); border-radius: 9px; }
.series-explorer__modes button, .series-explorer__explore, .series-explorer__steps button { width: 40px; min-height: 40px; display: grid; place-items: center; border-radius: 7px; color: var(--text-secondary); transition: background 140ms, color 140ms; }
.series-explorer__modes button[aria-pressed="true"] { background: var(--surface); color: var(--primary); }
.series-explorer__modes button:hover, .series-explorer__explore:hover, .series-explorer__steps button:hover:not(:disabled) { background: var(--primary-weak); color: var(--primary); }
.series-explorer__explore { border: 1px solid var(--border); }
.series-explorer__explore[aria-expanded="true"] { color: var(--primary); background: var(--primary-weak); border-color: var(--primary); }
.series-explorer button:focus-visible, .series-explorer input:focus-visible, .series-explorer__point:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.series-explorer__canvas { width: 100%; min-width: 0; overflow: hidden; }
.series-explorer__placeholder { display: grid; height: 100%; align-content: space-around; padding: 16px 12px 16px 40px; }
.series-explorer__readout { display: flex; align-items: center; justify-content: space-between; gap: 8px 16px; border-top: 1px solid var(--border); padding-top: 7px; min-height: 48px; }
.series-explorer__point { min-width: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: center; color: var(--text-secondary); font-size: 11px; border-radius: 4px; }
.series-explorer__point > span:first-child { font-weight: 600; color: var(--text); }
.series-explorer__value { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-width: 0; }
.series-explorer__value strong { color: var(--text); font-variant-numeric: tabular-nums; font-weight: 600; }
.series-explorer__steps { display: flex; flex-shrink: 0; gap: 2px; }
.series-explorer__steps button:disabled { opacity: .35; cursor: default; }
.series-explorer__details { border-top: 1px solid var(--border); margin-top: 6px; }
.series-explorer__zoom { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; justify-content: space-between; color: var(--text-secondary); font-size: 10px; }
.series-explorer__zoom button { display: flex; gap: 6px; align-items: center; color: var(--primary); min-height: 44px; font-size: 11px; font-weight: 600; }
.series-explorer__scrubber { appearance: none; width: 100%; height: 28px; cursor: ew-resize; background: transparent; }
.series-explorer__scrubber::-webkit-slider-runnable-track { height: 2px; background: var(--border); border-radius: 2px; }
.series-explorer__scrubber::-moz-range-track { height: 2px; background: var(--border); border-radius: 2px; }
.series-explorer__scrubber::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; margin-top: -5px; border-radius: 50%; background: var(--primary); }
.series-explorer__scrubber::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: var(--primary); }
@media (max-width: 600px) {
  .series-explorer__modes button, .series-explorer__explore, .series-explorer__steps button { width: 44px; min-height: 44px; }
  .series-explorer__scrubber { height: 44px; }
  .series-explorer__point { gap: 6px; flex-direction: column; align-items: flex-start; }
}
@media (prefers-reduced-motion: reduce) { .series-explorer button { transition: none; } }
</style>
