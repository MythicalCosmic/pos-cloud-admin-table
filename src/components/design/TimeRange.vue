<script setup lang="ts">
// ============================================================
// ALPHA POS - TimeRange primitive
// Ported verbatim from .tmp-handoff-v3/pos-admin-panel/project/app/ui.jsx (lines 129-137)
// From-to time pair wrapping two TimeField components.
// ============================================================
import TimeField from './TimeField.vue'

interface Props {
  from?: string
  to?: string
  disabled?: boolean
  fromLabel?: string
  toLabel?: string
}

withDefaults(defineProps<Props>(), {
  from: '',
  to: '',
})

const emit = defineEmits<{
  (e: 'update:from', v: string): void
  (e: 'update:to', v: string): void
}>()

const { t } = useI18n({ useScope: 'global' })

function onFrom(v: string) {
  emit('update:from', v)
}
function onTo(v: string) {
  emit('update:to', v)
}
</script>

<template>
  <div
    class="row"
    style="gap: 8px; align-items: center;"
  >
    <TimeField
      :value="from"
      icon="clock"
      :disabled="disabled"
      :label="fromLabel || t('From')"
      @update:value="onFrom"
    />
    <span
      class="tertiary"
      style="font-size: 13px;"
    >{{ t('to') }}</span>
    <TimeField
      :value="to"
      :disabled="disabled"
      :label="toLabel || t('To')"
      @update:value="onTo"
    />
  </div>
</template>
