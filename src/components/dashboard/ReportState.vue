<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'

withDefaults(defineProps<{
  title: string
  description?: string
  icon?: string
  action?: string
  error?: boolean
}>(), { icon: 'bars', error: false })
defineEmits<{ (event: 'action'): void }>()
</script>

<template>
  <div
    class="report-state"
    :class="{ 'report-state--error': error }"
    :role="error ? 'alert' : 'status'"
  >
    <span class="report-state__icon"><DesignIcon
      :name="icon"
      :size="22"
    /></span>
    <div class="report-state__copy">
      <strong>{{ title }}</strong>
      <p v-if="description">
        {{ description }}
      </p>
      <button
        v-if="action"
        type="button"
        @click="$emit('action')"
      >
        {{ action }}<DesignIcon
          name="arrowright"
          :size="15"
        />
      </button>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.report-state { display: flex; align-items: center; gap: 14px; min-width: 0; padding: 22px 4px; }
.report-state__icon { flex: 0 0 44px; display: grid; place-items: center; height: 44px; border: 1px dashed var(--border); border-radius: 14px; color: var(--text-secondary); }
.report-state__copy { min-width: 0; }
.report-state strong { display: block; color: var(--text); font-size: 13px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.report-state p { margin: 4px 0 0; max-width: 48ch; color: var(--text-secondary); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.report-state button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 12px; color: var(--primary); font-weight: 600; }
.report-state button:hover { text-decoration: underline; text-underline-offset: 3px; }
.report-state button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; border-radius: 4px; }
.report-state--error .report-state__icon { color: var(--error); }
</style>
