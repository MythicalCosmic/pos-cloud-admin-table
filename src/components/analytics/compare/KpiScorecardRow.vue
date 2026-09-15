<script setup lang="ts">
import KpiScorecard from './KpiScorecard.vue'
import type { KpiCell, KpiKey } from '@/types/comparison'

interface Props {
  kpis: Partial<Record<KpiKey, KpiCell>>
  daysA: number
  daysB: number
  avgMode?: boolean
  revenueSpark?: number[] // Period A daily revenue for the money-metric sparkline
}

const props = withDefaults(defineProps<Props>(), { avgMode: false })
const { t } = useI18n({ useScope: 'global' })

interface CatItem {
  key: KpiKey
  labelKey: string
  money: boolean
  unit?: string
  formulaKey: string
  spark?: boolean
}

// Renders only metrics present in the payload. Profit and margin remain absent
// when the backend has no authoritative cost basis.
const CATALOG: CatItem[] = [
  { key: 'gross_revenue', labelKey: 'Gross revenue', money: true, unit: 'UZS', formulaKey: 'formula_gross_revenue', spark: true },
  { key: 'net_revenue', labelKey: 'Net revenue', money: true, unit: 'UZS', formulaKey: 'formula_net_revenue', spark: true },
  { key: 'orders', labelKey: 'Orders', money: false, formulaKey: 'formula_orders' },
  { key: 'items_sold', labelKey: 'Items sold', money: false, formulaKey: 'formula_items_sold' },
  { key: 'aov', labelKey: 'Average order value', money: true, unit: 'UZS', formulaKey: 'formula_aov' },
  { key: 'avg_items_per_order', labelKey: 'Avg items / order', money: false, formulaKey: 'formula_avg_items' },
  { key: 'discounts', labelKey: 'Discounts', money: true, unit: 'UZS', formulaKey: 'formula_discounts' },
  { key: 'refunds', labelKey: 'Refunds', money: true, unit: 'UZS', formulaKey: 'formula_refunds' },
  { key: 'gross_profit', labelKey: 'Gross profit', money: true, unit: 'UZS', formulaKey: 'formula_gross_profit' },
  { key: 'margin_pct', labelKey: 'Gross margin', money: false, unit: '%', formulaKey: 'formula_margin' },
]

const cards = computed(() => CATALOG.flatMap(catalogItem => {
  const cell = props.kpis[catalogItem.key]

  return cell === undefined ? [] : [{ ...catalogItem, cell }]
}))
</script>

<template>
  <div class="kpirow">
    <KpiScorecard
      v-for="c in cards"
      :key="c.key"
      :label="t(c.labelKey)"
      :formula="t(c.formulaKey)"
      :cell="c.cell"
      :money="c.money"
      :unit="c.unit"
      :spark="c.spark ? revenueSpark : undefined"
      :avg-mode="avgMode"
      :days-a="daysA"
      :days-b="daysB"
    />
  </div>
</template>

<style scoped>
.kpirow {
  display: grid;
  overflow: hidden;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  padding: 1px;
  border-radius: 22px;
  background: var(--border);
  box-shadow: 0 18px 48px color-mix(in srgb, var(--text) 7%, transparent);
}
@media (max-width: 1380px) { .kpirow { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .kpirow { grid-template-columns: minmax(0, 1fr); border-radius: 18px; } }
</style>
