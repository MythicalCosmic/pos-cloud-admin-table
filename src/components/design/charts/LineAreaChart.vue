<script setup lang="ts">
import { getCurrentInstance } from 'vue'
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
})

const { t } = useI18n({ useScope: 'global' })

interface Series {
  key: string
  label: string
  color: string
  data: number[]
  dashed?: boolean
}

interface Props {
  series: Series[]
  categories: string[]
  height?: number
  target?: number
  unit?: string
  yFormat?: (n: number) => string
  loading?: boolean
}

const [elRef, w] = useWidth()

const padL = 52
const padR = 16
const padT = 16
const padB = 28

const id = `chart-line-${getCurrentInstance()?.uid}`

const hover = ref<number | null>(null)
const tip = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 })

function reset() {
  hover.value = null
  tip.value = { show: false, x: 0, y: 0 }
}

const yfmt = computed(() => props.yFormat ?? fmtAbbr)

const maxV = computed(() => {
  // BE often hands money over as Decimal-as-string. Coerce here so callers that
  // forget to map(Number) don't end up with a lex-compared max that caps too low.
  let m = 0
  for (const s of props.series) {
    for (const v of s.data) {
      const n = typeof v === 'string' ? Number(v) : v
      if (Number.isFinite(n) && n > m)
        m = n
    }
  }
  if (props.target && props.target > m)
    m = props.target

  return m
})

const ticks = computed(() => niceTicks(maxV.value || 1, 4))
const top = computed(() => ticks.value.top)

const iw = computed(() => Math.max(10, w.value - padL - padR))
const ih = computed(() => props.height - padT - padB)

function x(i: number): number {
  const n = props.categories.length
  if (n <= 1)
    return padL + iw.value / 2

  return padL + (i / (n - 1)) * iw.value
}
function y(v: number): number {
  return padT + ih.value - (v / top.value) * ih.value
}

const displayCategories = computed(() =>
  props.categories.map(label => formatMonthCodeLabel(label, t)),
)

const labelIndices = computed(() => labelTicks(displayCategories.value, iw.value))

const paths = computed(() => {
  if (!w.value)
    return []

  return props.series.map((s, si) => {
    const pts = s.data.map((v, i) => [x(i), y(v)])
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')

    // Close the area at the actual last data point, NOT categories.length-1 —
    // a series shorter than categories.length would otherwise produce a
    // triangular spike past the line's end.
    const lastIdx = Math.max(0, s.data.length - 1)
    const area = `${line} L${x(lastIdx)} ${padT + ih.value} L${x(0)} ${padT + ih.value} Z`

    return { si, series: s, line, area }
  })
})

function onBandEnter(i: number, e: MouseEvent) {
  hover.value = i
  tip.value = { show: true, x: e.clientX, y: e.clientY }
}
function onBandMove(e: MouseEvent) {
  tip.value = { show: true, x: e.clientX, y: e.clientY }
}

const tipRows = computed(() => {
  if (hover.value === null)
    return []
  const i = hover.value
  const styles = elRef.value ? getComputedStyle(elRef.value) : null

  return props.series
    .filter(s => Number.isFinite(s.data[i]))
    .map(s => ({
      // The tooltip is teleported to body, outside page-specific chart tokens.
      color: s.color.replace(/var\((--[\w-]+)\)/g, (match, token) => styles?.getPropertyValue(token).trim() || match),
      label: s.label,
      value: `${fmtNum(s.data[i])}${props.unit ? ` ${props.unit}` : ''}`,
    }))
})

const tipTitle = computed(() => hover.value !== null ? displayCategories.value[hover.value] : '')
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
    v-else-if="!series.length || !categories.length"
    ref="elRef"
  >
    <StateFill
      icon="bx-line-chart"
      :title="t('No data for this range')"
      :sub="t('Try a different date range.')"
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
      style="display:block;"
    >
      <defs>
        <linearGradient
          :id="id"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            :stop-color="series[0]?.color"
            stop-opacity="0.18"
          />
          <stop
            offset="100%"
            :stop-color="series[0]?.color"
            stop-opacity="0"
          />
        </linearGradient>
      </defs>

      <!-- gridlines -->
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
          :x="padL - 10"
          :y="y(tick) + 4"
          text-anchor="end"
          font-size="11"
          fill="rgb(var(--v-theme-chart-axis))"
          font-family="var(--font-mono)"
        >{{ yfmt(tick) }}</text>
      </g>

      <!-- target reference -->
      <g v-if="target">
        <line
          :x1="padL"
          :x2="w - padR"
          :y1="y(target)"
          :y2="y(target)"
          stroke="rgb(var(--v-theme-chart-target))"
          stroke-width="1.5"
          stroke-dasharray="5 4"
        />
        <text
          :x="w - padR"
          :y="y(target) - 6"
          text-anchor="end"
          font-size="11"
          font-weight="600"
          fill="rgb(var(--v-theme-chart-target))"
        >{{ t('Target') }} {{ yfmt(target) }}</text>
      </g>

      <!-- series paths -->
      <g
        v-for="p in paths"
        :key="`p${p.si}`"
      >
        <path
          v-if="p.si === 0"
          :d="p.area"
          :fill="`url(#${id})`"
        />
        <path
          :d="p.line"
          fill="none"
          :stroke="p.series.color"
          :stroke-width="p.series.key === 'expense' ? 2 : 2.5"
          :stroke-dasharray="p.series.dashed ? '5 4' : '0'"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </g>

      <!-- hover crosshair + dots — wrapped so the geometry-attribute transitions can slide -->
      <line
        v-if="hover !== null"
        class="chart-crosshair"
        :x1="x(hover)"
        :x2="x(hover)"
        :y1="padT"
        :y2="padT + ih"
        stroke="rgb(var(--v-theme-border-strong))"
        stroke-width="1"
      />
      <circle
        v-for="(s, si) in (hover !== null ? series : [])"
        v-show="hover !== null && Number.isFinite(s.data[hover!])"
        :key="`hc${si}`"
        class="chart-hover-dot"
        :cx="x(hover!)"
        :cy="y(s.data[hover!] ?? 0)"
        r="4.5"
        fill="rgb(var(--v-theme-surface))"
        :stroke="s.color"
        stroke-width="2.5"
      />

      <!-- x labels -->
      <text
        v-for="(c, i) in displayCategories"
        v-show="labelIndices.has(i)"
        :key="`x${i}`"
        class="chart-axis-label"
        :x="x(i)"
        :y="height - 8"
        :text-anchor="i === 0 ? 'start' : i === categories.length - 1 ? 'end' : 'middle'"
        font-size="11"
        fill="rgb(var(--v-theme-chart-axis))"
      >{{ c }}</text>

      <!-- hover bands -->
      <rect
        v-for="(_, i) in categories"
        :key="`h${i}`"
        :x="x(i) - iw / categories.length / 2"
        :y="padT"
        :width="iw / categories.length"
        :height="ih"
        fill="transparent"
        @mouseenter="onBandEnter(i, $event)"
        @mousemove="onBandMove($event)"
      />
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

<style scoped>
/* Modern browsers transition SVG geometry attributes via CSS — Chrome 78+ /
   Firefox 130+. Falls back to the old jumpy behavior on unsupported engines. */
.chart-crosshair {
  transition: x1 .14s cubic-bezier(.2, .8, .2, 1),
              x2 .14s cubic-bezier(.2, .8, .2, 1);
}
.chart-hover-dot {
  transition: cx .14s cubic-bezier(.2, .8, .2, 1),
              cy .14s cubic-bezier(.2, .8, .2, 1);
}
</style>
