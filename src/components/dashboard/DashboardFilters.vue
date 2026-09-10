<script setup lang="ts">
import DateRangeFields from '@/components/design/DateRangeFields.vue'
import type { DateRangeValue } from '@/components/design/DateRangePicker.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Modal from '@/components/design/Modal.vue'
import { formatMonthNumber } from '@/utils/monthLabels'

const props = defineProps<{ modelValue: DateRangeValue; includeAll?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DateRangeValue): void }>()
const { t, locale } = useI18n({ useScope: 'global' })
const compact = useMediaQuery('(max-width: 650px)')
const open = ref(false)

const label = computed(() => {
  const format = (date: string) => {
    const parsed = new Date(`${date}T12:00:00`)
    return locale.value === 'uz'
      ? `${parsed.getDate()} ${formatMonthNumber(parsed.getMonth() + 1, t)}`
      : new Intl.DateTimeFormat(String(locale.value), { day: 'numeric', month: 'short' }).format(parsed)
  }

  const range = props.modelValue
  if (!range.from || !range.to)
    return t('All time')
  return `${format(range.from)}${range.fromTime ? `, ${range.fromTime}` : ''} — ${format(range.to)}${range.toTime ? `, ${range.toTime}` : ''}`
})

function apply(value: DateRangeValue) {
  emit('update:modelValue', value)
  open.value = false
}
watch(compact, () => { open.value = false })
</script>

<template>
  <div class="dashboard-filters">
    <template v-if="compact">
      <button
        class="dashboard-filters__trigger"
        type="button"
        :aria-label="t('Date range')"
        aria-haspopup="dialog"
        :aria-expanded="open"
        @click="open = true"
      >
        <DesignIcon
          name="calendar"
          :size="18"
        />
        <span>{{ label }}</span>
        <DesignIcon
          name="chevdown"
          :size="16"
        />
      </button>
      <Modal
        :open="open"
        :title="t('Date range')"
        :width="520"
        @close="open = false"
      >
        <DateRangeFields
          v-if="open"
          class="dashboard-filters__sheet"
          :model-value="modelValue"
          :include-all="includeAll"
          allow-unchanged
          @update:model-value="apply"
        />
      </Modal>
    </template>
    <DateRangeFields
      v-else
      :model-value="modelValue"
      :include-all="includeAll"
      @update:model-value="apply"
    />
  </div>
</template>

<style scoped>
.dashboard-filters { min-inline-size: 0; }
.dashboard-filters__trigger { display: flex; align-items: center; gap: 12px; inline-size: 100%; min-block-size: 48px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); text-align: start; font-size: 13px; font-weight: 600; }
.dashboard-filters__trigger > span { flex: 1; min-inline-size: 0; overflow-wrap: anywhere; }
.dashboard-filters__trigger > svg { flex-shrink: 0; color: var(--text-secondary); }
.dashboard-filters__trigger:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.dashboard-filters__sheet { border: 0; padding: 0; }
@media (max-width: 650px) { :global(.overlay:has(.dashboard-filters__sheet)) { align-items: flex-end; padding: 8px 8px max(8px, env(safe-area-inset-bottom)); } :global(.modal:has(.dashboard-filters__sheet)) { border-radius: 20px 20px 14px 14px; } }
</style>
