<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import DateRangePicker, { type DateRangeValue } from '@/components/design/DateRangePicker.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import SearchSelect from '@/components/design/SearchSelect.vue'
import Switch from '@/components/design/Switch.vue'
import type { CompareMode, Granularity } from '@/types/comparison'

interface ProductOption {
  value: string
  label: string
  keywords?: string
}

interface Props {
  aRange: DateRangeValue
  bRange: DateRangeValue
  mode: CompareMode
  granularity: Granularity
  avgMode: boolean
  daysA: number
  daysB: number
  productId?: string
  productOptions?: ProductOption[]
  productsLoading?: boolean
  loading?: boolean
  dirty?: boolean
  valid?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  productId: '',
  productOptions: () => [],
  productsLoading: false,
  loading: false,
  dirty: false,
  valid: true,
})

const emit = defineEmits<{
  (event: 'update:aRange', value: DateRangeValue): void
  (event: 'update:bRange', value: DateRangeValue): void
  (event: 'update:mode', value: CompareMode): void
  (event: 'update:granularity', value: Granularity): void
  (event: 'update:avgMode', value: boolean): void
  (event: 'update:productId', value: string): void
  (event: 'compare'): void
  (event: 'swap'): void
  (event: 'quickPreset', value: 'month' | '30d' | 'year'): void
}>()

const { t } = useI18n({ useScope: 'global' })

const modes: Array<{ key: CompareMode; label: string }> = [
  { key: 'previous_month', label: 'Previous month' },
  { key: 'previous_period', label: 'Previous period' },
  { key: 'same_period_last_year', label: 'Same period last year' },
  { key: 'custom', label: 'Custom dates' },
]

const granularities: Array<{ key: Granularity; label: string }> = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
]

const rangesDiffer = computed(() => props.daysA !== props.daysB)

function updateBaseline(value: DateRangeValue) {
  emit('update:mode', 'custom')
  emit('update:bRange', value)
}
</script>

<template>
  <section
    class="cbar"
    aria-labelledby="comparison-studio-title"
  >
    <div class="cbar__head">
      <div class="cbar__intro">
        <span
          class="cbar__symbol"
          aria-hidden="true"
        >
          <DesignIcon
            name="exchange"
            :size="20"
          />
        </span>
        <div>
          <p class="cbar__eyebrow">
            {{ t('Build your comparison') }}
          </p>
          <h2
            id="comparison-studio-title"
            class="cbar__title"
          >
            {{ t('Comparison studio') }}
          </h2>
        </div>
      </div>

      <div
        class="cbar__quick"
        :aria-label="t('Quick comparisons')"
      >
        <button
          type="button"
          @click="emit('quickPreset', 'month')"
        >
          {{ t('This month vs last month') }}
        </button>
        <button
          type="button"
          @click="emit('quickPreset', '30d')"
        >
          {{ t('Last 30 days vs previous 30') }}
        </button>
        <button
          type="button"
          @click="emit('quickPreset', 'year')"
        >
          {{ t('This period vs last year') }}
        </button>
      </div>
    </div>

    <div class="cbar__canvas">
      <Field
        class="cbar__product"
        :label="t('Product focus')"
        :hint="productsLoading ? t('Loading product catalog…') : t('Choose one product or compare the whole catalog')"
      >
        <SearchSelect
          :model-value="productId"
          :options="productOptions"
          :placeholder="t('All products')"
          :search-placeholder="t('Search products…')"
          icon="search"
          :disabled="productsLoading && productOptions.length === 0"
          @update:model-value="emit('update:productId', $event)"
        />
      </Field>

      <div class="cbar__period cbar__period--a">
        <div class="cbar__period-head">
          <span class="cbar__period-index">A</span>
          <div>
            <strong>{{ t('Current period') }}</strong>
            <span>{{ t('{count} days', { count: daysA }) }}</span>
          </div>
        </div>
        <DateRangePicker
          :model-value="aRange"
          align="left"
          :enable-time="false"
          :include-all="false"
          :aria-label="t('Current period date range')"
          @update:model-value="emit('update:aRange', $event)"
        />
      </div>

      <button
        type="button"
        class="cbar__swap"
        :aria-label="t('Swap periods')"
        :title="t('Swap periods')"
        @click="emit('swap')"
      >
        <DesignIcon
          name="exchange"
          :size="18"
        />
      </button>

      <div class="cbar__period cbar__period--b">
        <div class="cbar__period-head">
          <span class="cbar__period-index">B</span>
          <div>
            <strong>{{ t('Baseline period') }}</strong>
            <span>{{ t('{count} days', { count: daysB }) }}</span>
          </div>
        </div>
        <DateRangePicker
          :model-value="bRange"
          align="right"
          :enable-time="false"
          :include-all="false"
          :aria-label="t('Baseline period date range')"
          @update:model-value="updateBaseline"
        />
      </div>
    </div>

    <div class="cbar__footer">
      <div class="cbar__group">
        <span class="cbar__group-label">{{ t('Compare with') }}</span>
        <div class="cbar__segments">
          <button
            v-for="item in modes"
            :key="item.key"
            type="button"
            :class="{ 'is-active': mode === item.key }"
            :aria-pressed="mode === item.key"
            @click="emit('update:mode', item.key)"
          >
            {{ t(item.label) }}
          </button>
        </div>
      </div>

      <div class="cbar__group cbar__group--granularity">
        <span class="cbar__group-label">{{ t('Group by') }}</span>
        <div class="cbar__segments">
          <button
            v-for="item in granularities"
            :key="item.key"
            type="button"
            :class="{ 'is-active': granularity === item.key }"
            :aria-pressed="granularity === item.key"
            @click="emit('update:granularity', item.key)"
          >
            {{ t(item.label) }}
          </button>
        </div>
      </div>

      <label class="cbar__average">
        <Switch
          :model-value="avgMode"
          :aria-label="t('Daily KPI averages')"
          @update:model-value="emit('update:avgMode', $event)"
        />
        <span>
          <strong>{{ t('Daily KPI averages') }}</strong>
          <small>{{ t('Fair view for ranges with different lengths') }}</small>
        </span>
      </label>

      <div class="cbar__submit">
        <span
          v-if="rangesDiffer"
          class="cbar__warning"
        >
          <DesignIcon
            name="alert"
            :size="15"
          />
          {{ t('{a} vs {b} days', { a: daysA, b: daysB }) }}
        </span>
        <Button
          variant="primary"
          icon="chart"
          :loading="loading"
          :disabled="!valid"
          @click="emit('compare')"
        >
          {{ dirty ? t('Update comparison') : t('Compare periods') }}
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cbar {
  position: relative;
  z-index: 4;
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--primary) 18%, var(--border));
  border-radius: 24px;
  background: var(--surface);
  box-shadow: 0 18px 54px color-mix(in srgb, var(--text) 8%, transparent);
}

.cbar__head,
.cbar__footer {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 18px 20px;
}

.cbar__head {
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
}

.cbar__intro,
.cbar__period-head,
.cbar__average {
  display: flex;
  align-items: center;
}

.cbar__intro { gap: 11px; }
.cbar__symbol {
  display: grid;
  flex: 0 0 42px;
  inline-size: 42px;
  block-size: 42px;
  place-items: center;
  border-radius: 14px;
  color: var(--primary);
  background: var(--primary-weak);
}
.cbar__eyebrow,
.cbar__title { margin: 0; }
.cbar__eyebrow {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .13em;
  text-transform: uppercase;
}
.cbar__title { margin-top: 2px; font-size: 18px; line-height: 1.2; letter-spacing: -.025em; }
.cbar__quick { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cbar__quick button,
.cbar__segments button {
  min-block-size: 34px;
  border: 1px solid transparent;
  border-radius: 11px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  transition: color .16s ease, background-color .16s ease, border-color .16s ease, transform .16s ease;
}
.cbar__quick button { padding: 0 11px; background: var(--surface-2); }
.cbar__quick button:hover { color: var(--text); background: var(--primary-weak); }

.cbar__canvas {
  display: grid;
  grid-template-columns: minmax(230px, .9fr) minmax(220px, 1fr) 38px minmax(220px, 1fr);
  align-items: center;
  gap: 14px;
  padding: 20px;
}
.cbar__product { min-inline-size: 0; }
.cbar__period {
  min-inline-size: 0;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-2);
}
.cbar__period--a { box-shadow: inset 3px 0 0 var(--color-period-a); }
.cbar__period--b { box-shadow: inset 3px 0 0 var(--color-period-b); }
.cbar__period-head { gap: 9px; margin-bottom: 10px; }
.cbar__period-index {
  display: grid;
  inline-size: 28px;
  block-size: 28px;
  place-items: center;
  border-radius: 9px;
  color: var(--surface);
  background: var(--color-period-a);
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 800;
}
.cbar__period--b .cbar__period-index { background: var(--color-period-b); }
.cbar__period-head div { min-inline-size: 0; display: grid; }
.cbar__period-head strong { color: var(--text); font-size: 13px; }
.cbar__period-head span:last-child { color: var(--text-tertiary); font-size: 11px; }
.cbar__period :deep(.drp-trigger) { inline-size: 100%; min-block-size: 42px; background: var(--surface); }
.cbar__swap {
  display: grid;
  inline-size: 38px;
  block-size: 38px;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 50%;
  color: var(--text-secondary);
  background: var(--surface);
  box-shadow: var(--shadow-xs);
  cursor: pointer;
  transition: color .16s ease, border-color .16s ease, transform .25s ease;
}
.cbar__swap:hover { color: var(--primary); border-color: color-mix(in srgb, var(--primary) 34%, var(--border)); transform: rotate(180deg); }

.cbar__footer {
  align-items: flex-end;
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface-2) 72%, var(--surface));
  border-radius: 0 0 24px 24px;
}
.cbar__group { display: grid; gap: 6px; min-inline-size: 0; }
.cbar__group-label {
  color: var(--text-tertiary);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .11em;
  text-transform: uppercase;
}
.cbar__segments { display: inline-flex; max-inline-size: 100%; padding: 3px; border-radius: 13px; background: var(--surface-inset); }
.cbar__segments button { padding: 0 10px; white-space: nowrap; }
.cbar__segments button.is-active { color: var(--text); border-color: var(--border); background: var(--surface); box-shadow: var(--shadow-xs); }
.cbar__average { align-self: stretch; gap: 9px; padding-inline: 4px; }
.cbar__average > span { display: grid; }
.cbar__average strong { color: var(--text); font-size: 12px; }
.cbar__average small { color: var(--text-tertiary); font-size: 10px; }
.cbar__submit { display: grid; justify-items: end; gap: 6px; margin-inline-start: auto; }
.cbar__warning { display: inline-flex; align-items: center; gap: 5px; color: var(--warning); font-size: 11px; font-weight: 650; }

@media (max-width: 1180px) {
  .cbar__canvas { grid-template-columns: minmax(220px, 1fr) 38px minmax(220px, 1fr); }
  .cbar__product { grid-column: 1 / -1; }
  .cbar__group--granularity { margin-inline-start: auto; }
  .cbar__average { order: 4; }
}

@media (max-width: 760px) {
  .cbar { border-radius: 20px; }
  .cbar__head { align-items: flex-start; flex-direction: column; padding: 16px; }
  .cbar__quick { inline-size: 100%; overflow-x: auto; flex-wrap: nowrap; padding-bottom: 2px; }
  .cbar__quick button { flex: 0 0 auto; min-block-size: 40px; }
  .cbar__canvas { grid-template-columns: 1fr; padding: 16px; gap: 10px; }
  .cbar__product { grid-column: auto; }
  .cbar__swap { justify-self: center; transform: rotate(90deg); }
  .cbar__swap:hover { transform: rotate(270deg); }
  .cbar__footer { align-items: stretch; flex-direction: column; padding: 16px; border-radius: 0 0 20px 20px; }
  .cbar__group--granularity { margin-inline-start: 0; }
  .cbar__segments { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cbar__group--granularity .cbar__segments { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cbar__segments button { min-block-size: 42px; white-space: normal; }
  .cbar__average { min-block-size: 52px; }
  .cbar__submit { justify-items: stretch; margin-inline-start: 0; }
  .cbar__submit :deep(.btn) { inline-size: 100%; min-block-size: 46px; }
  .cbar__warning { justify-content: center; }
}

@media (prefers-reduced-motion: reduce) {
  .cbar__quick button,
  .cbar__segments button,
  .cbar__swap { transition: none; }
}
</style>
