<script setup lang="ts">
/**
 * Sparkline — tiny inline SVG line + optional area fill + end-dot.
 * Port of charts2.jsx Sparkline. Color resolves from first-vs-last slope
 * when colorByTrend.
 */
interface Props {
  data: number[]
  width?: number
  height?: number
  color?: string
  fill?: boolean
  colorByTrend?: boolean
  dot?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  width: 120,
  height: 34,
  color: 'rgb(var(--v-theme-chart-revenue))',
  fill: true,
  colorByTrend: false,
  dot: true,
})

const gradId = `spk${Math.random().toString(36).slice(2, 8)}`

const pts = computed<[number, number][]>(() => {
  const d = props.data || []
  if (!d.length)
    return []
  const min = Math.min(...d)
  const max = Math.max(...d)
  const span = max - min || 1
  return d.map((v, i) => [
    (i / Math.max(1, d.length - 1)) * (props.width - 4) + 2,
    props.height - 3 - ((v - min) / span) * (props.height - 6),
  ])
})

const line = computed(() =>
  pts.value.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
)

const area = computed(() => {
  if (!pts.value.length)
    return ''
  return `${line.value} L${pts.value[pts.value.length - 1][0]} ${props.height} L${pts.value[0][0]} ${props.height} Z`
})

const trendColor = computed(() => {
  if (!props.colorByTrend || !props.data.length)
    return props.color
  const up = props.data[props.data.length - 1] >= props.data[0]
  return up ? 'rgb(var(--v-theme-success))' : 'rgb(var(--v-theme-error))'
})

const last = computed(() => pts.value[pts.value.length - 1])
</script>

<template>
  <svg
    v-if="pts.length"
    :width="width"
    :height="height"
    style="display: block; overflow: visible;"
  >
    <defs>
      <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" :stop-color="trendColor" stop-opacity="0.22" />
        <stop offset="100%" :stop-color="trendColor" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path
      v-if="fill"
      :d="area"
      :fill="`url(#${gradId})`"
    />
    <path
      :d="line"
      fill="none"
      :stroke="trendColor"
      stroke-width="2"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <circle
      v-if="dot && last"
      :cx="last[0]"
      :cy="last[1]"
      r="2.6"
      :fill="trendColor"
    />
  </svg>
  <svg
    v-else
    :width="width"
    :height="height"
  />
</template>
