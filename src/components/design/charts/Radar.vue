<script setup lang="ts">
import StateFill from '../StateFill.vue'
import { useTip } from './useTip'
import { useShown } from '@/composables/useAlphaMotion'
import ChartTip from '@/components/design/charts/ChartTip.vue'
import { designId } from '@/components/design/ids'

const props = withDefaults(defineProps<Props>(), {
  size: 280,
  max: 100,
  showLegend: true,
})

const { t } = useI18n({ useScope: 'global' })

interface Series {
  label: string
  color: string
  values: number[]
  valueLabels?: string[]
}

interface Props {
  size?: number
  axes: string[]
  series: Series[]
  max?: number
  showLegend?: boolean
}

const shown = useShown(80)
const gradientId = designId('radar-material')
const { tip, show, move, hide } = useTip()
const chartRoot = ref<HTMLElement>()
const { width: renderedWidth } = useElementSize(chartRoot)
const labelSize = computed(() => renderedWidth.value > 0 ? 11 * (props.size + 100) / renderedWidth.value : 11)

const geom = computed(() => {
  const size = props.size
  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 38
  const n = props.axes.length
  const ang = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2

  const pt = (i: number, val: number) => [
    cx + R * (val / props.max) * Math.cos(ang(i)),
    cy + R * (val / props.max) * Math.sin(ang(i)),
  ] as [number, number]

  return { size, cx, cy, R, n, pt }
})

const rings = [0.25, 0.5, 0.75, 1]

function ringPoints(r: number) {
  return props.axes.map((_, ai) => {
    const p = geom.value.pt(ai, props.max * r)
    return `${p[0]},${p[1]}`
  }).join(' ')
}

function spokePt(i: number) {
  return geom.value.pt(i, props.max)
}

function labelPt(i: number) {
  return geom.value.pt(i, props.max * 1.16)
}

function labelAnchor(i: number) {
  const x = labelPt(i)[0] - geom.value.cx
  return Math.abs(x) < 1 ? 'middle' : x > 0 ? 'start' : 'end'
}

function seriesPoly(s: Series) {
  return props.axes.map((_, ai) => {
    const p = geom.value.pt(ai, shown.value ? (s.values[ai] || 0) : 0)
    return `${p[0]},${p[1]}`
  }).join(' ')
}

function vertexPt(s: Series, ai: number) {
  return geom.value.pt(ai, shown.value ? (s.values[ai] || 0) : 0)
}
</script>

<template>
  <StateFill
    v-if="!axes.length"
    icon="chart"
    :title="t('No data')"
  />
  <div
    v-else
    ref="chartRoot"
    :style="{ position: 'relative', width: `${size + 100}px`, maxWidth: '100%', margin: '0 auto' }"
    @mouseleave="hide"
  >
    <svg
      :width="size + 100"
      :height="size"
      :viewBox="`-50 0 ${size + 100} ${size}`"
      overflow="visible"
      style="display: block; width: 100%; height: auto; overflow: visible;"
    >
      <defs>
        <linearGradient
          v-for="(s, si) in series"
          :id="`${gradientId}-${si}`"
          :key="si"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0"
            :stop-color="s.color"
            stop-opacity=".4"
          />
          <stop
            offset="1"
            :stop-color="s.color"
            stop-opacity=".04"
          />
        </linearGradient>
      </defs>
      <polygon
        v-for="(r, i) in rings"
        :key="`ring${i}`"
        :points="ringPoints(r)"
        fill="none"
        stroke="var(--chart-grid)"
        stroke-width="1"
      />
      <line
        v-for="(_, ai) in axes"
        :key="`spoke${ai}`"
        :x1="geom.cx"
        :y1="geom.cy"
        :x2="spokePt(ai)[0]"
        :y2="spokePt(ai)[1]"
        stroke="var(--chart-grid)"
      />
      <text
        v-for="(lab, ai) in axes"
        :key="`lab${ai}`"
        :x="labelPt(ai)[0]"
        :y="labelPt(ai)[1]"
        :text-anchor="labelAnchor(ai)"
        dominant-baseline="middle"
        :font-size="labelSize"
        font-weight="600"
        fill="var(--text-secondary)"
      >{{ lab }}</text>
      <g
        v-for="(s, si) in series"
        :key="`s${si}`"
        :style="{ transition: 'opacity .2s ease' }"
      >
        <polygon
          :points="seriesPoly(s)"
          :fill="`url(#${gradientId}-${si})`"
          :stroke="s.color"
          stroke-width="2"
          :style="{ transition: 'opacity .2s ease' }"
        />
        <circle
          v-for="(_, ai) in axes"
          :key="`v${si}-${ai}`"
          :cx="vertexPt(s, ai)[0]"
          :cy="vertexPt(s, ai)[1]"
          r="3.5"
          fill="var(--surface)"
          :stroke="s.color"
          stroke-width="2"
          @mouseenter="show($event, axes[ai], [{ color: s.color, label: s.label, value: s.valueLabels?.[ai] ?? String(s.values[ai] || 0) }])"
          @mousemove="move"
        />
      </g>
    </svg>
    <div
      v-if="showLegend && series.length > 1"
      class="chart-legend"
      style="justify-content: center; margin-top: 4px;"
    >
      <span
        v-for="s in series"
        :key="s.label"
        class="legend-item"
      >
        <span
          class="legend-swatch"
          :style="{ background: s.color }"
        />{{ s.label }}
      </span>
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
