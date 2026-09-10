<script setup lang="ts">
import { fmtDelta } from './utils/format'

interface Props {
  value: number | null | undefined
  digits?: number
}

const props = defineProps<Props>()

const dir = computed(() => {
  if (props.value === null || props.value === undefined)
    return 'is-flat'
  if (props.value > 0)
    return 'is-up'
  if (props.value < 0)
    return 'is-down'

  return 'is-flat'
})
</script>

<template>
  <span
    class="delta"
    :class="dir"
  >
    <template v-if="value !== null && value !== undefined && value !== 0">
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        stroke="currentColor"
        stroke-width="2.4"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <template v-if="value > 0">
          <path d="M7 17 L17 7" />
          <path d="M9 7 H17 V15" />
        </template>
        <template v-else>
          <path d="M7 7 L17 17" />
          <path d="M9 17 H17 V9" />
        </template>
      </svg>
    </template>
    {{ fmtDelta(value, digits) }}
  </span>
</template>

<style scoped>
.delta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  padding: 2px 7px 2px 5px;
  border-radius: var(--r-pill);
}
.delta.is-up {
  color: rgb(var(--v-theme-success));
  background: rgb(var(--v-theme-success-weak));
}
.delta.is-down {
  color: rgb(var(--v-theme-error));
  background: rgb(var(--v-theme-error-weak));
}
.delta.is-flat {
  color: rgb(var(--v-theme-text-secondary));
  background: rgb(var(--v-theme-neutral-weak));
}
</style>
