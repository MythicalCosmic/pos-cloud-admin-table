<script setup lang="ts">
import ReportState from './ReportState.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Select from '@/components/design/Select.vue'
import { fmtAbbr, fmtNum, fmtPct } from '@/components/design/utils/format'
import { designId } from '@/components/design/ids'
import { roundedSector } from '@/components/design/charts/roundedSector'

const props = withDefaults(defineProps<{
  data: Array<{ label: string; value: number; color?: string }>
  unit?: string
  label?: string
  ranked?: boolean
  visual?: 'strip' | 'donut' | 'bars'
  limit?: number
  selectedIndex?: number | null
  exploreLabel?: string
  percentPrecision?: number
}>(), { unit: '', label: '', ranked: false, visual: 'strip', limit: 6 })

const emit = defineEmits<{ (event: 'select', value: number | null): void }>()

const { t } = useI18n({ useScope: 'global' })
const selected = ref<number | null>(props.selectedIndex ?? null)
const hovered = ref<number | null>(null)
const expanded = ref(false)
const total = computed(() => props.data.reduce((sum, row) => sum + row.value, 0))
const positiveTotal = computed(() => props.data.reduce((sum, row) => sum + Math.max(0, row.value), 0))
const hasNegative = computed(() => props.data.some(row => row.value < 0))
const allZero = computed(() => props.data.length > 0 && props.data.every(row => row.value === 0))
const visibleRows = computed(() => expanded.value ? props.data : props.data.slice(0, props.limit))
const useExplorer = computed(() => props.data.length > 12)
const options = computed(() => props.data.map((row, index) => ({ value: String(index), label: row.label })))
const activeIndex = computed(() => hovered.value ?? selected.value)
const active = computed(() => activeIndex.value === null ? undefined : props.data[activeIndex.value])
const colors = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--primary-hover)']
const gradientId = designId('distribution-material')
const leadingIndex = computed(() => props.data.reduce((best, row, index, rows) => row.value > (rows[best]?.value ?? 0) ? index : best, 0))
const emphasisIndex = computed(() => activeIndex.value ?? leadingIndex.value)
const color = (index: number) => props.data[index]?.color || colors[index % colors.length]
const share = (value: number) => total.value > 0 ? value / total.value * 100 : 0
const percent = (value: number) => hasNegative.value ? '—' : fmtPct(share(value), props.percentPrecision ?? 1)
const maxValue = computed(() => Math.max(1, ...props.data.map(row => Math.abs(row.value))))
const ringDescription = computed(() => props.data.map(row => `${row.label}: ${fmtNum(row.value)} ${props.unit}`).join(', '))

function select(index: number) { selected.value = selected.value === index ? null : index; emit('select', selected.value) }
function reset() { selected.value = null; hovered.value = null; emit('select', null) }
function choose(value: string) { selected.value = value === '' ? null : Number(value); hovered.value = null; emit('select', selected.value) }

// Filled sectors give each tender an exact hit region; dashed full circles overlap.
const ringSegments = computed(() => {
  let offset = -Math.PI / 2
  const multiple = props.data.filter(row => row.value > 0).length > 1
  return props.data.flatMap((row, index) => {
    const angle = positiveTotal.value ? Math.max(0, row.value) / positiveTotal.value * Math.PI * 2 : 0
    if (!angle)
      return []
    const gap = multiple ? Math.min(0.065, angle * 0.14) : 0.00001
    const from = offset + gap / 2
    const to = offset + angle - gap / 2
    const mid = offset + angle / 2

    offset += angle
    return [{
      index,
      transform: `translate(${Math.cos(mid) * 3}px, ${Math.sin(mid) * 3}px)`,
      path: roundedSector(from, to, 94, 61, multiple ? 5 : 0),
      labelX: 110 + Math.cos(mid) * 77.5,
      labelY: 110 + Math.sin(mid) * 77.5,
      showLabel: angle > 0.45,
      percent: fmtPct(row.value / positiveTotal.value * 100, props.percentPrecision ?? 0),
    }]
  })
})

function toggleRows() {
  expanded.value = !expanded.value
  if (!expanded.value && selected.value !== null && selected.value >= props.limit)
    reset()
}
watch(() => props.data.map(row => row.label).join('|'), reset)
watch(() => props.selectedIndex, value => {
  if (value !== undefined)
    selected.value = value
})
</script>

<template>
  <div
    class="distribution"
    :class="[`distribution--${visual}`, { 'distribution--ranked': ranked }]"
    @keydown.esc="reset"
  >
    <ReportState
      v-if="!data.length"
      :title="t('No data for this range')"
      :description="t('Try a different date range.')"
    />
    <template v-else>
      <div class="distribution__summary">
        <span>{{ active?.label || label || t('Total') }}</span>
        <strong>{{ fmtNum(active?.value ?? total) }}<small v-if="unit">{{ unit }}</small></strong>
        <button
          v-if="selected !== null"
          type="button"
          :aria-label="t('dash_distribution_reset')"
          @click="reset"
        >
          <DesignIcon
            name="close"
            :size="15"
          />
        </button>
      </div>
      <ReportState
        v-if="allZero"
        :title="t('dash_no_activity')"
        :description="t('Try a different date range.')"
      />
      <div
        v-else-if="visual === 'donut'"
        class="distribution__visual"
      >
        <svg
          class="distribution__ring"
          viewBox="0 0 220 220"
          role="img"
          :aria-label="ringDescription"
          @mouseleave="hovered = null"
        >
          <defs>
            <linearGradient
              v-for="segment in ringSegments"
              :id="`${gradientId}-${segment.index}`"
              :key="segment.index"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <stop
                offset="0"
                :stop-color="`color-mix(in srgb, ${color(segment.index)} 52%, white)`"
              />
              <stop
                offset="1"
                :stop-color="color(segment.index)"
              />
            </linearGradient>
          </defs>
          <circle
            cx="110"
            cy="110"
            r="77.5"
            fill="none"
            stroke="transparent"
            stroke-width="33"
          />
          <path
            v-for="segment in ringSegments"
            :key="segment.index"
            :d="segment.path"
            :fill="`url(#${gradientId}-${segment.index})`"
            :data-segment="segment.index"
            :style="{ opacity: emphasisIndex === segment.index ? 1 : activeIndex === null ? .75 : .38, transform: activeIndex === segment.index ? segment.transform : undefined }"
            @mouseenter="hovered = segment.index"
            @click="select(segment.index)"
          >
            <title>{{ data[segment.index].label }} · {{ fmtNum(data[segment.index].value) }} {{ unit }}</title>
          </path>
          <g
            v-for="segment in ringSegments.filter(segment => segment.showLabel)"
            :key="`label-${segment.index}`"
            class="distribution__ring-label"
            :transform="`translate(${segment.labelX}, ${segment.labelY})`"
            aria-hidden="true"
          >
            <rect
              x="-19"
              y="-10"
              width="38"
              height="20"
              rx="6"
              :fill="emphasisIndex === segment.index ? '#171923' : '#f4f1fa'"
            />
            <text
              y="3.5"
              text-anchor="middle"
              :fill="emphasisIndex === segment.index ? '#ffffff' : '#302945'"
            >{{ segment.percent }}</text>
          </g>
        </svg>
        <div
          class="distribution__center"
          aria-hidden="true"
        >
          <strong>{{ active && positiveTotal ? fmtPct(Math.max(0, active.value) / positiveTotal * 100, percentPrecision ?? 1) : fmtAbbr(positiveTotal) }}</strong>
          <span>{{ active?.label || unit || label || t('Total') }}</span>
        </div>
      </div>
      <div
        v-else-if="visual === 'strip' && !hasNegative"
        class="distribution__strip"
        aria-hidden="true"
        @mouseleave="hovered = null"
      >
        <span
          v-for="(row, index) in data"
          :key="index"
          :style="{ flexGrow: Math.max(0, row.value), background: color(index), opacity: activeIndex === null || activeIndex === index ? 1 : .25 }"
          @mouseenter="hovered = index"
          @click="select(index)"
        />
      </div>
      <div
        class="distribution__rows"
        @mouseleave="hovered = null"
      >
        <button
          v-for="(row, index) in visibleRows"
          :key="index"
          type="button"
          class="distribution__row"
          :aria-pressed="selected === index"
          :data-active="activeIndex === index || undefined"
          @mouseenter="hovered = index"
          @focus="hovered = index"
          @blur="hovered = null"
          @click="select(index)"
        >
          <span
            class="distribution__marker"
            :style="{ '--row-color': color(index) }"
          >{{ ranked ? String(index + 1).padStart(2, '0') : '' }}</span>
          <span class="distribution__row-title">{{ row.label }}</span>
          <strong class="distribution__percent">{{ percent(row.value) }}</strong>
          <span class="distribution__row-value">{{ fmtNum(row.value) }}<small v-if="unit">{{ unit }}</small></span>
          <span
            class="distribution__track"
            aria-hidden="true"
          ><span :style="{ width: `${Math.abs(row.value) / maxValue * 100}%`, background: color(index) }" /></span>
        </button>
      </div>
      <p
        v-if="hasNegative"
        class="distribution__hint"
      >
        {{ t('dash_ring_positive') }}
      </p>
      <button
        v-if="data.length > limit && !useExplorer"
        class="distribution__more"
        type="button"
        :aria-expanded="expanded"
        @click="toggleRows"
      >
        {{ expanded ? t('Show less') : t('dash_all_breakdown', { n: data.length }) }}<DesignIcon
          :name="expanded ? 'sortup' : 'chevdown'"
          :size="15"
        />
      </button>
      <Select
        v-if="useExplorer"
        class="distribution__explorer"
        :model-value="selected === null ? '' : String(selected)"
        :options="options"
        :placeholder="t('dash_distribution_explore', { n: data.length })"
        :aria-label="exploreLabel || label || t('dash_chart_point')"
        @update:model-value="choose"
      />
    </template>
  </div>
</template>

<style scoped>
.distribution { container-type: inline-size; display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 10px 16px; }
.distribution__summary { grid-column: 1 / -1; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; gap: 5px 12px; padding: 0 0 8px; position: relative; }
.distribution__summary > span { grid-column: 1; color: var(--text-secondary); font-size: 11px; overflow-wrap: anywhere; }
.distribution__summary > strong { grid-column: 1; margin: 0; display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px; font: 600 24px/1.3 var(--font-sans); color: var(--text); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.distribution__summary small { color: var(--text-secondary); font: 10px var(--font-sans); }
.distribution__summary button { grid-column: 2; grid-row: 1 / 3; flex-shrink: 0; align-self: center; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 8px; background: var(--primary-weak); color: var(--primary); }
.distribution__visual { position: relative; width: 100%; max-width: 320px; justify-self: center; align-self: center; }
.distribution__ring { display: block; width: 100%; overflow: visible; }
.distribution__ring path { cursor: pointer; transition: opacity 180ms ease-out, transform 180ms ease-out; }
.distribution__ring-label { pointer-events: none; font: 500 10px var(--font-sans); font-variant-numeric: tabular-nums; }
.distribution__center { position: absolute; inset: 32% 24%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; pointer-events: none; text-align: center; }
.distribution__center strong { color: var(--text); font: 600 21px var(--font-sans); font-variant-numeric: tabular-nums; letter-spacing: -.03em; }
.distribution__center span { font-size: 10px; color: var(--text-secondary); line-height: 1.4; max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.distribution__rows { display: grid; min-width: 0; align-content: center; }
.distribution__row { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 4px 9px; text-align: left; min-height: 52px; min-width: 0; padding: 9px 7px; border: 1px solid transparent; border-radius: 8px; transition: background 150ms, border-color 150ms; }
.distribution__row[data-active] { background: var(--surface-2); }
.distribution__row[aria-pressed="true"] { border-color: color-mix(in srgb, var(--primary) 40%, var(--border)); background: var(--primary-weak); }
.distribution__marker { width: 7px; height: 7px; border-radius: 2px; background: linear-gradient(135deg, color-mix(in srgb, var(--row-color) 55%, white), var(--row-color)); }
.distribution__row-title { color: var(--text); font-size: 12px; font-weight: 500; line-height: 1.4; overflow-wrap: anywhere; }
.distribution__percent { color: var(--text-secondary); font: 500 11px var(--font-mono); text-align: right; }
.distribution__row-value { grid-column: 2 / -1; display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px; color: var(--text); font: 400 12px var(--font-mono); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.distribution__row-value small { color: var(--text-secondary); font: 10px var(--font-sans); }
.distribution__track { grid-column: 2 / -1; display: block; height: 4px; background: var(--chart-track); border-radius: 3px; overflow: hidden; margin-top: 3px; }
.distribution__track > span { display: block; height: 100%; border-radius: inherit; background-image: linear-gradient(90deg, #ffffff70, #ffffff00) !important; }
.distribution__strip { height: 20px; display: flex; gap: 3px; border-radius: 6px; overflow: hidden; }
.distribution__strip > span { flex-basis: 0; cursor: pointer; transition: opacity 150ms; }
.distribution--ranked .distribution__row { grid-template-columns: 24px minmax(0, 1fr) auto; }
.distribution--ranked .distribution__marker { width: 24px; height: 24px; display: grid; place-items: center; border-radius: 6px; background: color-mix(in srgb, var(--row-color) 13%, var(--surface)); color: var(--row-color); font: 500 10px var(--font-mono); grid-row: 1 / 3; }
.distribution--donut .distribution__track { display: none; }
.distribution__hint { grid-column: 1 / -1; margin: 0; font-size: 11px; line-height: 1.5; color: var(--text-secondary); }
.distribution__explorer { grid-column: 1 / -1; }
.distribution__more { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 7px; min-height: 44px; color: var(--primary); font-size: 11px; font-weight: 600; border-top: 1px solid var(--border); }
.distribution__more:hover { background: var(--surface-2); }
.distribution button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.distribution--donut { grid-template-columns: minmax(0, 1fr) minmax(160px, 1.1fr); align-items: center; }
.distribution--donut .distribution__rows { order: 1; }
.distribution--donut .distribution__visual { order: 2; }
.distribution--donut :is(.distribution__hint, .distribution__more, .distribution__explorer) { order: 3; }
.distribution--donut > .report-state { grid-column: 1 / -1; }
@container (max-width: 420px) { .distribution--donut .distribution__visual { order: 1; width: 220px; grid-column: 1 / -1; } .distribution--donut .distribution__rows { order: 2; grid-column: 1 / -1; grid-template-columns: repeat(2, minmax(0, 1fr)); } .distribution__visual { width: 220px; } .distribution__center strong { font-size: 16px; } .distribution__row { padding-inline: 4px; gap: 4px 6px; } .distribution__row-title { font-size: 11px; } .distribution__row-value { font-size: 11px; } }
@media (max-width: 600px) { .distribution__summary button { width: 44px; height: 44px; } }
@media (prefers-reduced-motion: reduce) { .distribution__ring path, .distribution__row, .distribution__strip > span { transition: none; } }
</style>
