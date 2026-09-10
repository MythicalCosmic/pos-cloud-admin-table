<script setup lang="ts">
/* Pure-SVG circular progress ring.
   Port of v3 ProgressRing (Orders insights).
   Props:
     value: 0-100
     color: stroke color (CSS variable or hex)
     size:  diameter px (default 84)
*/
interface Props {
  value: number
  color?: string
  size?: number
  trackColor?: string
  strokeWidth?: number
}

const props = withDefaults(defineProps<Props>(), {
  color: 'var(--success)',
  size: 84,
  trackColor: 'var(--border)',
  strokeWidth: 8,
})

const radius = computed(() => (props.size - props.strokeWidth) / 2)
const circ = computed(() => 2 * Math.PI * radius.value)
const clamped = computed(() => Math.max(0, Math.min(100, Number(props.value) || 0)))
const dashOffset = computed(() => circ.value * (1 - clamped.value / 100))
const cxy = computed(() => props.size / 2)
</script>

<template>
  <div class="progring" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg
      :width="size"
      :height="size"
      :viewBox="`0 0 ${size} ${size}`"
      class="progring__svg"
    >
      <circle
        :cx="cxy"
        :cy="cxy"
        :r="radius"
        fill="none"
        :stroke="trackColor"
        :stroke-width="strokeWidth"
      />
      <circle
        :cx="cxy"
        :cy="cxy"
        :r="radius"
        fill="none"
        :stroke="color"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        :stroke-dasharray="circ"
        :stroke-dashoffset="dashOffset"
        :transform="`rotate(-90 ${cxy} ${cxy})`"
        class="progring__bar"
      />
    </svg>
    <div class="progring__label mono">
      {{ Math.round(clamped) }}%
    </div>
  </div>
</template>

<style scoped>
.progring {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}
.progring__svg {
  display: block;
}
.progring__bar {
  transition: stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1);
}
.progring__label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
</style>
