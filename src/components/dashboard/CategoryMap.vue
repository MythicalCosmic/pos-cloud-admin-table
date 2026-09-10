<script setup lang="ts">
import { color as chartColor, use } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { TreemapChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import type { EChartsOption } from 'echarts'
import VChart from 'vue-echarts'
import ReportState from './ReportState.vue'
import Select from '@/components/design/Select.vue'
import { chartTextColor } from '@/components/design/charts/chartTextColor'
import { useEChartTheme } from '@/composables/useEChartTheme'
import { fmtAbbr, fmtNum, fmtPct } from '@/components/design/utils/format'

const props = defineProps<{ data: Array<{ label: string; value: number }>; unit: string; selectedIndex?: number | null }>()
const emit = defineEmits<{ (event: 'select', value: number | null): void }>()

use([SVGRenderer, TreemapChart, TooltipComponent])

const { t } = useI18n({ useScope: 'global' })
const { tokens } = useEChartTheme()
const reducedMotion = usePreferredReducedMotion()
const root = ref<HTMLElement>()
const ready = ref(false)
const selected = ref<number | null>(props.selectedIndex ?? null)
const active = computed(() => selected.value === null ? undefined : props.data[selected.value])
const total = computed(() => props.data.reduce((sum, row) => sum + row.value, 0))
const selectedShare = computed(() => total.value ? fmtPct((active.value?.value || 0) / total.value * 100) : '0%')
let observer: IntersectionObserver | undefined
onMounted(() => {
  observer = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) { ready.value = true; observer?.disconnect() }
  }, { rootMargin: '250px' })
  if (root.value)
    observer.observe(root.value)
})
onBeforeUnmount(() => { observer?.disconnect() })
watch(() => props.data.map(row => row.label).join('|'), () => { selected.value = null })
watch(() => props.selectedIndex, value => {
  if (value !== undefined)
    selected.value = value
})
function choose(index: number | null) { selected.value = index; emit('select', index) }
function select(event: { dataIndex?: number }) {
  // Treemap's synthetic root occupies dataIndex 0.
  if (event.dataIndex && props.data[event.dataIndex - 1])
    choose(event.dataIndex - 1)
}

const option = computed<EChartsOption>(() => {
  const C = tokens.value
  const style = getComputedStyle(document.documentElement)
  const colors = ['--c1', '--c2', '--c3', '--c4', '--c5', '--primary-hover'].map(key => style.getPropertyValue(key).trim())
  return {
    animation: reducedMotion.value !== 'reduce',
    animationDurationUpdate: 300,
    tooltip: { renderMode: 'richText', confine: true, backgroundColor: '#171923', borderColor: '#ffffff26', textStyle: { color: '#FFFFFF', fontFamily: C.fontUI }, formatter: (params: any) => `${params.name}\n${fmtNum(Number(params.value))} ${props.unit}` },
    series: [{
      type: 'treemap',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      sort: false,
      visibleMin: 0,
      squareRatio: 1.2,
      label: {
        show: true,
        position: 'insideTopLeft',
        padding: [15, 14],
        color: C.surface,
        fontFamily: C.fontUI,
        fontSize: 14,
        lineHeight: 20,
        overflow: 'truncate',
        formatter: (params: any) => Number(params.value) / Math.max(1, total.value) < 0.035 ? '' : `${params.name}\n${fmtAbbr(Number(params.value))}`,
      },
      upperLabel: { show: false },
      itemStyle: { borderColor: C.surface, borderWidth: 0, gapWidth: 6, borderRadius: 12 },
      emphasis: { itemStyle: { borderColor: C.textSecondary, borderWidth: 2 }, label: { show: true } },
      levels: [{ itemStyle: { borderColor: C.surface, borderWidth: 0, gapWidth: 6 } }],
      data: props.data.map((row, index) => ({ name: row.label, value: Math.max(0, row.value), label: { color: chartTextColor(`#${chartColor.toHex(chartColor.lift(colors[index % colors.length], 0.45))}`) }, itemStyle: { color: { type: 'linear' as const, x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: chartColor.lift(colors[index % colors.length], 0.75) }, { offset: 1, color: chartColor.lift(colors[index % colors.length], 0.45) }] }, borderRadius: 10, borderColor: index === selected.value ? C.text : C.surface, borderWidth: index === selected.value ? 2 : 0 } })),
    }],
  }
})
</script>

<template>
  <div
    ref="root"
    class="category-map"
  >
    <div
      v-if="total > 0"
      class="category-map__canvas"
      aria-hidden="true"
    >
      <VChart
        v-if="ready && total > 0"
        :option="option"
        :init-options="{ renderer: 'svg' }"
        autoresize
        @click="select"
      />
    </div>
    <ReportState
      v-if="total <= 0"
      :title="t('No data for this range')"
      :description="t('Try a different date range.')"
      icon="box"
    />
    <div
      v-if="data.length"
      class="category-map__detail"
    >
      <label><span>{{ t('dash_category_select') }}</span><Select
        :model-value="selected === null ? '' : String(selected)"
        :placeholder="t('All categories')"
        :options="data.map((row, i) => ({ value: String(i), label: row.label }))"
        :aria-label="t('dash_category_select')"
        @update:model-value="choose($event === '' ? null : Number($event))"
      /></label>
      <div
        class="category-map__value"
        aria-live="polite"
      >
        <strong>{{ fmtNum(active?.value ?? total) }} <small>{{ unit }}</small></strong><span>{{ active ? `${selectedShare} · ${t('Total')}` : t('All categories') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.category-map { min-width: 0; }
.category-map__canvas { width: 100%; height: 270px; overflow: hidden; }
.category-map__canvas > p { display: grid; place-items: center; height: 100%; color: var(--text-secondary); font-size: 12px; }
.category-map__detail { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; justify-content: space-between; padding: 12px 0 0; }
.category-map__detail label { flex: 1; min-width: 0; display: grid; gap: 5px; }
.category-map__detail label > span:first-child { color: var(--text-secondary); font-size: 11px; }
.category-map__select { display: flex; align-items: center; gap: 8px; }
.category-map__select select { appearance: none; background: transparent; color: var(--text); min-width: 0; width: 100%; min-height: 44px; font: 600 13px var(--font-sans); text-overflow: ellipsis; }
.category-map__select select:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; border-radius: 5px; }
.category-map__select option { background: var(--surface); }
.category-map__value { display: grid; gap: 4px; }
.category-map__value strong { font: 500 17px var(--font-mono); color: var(--text); }
.category-map__value small { font: 11px var(--font-sans); color: var(--text-secondary); }
.category-map__value > span { color: var(--text-secondary); font-size: 11px; }
@media (max-width: 600px) { .category-map__canvas { height: 220px; } .category-map__detail { flex-direction: column; align-items: stretch; } }
</style>
