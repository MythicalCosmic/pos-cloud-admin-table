<script setup lang="ts">
import { fmtAbbr, fmtNum } from '@/components/design/utils/format'
import Skeleton from '@/components/design/Skeleton.vue'
import StateFill from '@/components/design/StateFill.vue'
import ChartTip from '@/components/design/charts/ChartTip.vue'

const props = withDefaults(defineProps<Props>(), {
  size: 200,
  centerLabel: 'Total',
})

const { t } = useI18n({ useScope: 'global' })

interface DonutSlice {
  label: string
  value: number
  color: string
}

interface Props {
  data: DonutSlice[]
  size?: number
  centerLabel?: string
  centerValue?: string
  loading?: boolean
}

const hover = ref<number | null>(null)
const tip = ref<{ show: boolean; x: number; y: number }>({ show: false, x: 0, y: 0 })

function reset() {
  hover.value = null
  tip.value = { show: false, x: 0, y: 0 }
}

const total = computed(() => props.data.reduce((a, b) => a + b.value, 0))

const arcs = computed(() => {
  const R = props.size / 2
  const r = R * 0.62
  const cx = R
  const cy = R
  const gap = 0.018
  let acc = -0.25
  const denominator = total.value || 1

  return props.data.map(d => {
    const frac = d.value / denominator
    const sliceGap = Math.min(gap, Math.max(0, frac) * 0.15)
    const a0 = acc * 2 * Math.PI + sliceGap * Math.PI
    const a1 = (acc + frac) * 2 * Math.PI - sliceGap * Math.PI

    acc += frac

    const big = (a1 - a0) > Math.PI ? 1 : 0
    const p = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]
    const o0 = p(a0, R)
    const o1 = p(a1, R)
    const i1 = p(a1, r)
    const i0 = p(a0, r)

    const path = `M${o0[0]} ${o0[1]} A${R} ${R} 0 ${big} 1 ${o1[0]} ${o1[1]} `
      + `L${i1[0]} ${i1[1]} A${r} ${r} 0 ${big} 0 ${i0[0]} ${i0[1]} Z`

    return { path, frac, d, cx, cy }
  })
})

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
  const d = props.data[hover.value]
  const pct = Math.round(d.value / (total.value || 1) * 100)

  return [{ color: d.color, label: t('Amount'), value: `${fmtNum(d.value)} (${pct}%)` }]
})

const tipTitle = computed(() => hover.value !== null ? props.data[hover.value].label : '')
</script>

<template>
  <div
    v-if="loading"
    :style="{ height: `${size}px`, display: 'grid', placeItems: 'center' }"
  >
    <Skeleton
      :w="size"
      :h="size"
      r="50%"
    />
  </div>
  <StateFill
    v-else-if="!data.length || data.every(d => !d.value)"
    icon="bx-pie-chart-alt-2"
    :title="t('No data for this range')"
  />
  <div
    v-else
    class="donut-row"
    @mouseleave="reset"
  >
    <div style="position: relative; flex: 0 0 auto; overflow: visible;">
      <svg
        :width="size"
        :height="size"
        overflow="visible"
        style="overflow: visible;"
      >
        <g
          v-for="(a, i) in arcs"
          :key="`a${i}`"
        >
          <path
            v-if="a.frac > 0"
            :d="a.path"
            :fill="a.d.color"
            :opacity="hover !== null && hover !== i ? 0.4 : 1"
            :style="{
              transition: 'opacity .12s, transform .12s',
              transformOrigin: `${a.cx}px ${a.cy}px`,
              transform: hover === i ? 'scale(1.03)' : 'scale(1)',
            }"
            @mouseenter="onEnter(i, $event)"
            @mousemove="onMove($event)"
          />
        </g>
        <text
          :x="size / 2"
          :y="size / 2 - 4"
          text-anchor="middle"
          class="donut-center__v"
          font-size="22"
        >{{ centerValue ?? fmtAbbr(total) }}</text>
        <text
          :x="size / 2"
          :y="size / 2 + 16"
          text-anchor="middle"
          class="donut-center__l"
          font-size="11"
        >{{ centerLabel }}</text>
      </svg>
    </div>
    <div class="donut-legend">
      <div
        v-for="(d, i) in data"
        :key="`l${i}`"
        class="donut-legend__row"
        :style="{ opacity: hover !== null && hover !== i ? 0.5 : 1 }"
        @mouseenter="hover = i"
        @mouseleave="hover = null"
      >
        <span class="legend-item">
          <span
            class="legend-swatch"
            :style="{ background: d.color }"
          />
          {{ d.label }}
        </span>
        <span style="display: inline-flex; gap: 8px; align-items: center;">
          <b class="legend-val">{{ fmtAbbr(d.value) }}</b>
          <span class="legend-pct">{{ Math.round((d.value / (total || 1)) * 100) }}%</span>
        </span>
      </div>
    </div>
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
.donut-row {
  display: flex;
  gap: 24px;
  align-items: center;
  flex-wrap: wrap;
}
.donut-center__v {
  font-family: var(--font-mono);
  font-weight: var(--fw-bold);
  fill: rgb(var(--v-theme-on-surface));
}
.donut-center__l {
  fill: rgb(var(--v-theme-text-secondary));
  font-weight: var(--fw-medium);
}
.donut-legend {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 160px;
}
.donut-legend__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: opacity .12s;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: var(--fs-sm);
  color: rgb(var(--v-theme-text-secondary));
  font-weight: var(--fw-medium);
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: 0 0 10px;
}
.legend-val {
  font-family: var(--font-mono);
  font-feature-settings: "tnum" 1;
  font-size: var(--fs-sm);
  color: rgb(var(--v-theme-on-surface));
  font-weight: var(--fw-bold);
}
.legend-pct {
  font-family: var(--font-mono);
  font-feature-settings: "tnum" 1;
  font-size: var(--fs-label);
  width: 38px;
  text-align: right;
  color: rgb(var(--v-theme-text-tertiary));
}
</style>
