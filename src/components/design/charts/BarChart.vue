<script setup lang="ts">
import { labelTicks } from './labelTicks'
import { fmtAbbr, fmtNum } from '@/components/design/utils/format'
import { niceTicks } from '@/components/design/charts/niceTicks'
import { useWidth } from '@/components/design/charts/useWidth'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import ChartTip from '@/components/design/charts/ChartTip.vue'
import { formatMonthCodeLabel } from '@/utils/monthLabels'

const props = withDefaults(defineProps<Props>(), {
  height: 240,
  valueLabel: 'Orders',
  showLabels: false,
  xLabelEvery: 1,
})

const { t } = useI18n({ useScope: 'global' })

interface BarPoint {
  label: string
  value: number
  peak?: boolean
}

interface Props {
  data: BarPoint[]
  height?: number
  valueLabel?: string
  yFormat?: (n: number) => string

  /** Format the bar-top label (defaults to yFormat). */
  labelFormat?: (n: number) => string

  /** Draw a numeric label above every bar (not just the peak). */
  showLabels?: boolean

  /** Keep dense hourly/date labels legible while retaining every hover target. */
  xLabelEvery?: number
  loading?: boolean
}

const [elRef, w] = useWidth()

const padL = 44
const padR = 12
const padT = 14
const padB = 28

const hover = ref<number | null>(null)
const tip = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 })

function reset() {
  hover.value = null
  tip.value = { show: false, x: 0, y: 0 }
}

const yfmt = computed(() => props.yFormat ?? fmtAbbr)

const maxV = computed(() => {
  let m = 0
  for (const d of props.data) {
    if (d.value > m)
      m = d.value
  }

  return m
})

const ticks = computed(() => niceTicks(maxV.value || 1, 4))
const top = computed(() => ticks.value.top)

const iw = computed(() => Math.max(10, w.value - padL - padR))
const ih = computed(() => props.height - padT - padB)
const band = computed(() => iw.value / Math.max(1, props.data.length))
const bw = computed(() => Math.min(band.value * 0.62, 40))

function y(v: number): number {
  return padT + ih.value - (v / top.value) * ih.value
}

function fillFor(d: BarPoint, i: number): string {
  if (d.peak)
    return 'rgb(var(--v-theme-chart-revenue))'
  if (hover.value === i)
    return 'rgb(var(--v-theme-primary-hover))'

  return 'rgb(var(--v-theme-c4))'
}

function opacityFor(d: BarPoint, i: number): number {
  if (hover.value === null)
    return 1
  if (i === hover.value || d.peak)
    return 1

  return 0.55
}

function onEnter(i: number, e: MouseEvent) {
  hover.value = i
  tip.value = { show: true, x: e.clientX, y: e.clientY }
}
function onMove(e: MouseEvent) {
  tip.value = { show: true, x: e.clientX, y: e.clientY }
}

const tipRows = computed(() => {
  if (hover.value === null)
    return []

  return [{
    color: 'rgb(var(--v-theme-chart-revenue))',
    label: props.valueLabel,
    value: fmtNum(props.data[hover.value].value),
  }]
})

function displayLabel(label: string): string {
  return formatMonthCodeLabel(label, t)
}

const tipTitle = computed(() => hover.value !== null ? displayLabel(props.data[hover.value].label) : '')
const labelIndices = computed(() => labelTicks(props.data.map(d => displayLabel(d.label)), iw.value, props.xLabelEvery, true))

const showAllValues = computed(() => props.showLabels
  && band.value >= Math.max(30, ...props.data.map(d => (props.labelFormat || yfmt.value)(d.value).length * 6 + 8)))
</script>

<template>
  <div
    v-if="loading"
    ref="elRef"
    :style="{ height: `${height}px` }"
  >
    <Skeleton
      :h="height"
      :r="10"
    />
  </div>
  <div
    v-else-if="!data.length"
    ref="elRef"
  >
    <StateFill
      icon="bx-bar-chart-alt-2"
      :title="t('No data for this range')"
    />
  </div>
  <div
    v-else
    ref="elRef"
    style="position: relative;"
    @mouseleave="reset"
  >
    <svg
      :width="w"
      :height="height"
      overflow="visible"
      style="display: block; overflow: visible;"
    >
      <!-- gridlines + ticks -->
      <g
        v-for="(tick, i) in ticks.ticks"
        :key="`g${i}`"
      >
        <line
          :x1="padL"
          :x2="w - padR"
          :y1="y(tick)"
          :y2="y(tick)"
          stroke="rgb(var(--v-theme-chart-grid))"
          stroke-width="1"
        />
        <text
          :x="padL - 9"
          :y="y(tick) + 4"
          text-anchor="end"
          font-size="11"
          fill="rgb(var(--v-theme-chart-axis))"
          font-family="var(--font-mono)"
        >{{ yfmt(tick) }}</text>
      </g>

      <g
        v-for="(d, i) in data"
        :key="`b${i}`"
      >
        <rect
          :x="padL + band * i + (band - bw) / 2"
          :y="y(d.value)"
          :width="bw"
          :height="Math.max((d.value / top) * ih, 1)"
          rx="4"
          :fill="fillFor(d, i)"
          :opacity="opacityFor(d, i)"
          style="transition: opacity .12s;"
        />
        <text
          v-if="d.peak || showAllValues"
          :x="padL + band * i + band / 2"
          :y="y(d.value) - 7"
          text-anchor="middle"
          font-size="11"
          :font-weight="d.peak ? 700 : 500"
          :fill="d.peak ? 'rgb(var(--v-theme-chart-revenue))' : 'rgb(var(--v-theme-text-secondary))'"
        >{{ (labelFormat || yfmt)(d.value) }}</text>
        <text
          v-if="labelIndices.has(i)"
          class="chart-axis-label"
          :x="padL + band * i + band / 2"
          :y="height - 9"
          :text-anchor="i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'"
          font-size="11"
          fill="rgb(var(--v-theme-chart-axis))"
        >{{ displayLabel(d.label) }}</text>
        <rect
          :x="padL + band * i"
          :y="padT"
          :width="band"
          :height="ih"
          fill="transparent"
          @mouseenter="onEnter(i, $event)"
          @mousemove="onMove($event)"
        />
      </g>
    </svg>
    <ChartTip
      :show="tip.show"
      :x="tip.x"
      :y="tip.y"
      :title="tipTitle"
      :rows="tipRows"
    />
  </div>
</template>
