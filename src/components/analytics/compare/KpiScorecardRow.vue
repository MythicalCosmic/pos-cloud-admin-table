<script setup lang="ts">
/* Grid of KPI scorecards. Renders only the metrics the payload carries
   (gross_profit / margin appear only when COGS data exists). */
import KpiScorecard from './KpiScorecard.vue'
import type { KpiCell, KpiKey } from '@/types/comparison'

const { t } = useI18n({ useScope: 'global' })

interface Props {
  kpis: Partial<Record<KpiKey, KpiCell>>
  daysA: number
  daysB: number
  avgMode?: boolean
  revenueSpark?: number[] // Period A daily revenue for the money-metric sparkline
}
const props = withDefaults(defineProps<Props>(), { avgMode: false })

interface CatItem { key: KpiKey, labelKey: string, money: boolean, unit?: string, formulaKey: string, spark?: boolean }
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

const cards = computed(() =>
  CATALOG.filter(c => props.kpis[c.key] !== undefined)
    .map(c => ({ ...c, cell: props.kpis[c.key]! })),
)
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
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: var(--sp-3);
}
@media (max-width: 900px) { .kpirow { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 520px) { .kpirow { grid-template-columns: 1fr; } }
</style>
