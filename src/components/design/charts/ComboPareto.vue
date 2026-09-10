<script setup lang="ts">
import { fmtAbbr, fmtMoney, fmtNum, fmtPct } from '@/components/design/utils/format'
import { niceTicks } from '@/components/design/charts/niceTicks'
import { useWidth } from '@/components/design/charts/useWidth'
import ReportState from '@/components/dashboard/ReportState.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import Select from '@/components/design/Select.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import ChartTip from '@/components/design/charts/ChartTip.vue'
import { designId } from '@/components/design/ids'

interface ParetoDatum { label: string; value: number; share?: number | null; cumulativeShare?: number | null }
const props = withDefaults(defineProps<{ data: ParetoDatum[]; totalRevenue?: number | null; height?: number; loading?: boolean }>(), { height: 260, loading: false })
const { t } = useI18n({ useScope: 'global' })
const [elRef, width] = useWidth()
const gradientId = designId('pareto-material')
const selected = ref(0)
const hovered = ref<number | null>(null)
const tip = ref({ show: false, x: 0, y: 0 })
const activeIndex = computed(() => hovered.value ?? selected.value)
const sorted = computed(() => [...props.data].sort((a, b) => b.value - a.value))
const active = computed(() => sorted.value[activeIndex.value])
const total = computed(() => sorted.value.reduce((sum, row) => sum + row.value, 0))
const hasReportedTotal = computed(() => props.totalRevenue != null && props.totalRevenue > 0)
const hasReportedShares = computed(() => sorted.value.length > 0 && sorted.value.every(row => row.share != null))
const hasReportedCumulative = computed(() => sorted.value.length > 0 && sorted.value.every((row, index, rows) => row.cumulativeShare != null && (index === 0 || row.cumulativeShare >= (rows[index - 1].cumulativeShare ?? 0))))
const reportedScope = computed(() => hasReportedTotal.value || hasReportedShares.value || hasReportedCumulative.value)
const scopeLabel = computed(() => t(reportedScope.value ? 'dash_pareto_reported_scope' : 'dash_pareto_shown_scope'))
const ticks = computed(() => niceTicks(Math.max(1, ...sorted.value.map(row => row.value)), 4))

const cumulative = computed(() => {
  let sum = 0
  return sorted.value.map(row => {
    if (!hasReportedTotal.value && hasReportedCumulative.value)
      return row.cumulativeShare ?? 0
    if (!hasReportedTotal.value && hasReportedShares.value) {
      sum += row.share ?? 0
      return sum
    }
    sum += row.value

    const denominator = hasReportedTotal.value ? (props.totalRevenue ?? total.value) : total.value
    return denominator > 0 ? sum / denominator * 100 : 0
  })
})

const thresholdIndex = computed(() => cumulative.value.findIndex(value => value >= 80))
const thresholdLabel = computed(() => thresholdIndex.value < 0 ? '' : t(reportedScope.value ? 'dash_pareto_insight' : 'dash_pareto_shown_insight', { n: fmtNum(thresholdIndex.value + 1), pct: fmtPct(cumulative.value[thresholdIndex.value], 1) }))
const left = 44
const right = 36
const top = 14
const bottom = 32
const innerWidth = computed(() => Math.max(1, width.value - left - right))
const innerHeight = computed(() => props.height - top - bottom)
const band = computed(() => innerWidth.value / Math.max(1, sorted.value.length))
const barWidth = computed(() => Math.min(40, Math.max(1, band.value * 0.7)))
const x = (index: number) => left + band.value * (index + 0.5)
const y = (value: number) => top + innerHeight.value * (1 - value / ticks.value.top)
const percentY = (value: number) => top + innerHeight.value * (1 - value / 100)
const path = computed(() => cumulative.value.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)} ${percentY(value).toFixed(2)}`).join(' '))
const labelStep = computed(() => Math.max(1, Math.ceil(sorted.value.length / Math.max(2, Math.floor(innerWidth.value / 65)))))
const tickIndexes = computed(() => sorted.value.map((_, index) => index).filter(index => index % labelStep.value === 0))
const productOptions = computed(() => sorted.value.map((row, index) => ({ value: String(index), label: `${index + 1}. ${row.label}` })))

const tipRows = computed(() => active.value
  ? [
    { color: 'var(--c1)', label: t('Revenue'), value: fmtMoney(active.value.value) },
    { color: 'var(--c3)', label: t('Cumulative'), value: fmtPct(cumulative.value[activeIndex.value], 1) },
  ]
  : [])

function preview(index: number, event: MouseEvent) {
  hovered.value = index
  tip.value = { show: true, x: event.clientX, y: event.clientY }
}
function clearPreview() { hovered.value = null; tip.value.show = false }
function choose(index: number) { selected.value = Math.max(0, Math.min(sorted.value.length - 1, index)); clearPreview() }
watch(() => props.data, () => { selected.value = 0; clearPreview() })
</script>

<template>
  <div
    ref="elRef"
    class="pareto"
  >
    <div
      v-if="loading"
      class="pareto__loading"
      :style="{ height: `${height}px` }"
      role="status"
      :aria-label="t('Loading')"
    >
      <Skeleton
        v-for="index in 5"
        :key="index"
        w="100%"
        :h="8"
      />
    </div>
    <ReportState
      v-else-if="!sorted.length || total <= 0"
      :title="t('No data for this range')"
      :description="t('Try a different date range.')"
    />
    <template v-else>
      <p
        v-if="thresholdLabel"
        class="pareto__insight"
      >
        {{ thresholdLabel }}
      </p>
      <p class="pareto__scope">
        {{ scopeLabel }}
      </p>
      <div class="pareto__legend">
        <span><i />{{ t('Revenue') }}</span><span><i />{{ t('Cumulative') }}</span><span>{{ t('dash_pareto_rank') }}</span>
      </div>
      <svg
        :width="width"
        :height="height"
        role="img"
        :aria-label="t('Pareto analysis')"
        class="pareto__plot"
        @mouseleave="clearPreview"
      >
        <defs>
          <linearGradient
            :id="gradientId"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0"
              stop-color="color-mix(in srgb, var(--c1) 45%, white)"
            />
            <stop
              offset="1"
              stop-color="var(--c1)"
            />
          </linearGradient>
        </defs>
        <g
          v-for="value in ticks.ticks"
          :key="value"
        >
          <line
            :x1="left"
            :x2="width - right"
            :y1="y(value)"
            :y2="y(value)"
            stroke="var(--chart-grid)"
            stroke-dasharray="2 5"
          />
          <text
            :x="left - 7"
            :y="y(value) + 3"
            text-anchor="end"
          >{{ fmtAbbr(value) }}</text>
        </g>
        <text
          v-for="value in [0, 50, 100]"
          :key="`pct-${value}`"
          :x="width - right + 6"
          :y="percentY(value) + 3"
        >{{ value }}%</text>
        <line
          :x1="left"
          :x2="width - right"
          :y1="percentY(80)"
          :y2="percentY(80)"
          stroke="var(--c3)"
          stroke-dasharray="4 4"
          opacity=".4"
        />
        <g
          v-for="(row, index) in sorted"
          :key="index"
        >
          <rect
            :x="x(index) - barWidth / 2"
            :y="y(Math.max(0, row.value))"
            :width="barWidth"
            :height="Math.max(0, row.value) / ticks.top * innerHeight"
            :rx="Math.min(7, barWidth / 2)"
            :fill="`url(#${gradientId})`"
            :opacity="index === activeIndex ? 1 : .5"
          />
        </g>
        <path
          :d="path"
          fill="none"
          stroke="var(--c3)"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          pointer-events="none"
        />
        <circle
          :cx="x(activeIndex)"
          :cy="percentY(cumulative[activeIndex])"
          r="4"
          fill="var(--surface)"
          stroke="var(--c3)"
          stroke-width="2"
          pointer-events="none"
        />
        <line
          :x1="x(activeIndex)"
          :x2="x(activeIndex)"
          :y1="top"
          :y2="height - bottom"
          stroke="var(--text-secondary)"
          stroke-dasharray="3 4"
          opacity=".4"
          pointer-events="none"
        />
        <text
          v-for="index in tickIndexes"
          :key="`rank-${index}`"
          :x="x(index)"
          :y="height - 12"
          text-anchor="middle"
        >{{ index + 1 }}</text>
        <rect
          v-for="(_, index) in sorted"
          :key="`hit-${index}`"
          :x="left + band * index"
          :y="top"
          :width="band"
          :height="innerHeight"
          fill="transparent"
          class="pareto__hit"
          @mouseenter="preview(index, $event)"
          @mousemove="preview(index, $event)"
          @click="choose(index)"
        />
      </svg>
      <div class="pareto__selection">
        <Select
          :model-value="String(selected)"
          :options="productOptions"
          :aria-label="t('dash_product_select')"
          @update:model-value="choose(Number($event))"
        />
        <button
          type="button"
          :disabled="selected === 0"
          :aria-label="t('dash_previous_point')"
          @click="choose(selected - 1)"
        >
          <DesignIcon
            name="arrowleft"
            :size="15"
          />
        </button>
        <button
          type="button"
          :disabled="selected === sorted.length - 1"
          :aria-label="t('dash_next_point')"
          @click="choose(selected + 1)"
        >
          <DesignIcon
            name="arrowright"
            :size="15"
          />
        </button>
      </div>
      <div
        class="pareto__readout"
        aria-live="polite"
      >
        <span>{{ active?.label }}</span><strong>{{ fmtMoney(active?.value ?? 0) }}</strong><span>{{ t('Cumulative') }} <b>{{ fmtPct(cumulative[activeIndex], 1) }}</b></span>
      </div>
      <ChartTip
        :show="tip.show"
        :x="tip.x"
        :y="tip.y"
        :title="active?.label || ''"
        :rows="tipRows"
      />
    </template>
  </div>
</template>

<style scoped>
.pareto { position: relative; min-width: 0; }
.pareto__insight { margin: 0 0 8px; font-size: 12px; color: var(--text); }
.pareto__scope { margin: 0 0 10px; font-size: 11px; color: var(--text-secondary); line-height: 1.5; }
.pareto__legend { display: flex; flex-wrap: wrap; gap: 6px 12px; color: var(--text-secondary); font-size: 10px; }
.pareto__legend > span { display: flex; align-items: center; gap: 5px; }
.pareto__legend > span:last-child { margin-left: auto; }
.pareto__legend i { width: 6px; height: 6px; background: var(--c1); border-radius: 2px; }
.pareto__legend > span:nth-child(2) i { background: var(--c3); }
.pareto__plot { display: block; overflow: visible; }
.pareto__plot text { font: 10px var(--font-mono); fill: var(--text-secondary); }
.pareto__hit { cursor: pointer; }
.pareto__selection { display: grid; grid-template-columns: minmax(0, 1fr) 40px 40px; gap: 4px; padding-top: 8px; border-top: 1px solid var(--border); }
.pareto__selection button { min-height: 40px; display: grid; place-items: center; color: var(--text-secondary); border-radius: 7px; }
.pareto__selection button:hover:not(:disabled) { background: var(--primary-weak); color: var(--primary); }
.pareto__selection button:disabled { opacity: .35; }
.pareto__selection button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.pareto__readout { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-top: 9px; font-size: 11px; color: var(--text-secondary); }
.pareto__readout > span:first-child { flex-basis: 100%; font-weight: 500; color: var(--text); overflow-wrap: anywhere; }
.pareto__readout strong, .pareto__readout b { font-variant-numeric: tabular-nums; color: var(--text); font-weight: 500; }
.pareto__loading { display: grid; align-content: space-around; padding: 16px; }
@media (max-width: 600px) { .pareto__selection { grid-template-columns: minmax(0, 1fr) 44px 44px; } .pareto__selection button { min-height: 44px; } }
</style>
