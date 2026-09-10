<script setup lang="ts">
import DateRangePicker, { type DateRangeValue } from '@/components/design/DateRangePicker.vue'
import Switch from '@/components/design/Switch.vue'
import type { CompareMode, Granularity } from '@/types/comparison'

// Sticky control bar: Period A + Period B pickers, comparison-mode presets
// (which derive B from A), granularity, and the Total / Daily-average toggle.
// Emits value changes; the page owns state + B derivation.

const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'update:aRange', v: DateRangeValue): void
  (e: 'update:bRange', v: DateRangeValue): void
  (e: 'update:mode', v: CompareMode): void
  (e: 'update:granularity', v: Granularity): void
  (e: 'update:avgMode', v: boolean): void
}>()

const { t } = useI18n({ useScope: 'global' })

interface Props {
  aRange: DateRangeValue
  bRange: DateRangeValue
  mode: CompareMode
  granularity: Granularity
  avgMode: boolean
  daysA: number
  daysB: number
}

const modes: { key: CompareMode; label: string }[] = [
  { key: 'previous_period', label: 'Previous period' },
  { key: 'same_period_last_year', label: 'Same period last year' },
  { key: 'custom', label: 'Custom range' },
]

const grans: { key: Granularity; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

const rangesDiffer = computed(() => props.daysA !== props.daysB)
</script>

<template>
  <div class="cbar">
    <div class="cbar__row">
      <div class="cbar__field">
        <label class="cbar__lbl cbar__lbl--a">{{ t('Period A') }}</label>
        <DateRangePicker
          :model-value="aRange"
          align="left"
          :enable-time="false"
          @update:model-value="emit('update:aRange', $event)"
        />
      </div>

      <div class="cbar__vs">
        {{ t('vs') }}
      </div>

      <div class="cbar__field">
        <label class="cbar__lbl cbar__lbl--b">{{ t('Period B') }}</label>
        <DateRangePicker
          :model-value="bRange"
          align="left"
          :enable-time="false"
          :class="{ 'is-locked': mode !== 'custom' }"
          @update:model-value="emit('update:bRange', $event)"
        />
      </div>

      <div class="cbar__spacer" />

      <label
        class="cbar__toggle"
        :title="t('Normalise each period by its day count')"
      >
        <Switch
          :model-value="avgMode"
          :aria-label="t('Daily average')"
          @update:model-value="emit('update:avgMode', $event)"
        />
        {{ t('Daily average') }}
      </label>
    </div>

    <div class="cbar__row cbar__row--controls">
      <div class="cbar__group">
        <span class="cbar__glabel">{{ t('Compare to') }}</span>
        <div class="seg">
          <button
            v-for="m in modes"
            :key="m.key"
            type="button"
            class="seg__btn"
            :class="{ 'is-active': mode === m.key }"
            @click="emit('update:mode', m.key)"
          >
            {{ t(m.label) }}
          </button>
        </div>
      </div>

      <div class="cbar__group">
        <span class="cbar__glabel">{{ t('Granularity') }}</span>
        <div class="seg">
          <button
            v-for="g in grans"
            :key="g.key"
            type="button"
            class="seg__btn"
            :class="{ 'is-active': granularity === g.key }"
            @click="emit('update:granularity', g.key)"
          >
            {{ t(g.label) }}
          </button>
        </div>
      </div>

      <div
        v-if="rangesDiffer"
        class="cbar__warn"
        :title="t('Turn on Daily average to compare unequal ranges fairly')"
      >
        ⚠ {{ t('Ranges differ: {a} vs {b} days', { a: daysA, b: daysB }) }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.cbar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  padding: var(--sp-3) var(--sp-4);
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}
.cbar__row { display: flex; align-items: flex-end; gap: var(--sp-3); flex-wrap: wrap; }
.cbar__row--controls { align-items: center; }
.cbar__field { display: flex; flex-direction: column; gap: 4px; }
.cbar__lbl { font-size: var(--fs-label); text-transform: uppercase; letter-spacing: var(--tracking-label); font-weight: 700; }
.cbar__lbl--a { color: var(--color-period-a); }
.cbar__lbl--b { color: var(--color-period-b); }
.cbar__vs { color: var(--text-tertiary); font-size: 13px; padding-bottom: 10px; font-family: var(--font-mono); }
.cbar__spacer { flex: 1; }
.cbar__toggle { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--text-secondary); cursor: pointer; padding-bottom: 6px; }
.cbar__group { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.cbar__glabel { font-size: var(--fs-label); text-transform: uppercase; letter-spacing: var(--tracking-label); color: var(--text-tertiary); font-weight: 600; }
.cbar__warn {
  font-size: 12px; font-weight: 500; color: var(--warning, #B26A00);
  background: color-mix(in srgb, var(--warning, #B26A00) 12%, transparent);
  padding: 4px 10px; border-radius: 99px;
}
.is-locked { opacity: 0.6; pointer-events: none; }
.seg { display: inline-flex; background: var(--surface-2); border-radius: var(--r-sm); padding: 2px; gap: 2px; flex-wrap: wrap; }
.seg__btn { border: 0; background: transparent; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 500; color: var(--text-secondary); padding: 5px 11px; border-radius: calc(var(--r-sm) - 2px); white-space: nowrap; }
.seg__btn.is-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-xs); font-weight: 600; }
</style>
