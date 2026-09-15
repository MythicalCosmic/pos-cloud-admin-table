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
    <header class="cbar__head">
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
        <p>{{ t('Build your comparison') }}</p>
        <h2 id="comparison-studio-title">
          {{ t('Comparison studio') }}
        </h2>
      </div>
      <span
        class="cbar__state"
        :class="{ 'is-dirty': dirty }"
      >{{ dirty ? t('Update comparison') : t('Ready') }}</span>
    </header>

    <div class="cbar__body">
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

      <div
        class="cbar__quick"
        :aria-label="t('Quick comparisons')"
      >
        <button
          type="button"
          @click="emit('quickPreset', 'month')"
        >
          <span>01</span>{{ t('This month vs last month') }}
        </button>
        <button
          type="button"
          @click="emit('quickPreset', '30d')"
        >
          <span>02</span>{{ t('Last 30 days vs previous 30') }}
        </button>
        <button
          type="button"
          @click="emit('quickPreset', 'year')"
        >
          <span>03</span>{{ t('This period vs last year') }}
        </button>
      </div>

      <div class="cbar__divider" />

      <div class="cbar__period cbar__period--a">
        <div class="cbar__period-head">
          <span>A</span>
          <div>
            <strong>{{ t('Current period') }}</strong>
            <small>{{ t('{count} days', { count: daysA }) }}</small>
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
        <i />
        <DesignIcon
          name="exchange"
          :size="16"
        />
        <span>{{ t('Swap periods') }}</span>
        <i />
      </button>

      <div class="cbar__period cbar__period--b">
        <div class="cbar__period-head">
          <span>B</span>
          <div>
            <strong>{{ t('Baseline period') }}</strong>
            <small>{{ t('{count} days', { count: daysB }) }}</small>
          </div>
        </div>
        <DateRangePicker
          :model-value="bRange"
          align="left"
          :enable-time="false"
          :include-all="false"
          :aria-label="t('Baseline period date range')"
          @update:model-value="updateBaseline"
        />
      </div>

      <div class="cbar__divider" />

      <div class="cbar__setting">
        <span class="cbar__label">{{ t('Compare with') }}</span>
        <div class="cbar__segments cbar__segments--modes">
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

      <div class="cbar__setting">
        <span class="cbar__label">{{ t('Group by') }}</span>
        <div class="cbar__segments cbar__segments--granularity">
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
        <span>
          <strong>{{ t('Daily KPI averages') }}</strong>
          <small>{{ t('Fair view for ranges with different lengths') }}</small>
        </span>
        <Switch
          :model-value="avgMode"
          :aria-label="t('Daily KPI averages')"
          @update:model-value="emit('update:avgMode', $event)"
        />
      </label>

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
        class="cbar__apply"
        variant="primary"
        icon="chart"
        :loading="loading"
        :disabled="!valid"
        @click="emit('compare')"
      >
        {{ dirty ? t('Update comparison') : t('Compare periods') }}
      </Button>
    </div>
  </section>
</template>

<style scoped>
.cbar {
  overflow: visible;
  border: 1px solid color-mix(in srgb, var(--primary) 22%, var(--border));
  border-radius: 24px;
  background: var(--surface);
  box-shadow: 0 24px 64px color-mix(in srgb, var(--text) 11%, transparent), 0 2px 8px color-mix(in srgb, var(--text) 5%, transparent);
}

.cbar__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  padding: 18px;
  border-block-end: 1px solid var(--border);
}

.cbar__symbol {
  display: grid;
  inline-size: 42px;
  block-size: 42px;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: var(--primary);
  box-shadow: 0 8px 18px color-mix(in srgb, var(--primary) 28%, transparent);
}

.cbar__head p,
.cbar__head h2 { margin: 0; }
.cbar__head p { color: var(--primary); font-size: 9px; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
.cbar__head h2 { margin-block-start: 2px; font-size: 17px; font-weight: 680; letter-spacing: -.025em; }
.cbar__state { align-self: start; padding: 4px 7px; border-radius: 999px; color: var(--text-tertiary); background: var(--surface-2); font-size: 9px; font-weight: 700; }
.cbar__state.is-dirty { color: var(--warning-strong); background: var(--warning-weak); }

.cbar__body { display: grid; gap: 15px; padding: 18px; }
.cbar__product :deep(.search-select),
.cbar__product :deep(.search-select__trigger) { inline-size: 100%; }
.cbar__product :deep(.search-select__trigger) { min-block-size: 46px; border-radius: 13px; background: var(--surface-2); }

.cbar__quick { display: grid; gap: 6px; }
.cbar__quick button {
  display: grid;
  grid-template-columns: 25px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-block-size: 36px;
  padding: 5px 9px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  text-align: start;
  cursor: pointer;
  transition: border-color 160ms ease, color 160ms ease, background 160ms ease, transform 160ms ease;
}
.cbar__quick button span { display: grid; inline-size: 25px; block-size: 25px; place-items: center; border-radius: 8px; color: var(--primary); background: var(--primary-weak); font-family: var(--font-mono); font-size: 9px; }
.cbar__quick button:hover { border-color: var(--border); color: var(--primary); background: var(--surface-2); transform: translateX(2px); }
.cbar__divider { block-size: 1px; background: var(--border); }

.cbar__period { position: relative; display: grid; gap: 11px; padding: 13px; border: 1px solid var(--border); border-radius: 16px; background: var(--surface-2); }
.cbar__period::before { position: absolute; inline-size: 3px; border-radius: 3px; background: var(--color-period-a); content: ''; inset-block: 12px; inset-inline-start: -1px; }
.cbar__period--b::before { background: var(--color-period-b); }
.cbar__period-head { display: flex; align-items: center; gap: 9px; }
.cbar__period-head > span { display: grid; inline-size: 30px; block-size: 30px; place-items: center; border-radius: 10px; color: #fff; background: var(--color-period-a); font-family: var(--font-mono); font-size: 11px; font-weight: 800; }
.cbar__period--b .cbar__period-head > span { background: var(--color-period-b); }
.cbar__period-head > div { display: grid; }
.cbar__period-head strong { font-size: 12px; font-weight: 680; }
.cbar__period-head small { color: var(--text-tertiary); font-size: 10px; }
.cbar__period :deep(.drp),
.cbar__period :deep(.drp-trigger) { inline-size: 100%; }
.cbar__period :deep(.drp-trigger) { justify-content: flex-start; min-block-size: 42px; border-radius: 11px; background: var(--surface); }

.cbar__swap { display: grid; grid-template-columns: 1fr auto auto 1fr; align-items: center; gap: 7px; block-size: 28px; border: 0; color: var(--text-tertiary); background: transparent; font: inherit; font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
.cbar__swap i { block-size: 1px; background: var(--border); }
.cbar__swap svg { color: var(--primary); transition: transform 180ms ease; }
.cbar__swap:hover svg { transform: rotate(180deg); }

.cbar__setting { display: grid; gap: 7px; }
.cbar__label { color: var(--text-tertiary); font-size: 9px; font-weight: 780; letter-spacing: .11em; text-transform: uppercase; }
.cbar__segments { display: grid; gap: 4px; padding: 4px; border-radius: 13px; background: var(--surface-2); }
.cbar__segments--modes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cbar__segments--granularity { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.cbar__segments button { min-block-size: 34px; padding: 5px 7px; border: 1px solid transparent; border-radius: 9px; color: var(--text-secondary); background: transparent; font: inherit; font-size: 10px; font-weight: 620; line-height: 1.2; cursor: pointer; transition: border-color 160ms ease, color 160ms ease, background 160ms ease, box-shadow 160ms ease; }
.cbar__segments button.is-active { border-color: var(--border); color: var(--primary); background: var(--surface); box-shadow: var(--shadow-xs); }
.cbar__segments button:hover:not(.is-active) { color: var(--text); }

.cbar__average { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--border); border-radius: 13px; background: var(--surface-2); cursor: pointer; }
.cbar__average > span { display: grid; min-inline-size: 0; }
.cbar__average strong { font-size: 11px; font-weight: 680; }
.cbar__average small { color: var(--text-tertiary); font-size: 9px; line-height: 1.4; }
.cbar__warning { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 10px; color: var(--warning-strong); background: var(--warning-weak); font-size: 10px; }
.cbar__apply { inline-size: 100%; min-block-size: 48px; border-radius: 14px; }

.cbar button:focus-visible { outline: 3px solid color-mix(in srgb, var(--primary) 32%, transparent); outline-offset: 2px; }

@media (max-width: 1120px) and (min-width: 701px) {
  .cbar__body { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cbar__product,
  .cbar__quick,
  .cbar__divider:first-of-type,
  .cbar__apply { grid-column: 1 / -1; }
  .cbar__quick { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .cbar__quick button { grid-template-columns: auto minmax(0, 1fr); }
  .cbar__swap { grid-column: 1 / -1; }
}

@media (max-width: 700px) {
  .cbar { border-radius: 20px; }
  .cbar__head,
  .cbar__body { padding: 15px; }
  .cbar__quick button { min-block-size: 42px; }
  .cbar__segments button { min-block-size: 42px; }
  .cbar__apply { min-block-size: 50px; }
}

@media (prefers-reduced-motion: reduce) {
  .cbar__quick button,
  .cbar__swap svg,
  .cbar__segments button { transition: none; }
}
</style>
