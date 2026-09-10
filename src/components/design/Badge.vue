<script setup lang="ts">
type Tone = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'

interface Props {
  tone?: Tone
  dot?: boolean
  className?: string
}

withDefaults(defineProps<Props>(), {
  tone: 'neutral',
  dot: false,
})
</script>

<template>
  <span
    class="badge"
    :class="[`t-${tone}`, { 'badge--dot': dot }, className]"
  >
    <slot />
  </span>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 9px;
  border-radius: var(--r-xs);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  letter-spacing: 0.01em;
  white-space: nowrap;
  border: 1px solid transparent;
}

.badge--dot::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: currentColor;
}

.badge.t-success {
  background: rgb(var(--v-theme-success-weak));
  color: rgb(var(--v-theme-success-strong));
  border-color: rgb(var(--v-theme-success-border));
}
.badge.t-warning {
  background: rgb(var(--v-theme-warning-weak));
  color: rgb(var(--v-theme-warning-strong));
  border-color: rgb(var(--v-theme-warning-border));
}
.badge.t-error {
  background: rgb(var(--v-theme-error-weak));
  color: rgb(var(--v-theme-error-strong));
  border-color: rgb(var(--v-theme-error-border));
}
.badge.t-info {
  background: rgb(var(--v-theme-info-weak));
  color: rgb(var(--v-theme-info-strong));
  border-color: rgb(var(--v-theme-info-border));
}
.badge.t-primary {
  background: rgb(var(--v-theme-primary-weak));
  color: rgb(var(--v-theme-primary));
  border-color: rgb(var(--v-theme-primary-border));
}
.badge.t-neutral {
  background: rgb(var(--v-theme-neutral-weak));
  color: rgb(var(--v-theme-text-secondary));
  border-color: rgb(var(--v-theme-neutral-border));
}
</style>
