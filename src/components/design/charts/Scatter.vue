<script setup lang="ts">
import { fmtAbbr, fmtNum } from '../utils/format'
import { useTip } from './useTip'
import { useShown } from '@/composables/useAlphaMotion'
import ChartTip from '@/components/design/charts/ChartTip.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import Select from '@/components/design/Select.vue'
import { niceTicks } from '@/components/design/charts/niceTicks'
import { useWidth } from '@/components/design/charts/useWidth'

const props = withDefaults(defineProps<Props>(), {
  height: 300,
})

const emit = defineEmits<{ (event: 'select', index: number): void }>()

const { t } = useI18n({ useScope: 'global' })

interface Point {
  x: number
  y: number
  r?: number
  label: string
  color?: string
  details?: Array<{ label: string; value: string }>
}

interface Props {
  data: Point[]
  height?: number
  xLabel?: string
  yLabel?: string
  xFormat?: (n: number) => string
  yFormat?: (n: number) => string
  yUnit?: string
  pointLabel?: string
  selectedIndex?: number
}

const shown = useShown(80)
const [boxRef, w] = useWidth()
const { tip, show, move, hide } = useTip()
const selected = ref(props.selectedIndex ?? 0)
const hovered = ref<number | null>(null)
const activeIndex = computed(() => hovered.value ?? selected.value)
const active = computed(() => props.data[activeIndex.value])
const options = computed(() => props.data.map((point, index) => ({ value: String(index), label: point.label })))
const labelX = computed(() => props.xLabel || t('X'))
const labelY = computed(() => props.yLabel || t('Y'))

watch(() => props.selectedIndex, value => {
  if (value !== undefined)
    selected.value = value
})
watch(() => props.data.map(point => point.label).join('|'), () => { selected.value = 0; hovered.value = null })
function choose(index: number) {
  selected.value = index
  hovered.value = null
  hide()
  emit('select', index)
}
function clearPreview() { hovered.value = null; hide() }
function values(point: Point) {
  return [
    { color: point.color || 'var(--primary)', label: labelX.value, value: fmtNum(point.x) },
    { color: point.color || 'var(--primary)', label: labelY.value, value: `${fmtNum(point.y)}${props.yUnit ? ` ${props.yUnit}` : ''}` },
    ...(point.details || []).map(detail => ({ ...detail, color: point.color || 'var(--primary)' })),
  ]
}
function preview(index: number, event: MouseEvent) {
  hovered.value = index
  show(event, props.data[index].label, values(props.data[index]))
}
function pointDescription(point: Point) { return `${point.label}. ${values(point).map(row => `${row.label}: ${row.value}`).join(', ')}` }

const padL = 50
const padR = 16
const padT = 14
const padB = 36

const layout = computed(() => {
  const iw = Math.max(10, w.value - padL - padR)
  const ih = props.height - padT - padB
  const maxX = Math.max(0, ...props.data.map(d => d.x))
  const maxY = Math.max(0, ...props.data.map(d => d.y))
  const nx = niceTicks(maxX || 1, 4)
  const ny = niceTicks(maxY || 1, 4)
  const X = (v: number) => padL + (v / nx.top) * iw
  const Y = (v: number) => padT + ih - (v / ny.top) * ih
  return { iw, ih, nx, ny, X, Y }
})

const xFmt = computed(() => props.xFormat ?? fmtAbbr)
const yFmt = computed(() => props.yFormat ?? fmtAbbr)
</script>

<template>
  <div
    v-if="!data.length"
    ref="boxRef"
  >
    <ReportState
      icon="chart"
      :title="t('No data for this range')"
      :description="t('Try a different date range.')"
    />
  </div>
  <div
    v-else
    ref="boxRef"
    class="scatter-chart"
    style="position: relative;"
  >
    <svg
      :width="w"
      :height="height"
      overflow="visible"
      style="overflow: visible;"
      @mouseleave="clearPreview"
    >
      <g
        v-for="(tk, i) in layout.ny.ticks"
        :key="`yt${i}`"
      >
        <line
          :x1="padL"
          :x2="w - padR"
          :y1="layout.Y(tk)"
          :y2="layout.Y(tk)"
          stroke="var(--chart-grid)"
        />
        <text
          :x="padL - 8"
          :y="layout.Y(tk) + 4"
          text-anchor="end"
          font-size="11"
          fill="var(--chart-axis)"
          font-family="var(--font-mono)"
        >{{ yFmt(tk) }}</text>
      </g>
      <text
        v-for="(tk, i) in layout.nx.ticks"
        :key="`xt${i}`"
        :x="layout.X(tk)"
        :y="height - 12"
        text-anchor="middle"
        font-size="11"
        fill="var(--chart-axis)"
        font-family="var(--font-mono)"
      >{{ xFmt(tk) }}</text>
      <text
        v-if="xLabel"
        :x="padL + layout.iw / 2"
        :y="height"
        text-anchor="middle"
        font-size="11"
        font-weight="600"
        fill="var(--text-tertiary)"
      >{{ xLabel }}</text>
      <g
        v-for="(d, i) in data"
        :key="`p${i}`"
        class="scatter-chart__point"
        role="button"
        tabindex="0"
        :aria-label="pointDescription(d)"
        :aria-pressed="selected === i"
        @click="choose(i)"
        @keydown.enter.prevent="choose(i)"
        @keydown.space.prevent="choose(i)"
        @focus="hovered = i"
        @blur="clearPreview"
        @mouseenter="preview(i, $event)"
        @mousemove="move"
        @mouseleave="clearPreview"
      >
        <circle
          :cx="layout.X(d.x)"
          :cy="layout.Y(d.y)"
          :r="Math.max(22, (d.r || 8) + 4)"
          fill="transparent"
        />
        <circle
          v-if="i === activeIndex"
          :cx="layout.X(d.x)"
          :cy="layout.Y(d.y)"
          :r="(d.r || 8) + 4"
          fill="none"
          stroke="var(--text)"
          stroke-width="1.5"
        />
        <circle
          :cx="layout.X(d.x)"
          :cy="layout.Y(d.y)"
          :r="shown ? (d.r || 8) : 0"
          :fill="d.color || 'var(--primary)'"
          :fill-opacity="i === activeIndex ? .85 : .45"
          :stroke="d.color || 'var(--primary)'"
          stroke-width="1.5"
        />
      </g>
    </svg>
    <div class="scatter-chart__selection">
      <i :style="{ background: data[selected]?.color || 'var(--primary)' }" /><Select
        :model-value="String(selected)"
        :options="options"
        :aria-label="pointLabel || t('dash_chart_point')"
        @update:model-value="choose(Number($event))"
      />
    </div>
    <div
      v-if="active"
      class="scatter-chart__readout"
      aria-live="polite"
    >
      <strong>{{ active.label }}</strong>
      <dl>
        <div
          v-for="row in values(active)"
          :key="row.label"
        >
          <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
        </div>
      </dl>
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

<style scoped>
.scatter-chart { min-width: 0; }
.scatter-chart__point { cursor: pointer; }
.scatter-chart__point:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.scatter-chart__selection { display: grid; grid-template-columns: 6px minmax(0, 1fr); align-items: center; gap: 8px; margin-top: 18px; }
.scatter-chart__selection > i { width: 6px; height: 6px; border-radius: 2px; }
.scatter-chart__readout { margin-top: 10px; color: var(--text); font-size: 11px; }
.scatter-chart__readout > strong { font-weight: 600; overflow-wrap: anywhere; }
.scatter-chart__readout dl { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 6px; }
.scatter-chart__readout dt { color: var(--text-secondary); font-size: 10px; }
.scatter-chart__readout dd { margin: 3px 0 0; font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
</style>
