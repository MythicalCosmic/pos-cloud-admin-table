<script setup lang="ts">
/* Themed ECharts wrapper — the ONLY place charts on the Compare page mount.
   Tree-shaken registration (line/bar/pie/heatmap + grid/tooltip/legend/visualMap). */
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

use([
  CanvasRenderer,
  LineChart, BarChart, PieChart, HeatmapChart,
  GridComponent, TooltipComponent, LegendComponent, VisualMapComponent, MarkLineComponent,
])

interface Props {
  option: EChartsOption
  height?: number | string
  loading?: boolean
}
const props = withDefaults(defineProps<Props>(), {
  height: 300,
  loading: false,
})

const heightStyle = computed(() =>
  typeof props.height === 'number' ? `${props.height}px` : props.height,
)
</script>

<template>
  <div class="echart-wrap" :style="{ height: heightStyle }">
    <VChart
      class="echart"
      :option="option"
      :loading="loading"
      autoresize
    />
  </div>
</template>

<style scoped>
.echart-wrap { width: 100%; position: relative; }
.echart { width: 100%; height: 100%; }
</style>
