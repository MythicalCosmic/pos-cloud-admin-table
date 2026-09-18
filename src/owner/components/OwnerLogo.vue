<script setup lang="ts">
import BrandMark from '@/components/design/BrandMark.vue'

withDefaults(defineProps<{ size?: number }>(), { size: 64 })
</script>

<template>
  <span
    class="owner-logo"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${Math.round(size * 0.3)}px` }"
  >
    <BrandMark :style="{ width: `${Math.round(size * 0.62)}px`, height: `${Math.round(size * 0.62)}px` }" />
  </span>
</template>

<style scoped>
.owner-logo { display: inline-grid; place-items: center; background: var(--primary); color: var(--on-primary); box-shadow: var(--shadow-md); }
</style>
