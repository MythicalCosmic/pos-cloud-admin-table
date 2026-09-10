<script setup lang="ts">
/* Biggest gainers + losers. Ranks client-side from the full movers list so the
   Absolute / Percent toggle actually re-orders (a small item doubling vs a big
   item growing 10%). */
import ChartCard from '@/components/design/ChartCard.vue'
import DeltaBadge from './DeltaBadge.vue'
import { abbrUZS } from '@/composables/useCurrency'
import type { MoverRow } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })

interface Props { movers: MoverRow[], count?: number }
const props = withDefaults(defineProps<Props>(), { count: 6 })

const rankBy = ref<'abs' | 'pct'>('abs')

function key(m: MoverRow): number {
  if (rankBy.value === 'abs') return m.delta
  // null pct (New) sorts as very large gain
  return m.delta_pct === null ? Number.POSITIVE_INFINITY : m.delta_pct
}
const sorted = computed(() => [...props.movers].sort((a, b) => key(b) - key(a)))
const gainers = computed(() => sorted.value.filter(m => m.delta > 0).slice(0, props.count))
const losers = computed(() => [...sorted.value].filter(m => m.delta < 0).reverse().slice(0, props.count))
const maxAbs = computed(() => Math.max(1, ...props.movers.map(m => Math.abs(m.delta))))

function barPct(m: MoverRow) { return `${Math.round((Math.abs(m.delta) / maxAbs.value) * 100)}%` }
</script>

<template>
  <ChartCard :eyebrow="t('Top movers')" :title="t('Biggest gainers & losers')">
    <template #actions>
      <div class="seg">
        <button type="button" class="seg__btn" :class="{ 'is-active': rankBy === 'abs' }" @click="rankBy = 'abs'">{{ t('Absolute') }}</button>
        <button type="button" class="seg__btn" :class="{ 'is-active': rankBy === 'pct' }" @click="rankBy = 'pct'">%</button>
      </div>
    </template>
    <div class="movers">
      <div class="movers__col">
        <div class="movers__h up">{{ t('Gainers') }}</div>
        <div v-for="m in gainers" :key="m.name" class="mrow">
          <div class="mrow__top">
            <span class="mrow__name">{{ m.name }}</span>
            <DeltaBadge :delta-pct="m.delta_pct" :is-up-good="true" size="sm" />
          </div>
          <div class="mrow__bar"><span class="mrow__fill up" :style="{ width: barPct(m) }" /></div>
          <div class="mrow__val">+{{ abbrUZS(m.delta) }}</div>
        </div>
        <div v-if="!gainers.length" class="movers__empty">{{ t('No gainers') }}</div>
      </div>
      <div class="movers__col">
        <div class="movers__h down">{{ t('Losers') }}</div>
        <div v-for="m in losers" :key="m.name" class="mrow">
          <div class="mrow__top">
            <span class="mrow__name">{{ m.name }}</span>
            <DeltaBadge :delta-pct="m.delta_pct" :is-up-good="true" size="sm" />
          </div>
          <div class="mrow__bar"><span class="mrow__fill down" :style="{ width: barPct(m) }" /></div>
          <div class="mrow__val down">−{{ abbrUZS(Math.abs(m.delta)) }}</div>
        </div>
        <div v-if="!losers.length" class="movers__empty">{{ t('No losers') }}</div>
      </div>
    </div>
  </ChartCard>
</template>

<style scoped>
.movers { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-4); }
.movers__h { font-size: var(--fs-label); text-transform: uppercase; letter-spacing: var(--tracking-label); font-weight: 700; margin-bottom: 8px; }
.movers__h.up { color: var(--color-positive); }
.movers__h.down { color: var(--color-negative); }
.movers__empty { font-size: 13px; color: var(--text-tertiary); padding: 8px 0; }
.mrow { padding: 7px 0; border-bottom: 1px solid var(--border-soft, var(--border)); }
.mrow__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mrow__name { font-size: 13px; font-weight: 500; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mrow__bar { height: 5px; border-radius: 99px; background: var(--surface-2); margin: 5px 0 3px; overflow: hidden; }
.mrow__fill { display: block; height: 100%; border-radius: 99px; }
.mrow__fill.up { background: var(--color-positive); }
.mrow__fill.down { background: var(--color-negative); }
.mrow__val { font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.mrow__val.down { color: var(--color-negative); }
.seg { display: inline-flex; background: var(--surface-2); border-radius: var(--r-sm); padding: 2px; gap: 2px; }
.seg__btn { border: 0; background: transparent; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 500; color: var(--text-secondary); padding: 4px 10px; border-radius: calc(var(--r-sm) - 2px); }
.seg__btn.is-active { background: var(--surface); color: var(--text); box-shadow: var(--shadow-xs); font-weight: 600; }
@media (max-width: 640px) { .movers { grid-template-columns: 1fr; } }
</style>
