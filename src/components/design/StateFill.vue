<script setup lang="ts">
import type { CSSProperties } from 'vue'
import DesignIcon from './DesignIcon.vue'

interface Props {
  icon?: string
  title: string
  sub?: string
  error?: boolean
  style?: CSSProperties
}

withDefaults(defineProps<Props>(), {
  icon: 'inbox',
  error: false,
})
</script>

<template>
  <div
    class="statefill"
    :class="{ 'is-error': error }"
    :style="style"
    :role="error ? 'alert' : 'status'"
    :aria-live="error ? 'assertive' : 'polite'"
  >
    <div class="statefill__icon">
      <DesignIcon
        :name="icon"
        :size="24"
      />
    </div>
    <div class="statefill__title">
      {{ title }}
    </div>
    <div
      v-if="sub"
      class="statefill__sub"
    >
      {{ sub }}
    </div>
    <slot name="action" />
    <slot />
  </div>
</template>

<style scoped>
.statefill {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--sp-2);
  padding: var(--sp-8) var(--sp-5);
  color: rgb(var(--v-theme-text-secondary));
}
.statefill__icon {
  width: 48px;
  height: 48px;
  border-radius: var(--r-md);
  display: grid;
  place-items: center;
  background: rgb(var(--v-theme-surface-inset));
  color: rgb(var(--v-theme-text-tertiary));
  margin-bottom: var(--sp-1);
}
.statefill__title {
  font-weight: var(--fw-semibold);
  color: rgb(var(--v-theme-on-surface));
}
.statefill__sub {
  font-size: var(--fs-sm);
}
.statefill.is-error .statefill__icon {
  background: rgb(var(--v-theme-error-weak));
  color: rgb(var(--v-theme-error));
}
</style>
