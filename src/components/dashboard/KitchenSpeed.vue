<script setup lang="ts">
import ReportState from './ReportState.vue'
import { fmtNum } from '@/components/design/utils/format'

interface PrepRow { label: string; mins: number; target: number; orders: number }
const props = defineProps<{ data: PrepRow[] }>()
const { t } = useI18n({ useScope: 'global' })
const onlyLate = ref(false)
const aboveTarget = computed(() => props.data.filter(row => row.target > 0 && row.mins > row.target))
const rows = computed(() => onlyLate.value ? aboveTarget.value : props.data)

// Use one scale for every category, including overruns; a target is a marker, not a ceiling.
const scale = computed(() => Math.max(1, ...props.data.map(row => Math.max(row.mins, row.target))) * 1.12)
const width = (value: number) => `${Math.max(0, value) / scale.value * 100}%`

watch(() => props.data, () => { onlyLate.value = false })
</script>

<template>
  <div class="kitchen-speed">
    <div class="kitchen-speed__controls">
      <div class="kitchen-speed__filters">
        <button
          type="button"
          :aria-pressed="!onlyLate"
          @click="onlyLate = false"
        >
          {{ t('All categories') }} <span>{{ fmtNum(data.length) }}</span>
        </button>
        <button
          type="button"
          :aria-pressed="onlyLate"
          @click="onlyLate = true"
        >
          {{ t('dash_kitchen_above_target') }} <span>{{ fmtNum(aboveTarget.length) }}</span>
        </button>
      </div>
      <span class="kitchen-speed__key"><i />{{ t('Target') }}</span>
    </div>
    <div
      v-if="rows.length"
      class="prep-list"
    >
      <article
        v-for="row in rows"
        :key="row.label"
        class="prep-list__item"
        :class="{ 'is-late': row.target > 0 && row.mins > row.target }"
      >
        <div class="prep-list__head">
          <strong>{{ row.label }}</strong>
          <span class="prep-list__time">{{ row.mins.toFixed(1) }} <small>{{ t('min') }}</small></span>
        </div>
        <div
          class="prep-list__track"
          aria-hidden="true"
        >
          <span :style="{ width: width(row.mins) }" />
          <i
            v-if="row.target > 0"
            :style="{ left: width(row.target) }"
          />
        </div>
        <div class="prep-list__meta">
          <span>{{ fmtNum(row.orders) }} {{ t('Orders') }}</span>
          <span v-if="row.target > 0">{{ t('Target') }} {{ row.target.toFixed(1) }} {{ t('min') }}</span>
          <span v-else>{{ t('prep_status_UNTRACKED') }}</span>
          <strong v-if="row.target > 0 && row.mins > row.target">+{{ (row.mins - row.target).toFixed(1) }} {{ t('min') }}</strong>
        </div>
      </article>
    </div>
    <ReportState
      v-else
      :title="t(onlyLate ? 'dash_kitchen_no_overruns' : 'No data for this range')"
      :description="t(onlyLate ? 'dash_kitchen_no_overruns_body' : 'Try a different date range.')"
      :icon="onlyLate ? 'check' : 'clock'"
    />
  </div>
</template>

<style scoped>
.kitchen-speed { min-width: 0; }
.kitchen-speed__controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.kitchen-speed__filters { display: flex; gap: 5px; flex-wrap: wrap; }
.kitchen-speed__filters button { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 7px 10px; border-radius: 8px; color: var(--text-secondary); font-size: 11px; }
.kitchen-speed__filters button[aria-pressed="true"] { background: var(--primary-weak); color: var(--primary); }
.kitchen-speed__filters button:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.kitchen-speed__filters button span { font-variant-numeric: tabular-nums; opacity: .8; }
.kitchen-speed__key { display: flex; align-items: center; gap: 7px; font-size: 10px; color: var(--text-secondary); }
.kitchen-speed__key i { height: 12px; width: 2px; border-radius: 2px; background: var(--text-secondary); }
.prep-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.prep-list__item { --prep-color: var(--c2); padding: 14px 16px; border: 1px solid var(--dash-edge, var(--border)); border-radius: 12px; background: color-mix(in srgb, var(--prep-color) 3%, var(--surface)); }
.prep-list__item.is-late { --prep-color: var(--c3); }
.prep-list__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 14px; }
.prep-list__head > strong { font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
.prep-list__time { flex-shrink: 0; padding: 4px 8px; border-radius: 6px; background: var(--surface-2); font: 600 18px var(--font-sans); font-variant-numeric: tabular-nums; }
.prep-list__time small { font-size: 10px; color: var(--text-secondary); font-weight: 400; }
.prep-list__track { position: relative; height: 10px; border-radius: 4px; background: var(--chart-track); }
.prep-list__track > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--prep-color) 45%, white), var(--prep-color)); transition: width 200ms ease-out; }
.prep-list__track > i { position: absolute; top: -4px; bottom: -4px; width: 2px; border-radius: 2px; background: var(--text-secondary); box-shadow: 0 0 0 2px var(--surface); }
.prep-list__meta { display: flex; flex-wrap: wrap; gap: 5px 12px; margin-top: 12px; font-size: 10px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.prep-list__meta strong { margin-left: auto; font-weight: 600; color: var(--warning-strong); }
@media (max-width: 900px) { .prep-list { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .kitchen-speed__filters button { min-height: 44px; } .kitchen-speed__controls { gap: 8px; } .prep-list__item { padding: 12px; } }
@media (prefers-reduced-motion: reduce) { .prep-list__track > span { transition: none; } }
</style>
