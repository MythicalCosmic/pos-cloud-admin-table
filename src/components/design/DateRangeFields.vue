<script setup lang="ts">
import type { DateRangeValue } from './DateRangePicker.vue'
import DesignIcon from './DesignIcon.vue'
import Select from './Select.vue'
import DateTimeField from './DateTimeField.vue'
import { designId } from './ids'
import { buildDateParams, businessPreset, useBusinessDay } from '@/composables/useBusinessDay'

const props = defineProps<{ modelValue: DateRangeValue; allowUnchanged?: boolean; includeAll?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: DateRangeValue): void }>()
const { t } = useI18n({ useScope: 'global' })
const biz = useBusinessDay()
const id = designId('date-fields')
const draft = ref<DateRangeValue>({ ...props.modelValue })

const presets = computed(() => [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['month', 'This month'],
  ['prevmonth', 'Last month'],
  ['year', 'This year'],
  ...(props.includeAll ? [['all', 'All time']] : []),
])

watch(() => props.modelValue, value => { draft.value = { ...value } }, { deep: true })

const maxDate = computed(() => businessPreset('today').to)
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
const allTime = computed(() => props.includeAll && draft.value.preset === 'all' && !draft.value.from && !draft.value.to)

const error = computed(() => {
  if (allTime.value)
    return ''
  if (!validDate(draft.value.from) || !validDate(draft.value.to))
    return t('dash_dates_required')
  if (draft.value.from > draft.value.to)
    return t('dash_dates_order')
  if (draft.value.to > maxDate.value)
    return t('dash_dates_future')
  if ((draft.value.fromTime || draft.value.toTime)
    && !(/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.value.fromTime || '') && /^([01]\d|2[0-3]):[0-5]\d$/.test(draft.value.toTime || '')))
    return t('dash_times_required')
  return ''
})

const changed = computed(() => ['from', 'to', 'fromTime', 'toTime'].some(key =>
  (draft.value[key as keyof DateRangeValue] || '') !== (props.modelValue[key as keyof DateRangeValue] || ''),
))

const overnight = computed(() => draft.value.from === draft.value.to && !!draft.value.fromTime
  && !!draft.value.toTime && draft.value.toTime <= draft.value.fromTime)

const exactInterval = computed(() => {
  if (error.value || !draft.value.fromTime)
    return ''
  const params = buildDateParams(draft.value)
  return `${params.from_at?.slice(0, 16).replace('T', ' ')} → ${params.to_at?.slice(0, 16).replace('T', ' ')} · Asia/Tashkent`
})

function apply() {
  if (error.value || (!changed.value && !props.allowUnchanged))
    return
  emit('update:modelValue', { ...draft.value, mode: draft.value.fromTime ? 'time' : 'date' })
}
function preset(key: string) {
  if (!key)
    return
  draft.value = (key === 'all' && props.includeAll)
    ? { from: '', to: '', preset: 'all', mode: 'date' }
    : { ...businessPreset(key), preset: key, mode: 'date' }
  emit('update:modelValue', { ...draft.value })
}
function selectEndpoint(endpoint: 'from' | 'to', value: { date: string; time: string }) {
  if (allTime.value)
    draft.value = { from: value.date, to: value.date, mode: 'time' }
  draft.value[endpoint] = value.date
  draft.value[endpoint === 'from' ? 'fromTime' : 'toTime'] = value.time
  draft.value.fromTime ||= biz.open.value
  draft.value.toTime ||= biz.close.value
  draft.value.preset = undefined
}
function setTimes(working: boolean) {
  if (allTime.value) {
    if (!working)
      return
    draft.value = { ...businessPreset('today'), mode: 'time' }
  }
  draft.value.preset = undefined
  draft.value.fromTime = working ? biz.open.value : ''
  draft.value.toTime = working ? biz.close.value : ''
}
</script>

<template>
  <form
    class="date-fields"
    novalidate
    :aria-label="t('Date range')"
    @submit.prevent="apply"
  >
    <div class="date-fields__row">
      <DateTimeField
        :date="draft.from"
        :time="draft.fromTime"
        :default-time="biz.open.value"
        :label="t('dash_start_date')"
        :placeholder="allTime ? t('All time') : undefined"
        :max="maxDate"
        :invalid="!!error"
        :described-by="error ? `${id}-error` : undefined"
        @select="selectEndpoint('from', $event)"
      />
      <DesignIcon
        class="date-fields__arrow"
        name="arrowright"
        :size="18"
      />
      <DateTimeField
        :date="draft.to"
        :time="draft.toTime"
        :default-time="biz.close.value"
        :label="t('dash_end_date')"
        :placeholder="allTime ? t('All time') : undefined"
        :max="maxDate"
        :invalid="!!error"
        :described-by="error ? `${id}-error` : undefined"
        @select="selectEndpoint('to', $event)"
      />
      <label
        class="date-fields__presets"
        :for="`${id}-preset`"
      >
        <span>{{ t('dash_quick_range') }}</span>
        <Select
          :id="`${id}-preset`"
          class="date-fields__select"
          :aria-label="t('dash_quick_range')"
          :model-value="draft.preset || ''"
          :placeholder="t('dash_custom_range')"
          :options="presets.map(p => ({ value: p[0], label: t(p[1]) }))"
          @update:model-value="preset"
        />
      </label>
      <button
        class="date-fields__apply"
        type="submit"
        :disabled="(!changed && !allowUnchanged) || !!error"
      >
        <DesignIcon
          name="check"
          :size="17"
        />{{ t('Apply') }}
      </button>
    </div>
    <p
      v-if="error"
      :id="`${id}-error`"
      class="date-fields__error"
      role="alert"
    >
      {{ error }}
    </p>
    <div class="date-fields__timebar">
      <div
        class="date-fields__time-presets"
        :aria-label="t('Time')"
      >
        <button
          type="button"
          :aria-pressed="!draft.fromTime && !draft.toTime"
          @click="setTimes(false)"
        >
          {{ t('Whole day') }}
        </button>
        <button
          type="button"
          :aria-pressed="draft.fromTime === biz.open.value && draft.toTime === biz.close.value"
          @click="setTimes(true)"
        >
          {{ t('Working hours') }}
        </button>
      </div>
      <span v-if="!draft.fromTime">{{ t('dash_business_day_note', { time: biz.start.value }) }}</span>
      <span v-else>{{ exactInterval }}<span
        v-if="overnight"
        class="date-fields__overnight"
      >{{ t('dash_overnight') }}</span></span>
    </div>
  </form>
</template>

<style scoped>
.date-fields { container-type: inline-size; padding: 16px 16px 8px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); }
.date-fields :deep(.datetime-field__trigger) { min-height: 48px; padding-block: 8px; }
.date-fields__row { display: grid; grid-template-columns: minmax(150px, 1fr) 20px minmax(150px, 1fr) minmax(160px, .85fr) auto; align-items: end; gap: 12px; }
.date-fields__presets { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 8px; font-size: 12px; color: var(--text-secondary); font-weight: 600; }
.date-fields__select { min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 48px; border: 1px solid var(--border); background: var(--surface-2); border-radius: 12px; padding: 0 12px; color: var(--text); }
.date-fields__select:focus-within { outline: 2px solid var(--primary); outline-offset: 3px; }
.date-fields select { min-width: 0; width: 100%; border: 0; background: transparent; color: var(--text); font: inherit; font-size: 14px; min-height: 46px; outline: none; appearance: none; cursor: pointer; }
.date-fields option { background: var(--surface); color: var(--text); }
.date-fields__arrow { align-self: center; margin-top: 22px; color: var(--text-secondary); }
.date-fields__apply { display: flex; justify-content: center; align-items: center; gap: 8px; min-height: 48px; padding: 0 18px; border-radius: 12px; background: var(--primary); color: var(--on-primary); font-size: 13px; font-weight: 700; transition: opacity 150ms; }
.date-fields__apply:disabled { opacity: .45; cursor: default; }
.date-fields__timebar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; margin-top: 10px; color: var(--text-secondary); font-size: 11px; line-height: 1.6; }
.date-fields__error { margin: 10px 0 0; color: var(--error); font-size: 12px; }
.date-fields button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
.date-fields__time-presets { display: flex; gap: 4px; }
.date-fields__time-presets button { min-height: 36px; padding: 0 10px; border-radius: 8px; font-size: 11px; }
.date-fields__time-presets button[aria-pressed="true"] { background: var(--primary-weak); color: var(--primary); }
.date-fields__overnight { display: block; }
@container (max-width: 700px) {
  .date-fields__row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .date-fields__arrow { display: none; }
  .date-fields__select { min-height: 46px; padding: 0 9px; gap: 5px; }
  .date-fields select { min-height: 44px; font-size: 12px; }
  .date-fields__apply { min-height: 46px; padding: 0 12px; }
  .date-fields__timebar { gap: 4px 12px; }
}
@media (max-width: 900px) {
  .date-fields { padding: 16px 16px 10px; border-radius: 16px; }
  .date-fields__row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
  .date-fields__arrow { display: none; }
  .date-fields__select { min-height: 46px; padding: 0 9px; gap: 5px; }
  .date-fields select { min-height: 44px; font-size: 12px; }
  .date-fields__apply { min-height: 46px; padding: 0 12px; }
  .date-fields__timebar { gap: 4px 12px; }
  .date-fields__time-presets button { min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) { .date-fields__apply { transition: none; } }
</style>
