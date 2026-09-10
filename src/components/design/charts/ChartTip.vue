<script setup lang="ts">
interface TipRow {
  color?: string
  label: string
  value: string
}

interface Props {
  show: boolean
  x: number
  y: number
  title?: string
  rows: TipRow[]
}

const props = defineProps<Props>()

// Measure the tip after render and clamp x/y so the pill never leaves the
// viewport — near the right edge of a chart the -50% translateX previously
// pushed half the tooltip past the browser edge and cropped the value.
const tipRef = ref<HTMLElement | null>(null)
const tipW = ref(160)
const tipH = ref(56)

watch([() => props.x, () => props.y, () => props.show, () => props.rows], async () => {
  if (!props.show) return
  await nextTick()
  const el = tipRef.value
  if (!el) return
  tipW.value = el.offsetWidth
  tipH.value = el.offsetHeight
})

const clampedX = computed(() => {
  if (typeof window === 'undefined') return props.x
  const half = tipW.value / 2
  const margin = 8
  return Math.max(half + margin, Math.min(props.x, window.innerWidth - half - margin))
})

const clampedY = computed(() => {
  if (typeof window === 'undefined') return props.y
  // Default anchor is above cursor (translateY -118%). If the tip would clip
  // the top of the viewport, flip below the cursor instead.
  const gap = 12
  const wantAbove = props.y - tipH.value - gap
  if (wantAbove < margin())
    return Math.min(window.innerHeight - margin() - 4, props.y + gap + tipH.value)
  return props.y
})

function margin() { return 8 }

const flipDown = computed(() => {
  if (typeof window === 'undefined') return false
  const gap = 12
  return (props.y - tipH.value - gap) < margin()
})

const transform = computed(() =>
  flipDown.value ? 'translate(-50%, 0)' : 'translate(-50%, -118%)',
)
</script>

<template>
  <!-- Teleport out of any parent stacking context (chart cards, .card __body,
       transform-animated ancestors) so the fixed-position tooltip is not
       clipped or covered by sibling cards no matter where it renders. -->
  <Teleport to="body">
    <div
      v-if="show"
      ref="tipRef"
      class="charttip"
      :style="{ left: `${clampedX}px`, top: `${clampedY}px`, transform }"
    >
      <div
        v-if="title"
        class="charttip__t"
      >
        {{ title }}
      </div>
      <div
        v-for="(r, i) in rows"
        :key="i"
        class="charttip__row"
      >
        <span
          v-if="r.color"
          class="legend-swatch"
          :style="{ background: r.color }"
        />
        <span>{{ r.label }}</span>
        <span class="charttip__v">{{ r.value }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* NOT scoped — Teleport moves the element to <body>, outside the SFC's scope. */
.charttip {
  position: fixed;
  /* z above sidebar (80), overlay (100), so the tooltip paints on top of every
     card and drawer. Kept below Vuetify VOverlay (2400) so a real modal still
     wins. */
  z-index: 300;
  pointer-events: none;
  background: rgb(var(--v-theme-on-surface));
  color: rgb(var(--v-theme-surface));
  border-radius: var(--r-sm);
  padding: 8px 11px;
  font-size: var(--fs-sm);
  box-shadow: var(--shadow-lg);
  min-width: 92px;
  /* Smooth glide between hover points instead of teleporting */
  transition: left .12s cubic-bezier(.2, .8, .2, 1), top .12s cubic-bezier(.2, .8, .2, 1);
}
[data-theme="dark"] .charttip,
.v-theme--dark .charttip {
  background: rgb(var(--v-theme-surface-2));
  color: rgb(var(--v-theme-on-surface));
  border: 1px solid rgb(var(--v-theme-border-strong));
}
.charttip__t {
  font-size: var(--fs-label);
  opacity: .7;
  margin-bottom: 3px;
}
.charttip__row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.charttip__v {
  font-family: var(--font-mono);
  font-weight: var(--fw-bold);
  margin-left: auto;
}
.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  flex: 0 0 10px;
}
</style>
