<script setup lang="ts">
import type { CSSProperties } from 'vue'

interface Props {
  w?: string | number
  h?: string | number
  r?: string | number
  style?: CSSProperties
}

const props = withDefaults(defineProps<Props>(), {
  w: '100%',
  h: 16,
})

const mergedStyle = computed<CSSProperties>(() => ({
  width: typeof props.w === 'number' ? `${props.w}px` : props.w,
  height: typeof props.h === 'number' ? `${props.h}px` : props.h,
  borderRadius:
    props.r === undefined
      ? undefined
      : typeof props.r === 'number' ? `${props.r}px` : props.r,
  ...(props.style || {}),
}))
</script>

<template>
  <div
    class="skel"
    :style="mergedStyle"
    aria-hidden="true"
  />
</template>

<style scoped>
.skel {
  background: linear-gradient(
    90deg,
    rgb(var(--v-theme-surface-inset)) 25%,
    rgb(var(--v-theme-neutral-weak)) 37%,
    rgb(var(--v-theme-surface-inset)) 63%
  );
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
  border-radius: var(--r-xs);
}

@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: 0 0; }
}

@media (prefers-reduced-motion: reduce) {
  .skel { animation: none; background-position: 50% 0; }
}
</style>
