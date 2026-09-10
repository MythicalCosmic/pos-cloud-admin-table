<script setup lang="ts">
/**
 * Stacked or grouped vertical bars with axis grid + legend toggle + tooltip.
 * Direct port of StackedBar(props) in
 * .tmp-handoff-v3/pos-admin-panel/project/app/charts2.jsx (lines 126-192).
 *
 * - data: [{label, values:{k:v}}], series: [{key,label,color}]
 * - When `grouped` is true, bars sit side-by-side per band; otherwise they stack.
 * - Legend buttons toggle a per-key hidden map. niceTicks() picks the y-axis.
 * - Tooltip shared via useTip() + <ChartTip>.
 */
import { useShown } from '@/composables/useAlphaMotion'
import { fmtAbbr, fmtNum } from '../utils/format'
import ChartTip from '@/components/design/charts/ChartTip.vue'
import StateFill from '../StateFill.vue'
import { niceTicks } from '@/components/design/charts/niceTicks'
import { useTip } from './useTip'
import { useWidth } from '@/components/design/charts/useWidth'

interface Series {
  key: string
  label: string
  color: string
}

interface Datum {
  label: string
  values: Record<string, number>
}

interface Props {
  data: Datum[]
  series: Series[]
  height?: number
  grouped?: boolean
  yFormat?: (n: number) => string
}

const props = withDefaults(defineProps<Props>(), {
  height: 280,
  grouped: false,
})

const { t: tr } = useI18n({ useScope: 'global' })

const shown = useShown(80)
const [boxRef, w] = useWidth()
const { tip, show, move, hide } = useTip()
const hidden = ref<Record<string, boolean>>({})

const visibleSeries = computed(() => props.series.filter(s => !hidden.value[s.key]))

const padL = 46
const padR = 12
const padT = 14
const padB = 30

const layout = computed(() => {
  const iw = Math.max(10, w.value - padL - padR)
  const ih = props.height - padT - padB
  const totals = props.data.map(d => visibleSeries.value.reduce((a, s) => a + (d.values[s.key] || 0), 0))
  const maxStack = props.grouped
    ? Math.max(1, ...props.data.map(d => Math.max(0, ...visibleSeries.value.map(s => d.values[s.key] || 0))))
    : Math.max(1, ...totals)
  const { top, ticks } = niceTicks(maxStack, 4)
  const band = iw / Math.max(1, props.data.length)
  const y = (v: number) => padT + ih - (v / top) * ih

  return { iw, ih, top, ticks, band, y }
})

const fmt = computed(() => props.yFormat ?? fmtAbbr)

function toggleSeries(key: string) {
  hidden.value = { ...hidden.value, [key]: !hidden.value[key] }
}

function buildStack(d: Datum) {
  const out: { s: Series; v: number; bh: number; yTop: number }[] = []
  let acc = 0
  for (const s of visibleSeries.value) {
    const v = d.values[s.key] || 0
    const bh = (v / layout.value.top) * layout.value.ih
    out.push({ s, v, bh, yTop: layout.value.y(acc + v) })
    acc += v
  }
  return out
}

function stackRows(d: Datum) {
  return props.series.map(s => ({
    color: s.color,
    label: s.label,
    value: fmtNum(d.values[s.key] || 0),
  }))
}
</script>

<template>
  <div
    v-if="!data.length"
    ref="boxRef"
  >
    <StateFill
      icon="chart"
      :title="tr('No data')"
      :style="{ height: `${height}px` }"
    />
  </div>
  <div
    v-else
    ref="boxRef"
    style="position: relative;"
  >
    <svg
      :width="w"
      :height="height"
      overflow="visible"
      style="display: block; overflow: visible;"
      @mouseleave="hide"
    >
      <g v-for="(t, i) in layout.ticks" :key="`t${i}`">
        <line
          :x1="padL"
          :x2="w - padR"
          :y1="layout.y(t)"
          :y2="layout.y(t)"
          stroke="var(--chart-grid)"
        />
        <text
          :x="padL - 8"
          :y="layout.y(t) + 4"
          text-anchor="end"
          font-size="11"
          fill="var(--chart-axis)"
          font-family="var(--font-mono)"
        >{{ fmt(t) }}</text>
      </g>

      <template v-for="(d, i) in data" :key="`d${i}`">
        <g v-if="grouped">
          <template v-for="(s, si) in visibleSeries" :key="s.key">
            <rect
              :x="padL + layout.band * i + (layout.band - layout.band * 0.7) / 2 + si * ((layout.band * 0.7) / Math.max(1, visibleSeries.length)) + 1"
              :y="layout.y(d.values[s.key] || 0)"
              :width="(layout.band * 0.7) / Math.max(1, visibleSeries.length) - 2"
              :height="Math.max(0, ((d.values[s.key] || 0) / layout.top) * layout.ih)"
              rx="3"
              :fill="s.color"
              :style="{
                transformBox: 'fill-box',
                transformOrigin: 'bottom',
                transform: shown ? 'scaleY(1)' : 'scaleY(0)',
                transition: `transform .6s cubic-bezier(.2,.8,.2,1) ${i * 0.03}s`,
              }"
              @mouseenter="show($event, d.label, [{ color: s.color, label: s.label, value: fmtNum(d.values[s.key] || 0) }])"
              @mousemove="move"
            />
          </template>
          <text
            :x="padL + layout.band * i + layout.band / 2"
            :y="height - 10"
            text-anchor="middle"
            font-size="11"
            fill="var(--chart-axis)"
          >{{ d.label }}</text>
        </g>
        <g v-else>
          <rect
            v-for="seg in buildStack(d)"
            :key="seg.s.key"
            :x="padL + layout.band * i + (layout.band - Math.min(layout.band * 0.6, 46)) / 2"
            :y="seg.yTop"
            :width="Math.min(layout.band * 0.6, 46)"
            :height="Math.max(0, seg.bh)"
            :fill="seg.s.color"
            :style="{
              transformBox: 'fill-box',
              transformOrigin: 'bottom',
              transform: shown ? 'scaleY(1)' : 'scaleY(0)',
              transition: `transform .6s cubic-bezier(.2,.8,.2,1) ${i * 0.03}s`,
            }"
            @mouseenter="show($event, d.label, stackRows(d))"
            @mousemove="move"
          />
          <text
            :x="padL + layout.band * i + layout.band / 2"
            :y="height - 10"
            text-anchor="middle"
            font-size="11"
            fill="var(--chart-axis)"
          >{{ d.label }}</text>
        </g>
      </template>
    </svg>
    <div
      v-if="series.length"
      class="chart-legend"
      style="margin-top: 12px; justify-content: center;"
    >
      <button
        v-for="s in series"
        :key="s.key"
        type="button"
        class="legend-item"
        :style="{
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          opacity: hidden[s.key] ? 0.4 : 1,
        }"
        @click="toggleSeries(s.key)"
      >
        <span
          class="legend-swatch"
          :style="{ background: s.color }"
        />{{ s.label }}
      </button>
    </div>
    <ChartTip
      :show="tip.show"
      :x="tip.x"
      :y="tip.y"
      :title="tip.title"
      :rows="tip.rows"
    />
  </div>
</template>
