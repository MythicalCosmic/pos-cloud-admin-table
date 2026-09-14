<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import type { EChartsOption } from 'echarts'

/* Themed ECharts wrapper — the only place charts on the Compare page mount.
   Tree-shaken registration (line/bar/pie/heatmap + grid/tooltip/legend/visualMap). */
interface Props {
  option: EChartsOption
  height?: number | string
  loading?: boolean
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  height: 300,
  loading: false,
})

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  PieChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  MarkLineComponent,
])

const heightStyle = computed(() =>
  typeof props.height === 'number' ? `${props.height}px` : props.height,
)

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

const resolvedOption = computed<EChartsOption>(() => ({
  animationDuration: reducedMotion.value ? 0 : 220,
  animationDurationUpdate: reducedMotion.value ? 0 : 160,
  ...props.option,
}))
</script>

<template>
  <div
    class="echart-wrap"
    :style="{ height: heightStyle }"
    :role="ariaLabel ? 'img' : undefined"
    :aria-label="ariaLabel"
  >
    <VChart
      class="echart"
      :option="resolvedOption"
      :loading="loading"
      :aria-hidden="ariaLabel ? 'true' : undefined"
      autoresize
    />
  </div>
</template>

<style scoped>
.echart-wrap { width: 100%; position: relative; }
.echart { width: 100%; height: 100%; }
</style>
