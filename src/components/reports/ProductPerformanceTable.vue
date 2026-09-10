<script setup lang="ts">
import { h } from 'vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import Badge from '@/components/design/Badge.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import { fmtMoney, fmtNum, fmtPct } from '@/components/design/utils/format'
import type { ProductPerformanceReport, ProductPerformanceRow } from '@/types/productPerformance'

const props = defineProps<{ report: ProductPerformanceReport; loading?: boolean }>()
const emit = defineEmits<{ (event: 'page', page: number): void; (event: 'perPage', count: number): void; (event: 'product', row: ProductPerformanceRow): void; (event: 'clear'): void }>()
const { t, te } = useI18n({ useScope: 'global' })
const money = (value: string | null | undefined) => fmtMoney(value, { exact: true })
const pct = (value: string | null | undefined) => value == null ? '—' : fmtPct(Number(value), 2)
const figure = (value: string) => h('span', { class: 'report-figure' }, value)
const financial = (key: keyof ProductPerformanceRow, label: string): DataTableColumn<ProductPerformanceRow> => ({ key, label: t(label), align: 'right', cellClass: 'report-number', render: row => figure(money(row[key] as string | null)) })

const columns = computed<DataTableColumn<ProductPerformanceRow>[]>(() => [
  { key: 'product_name', label: t('Product'), width: '220px' },
  { key: 'category_name', label: t('Category'), width: '150px' },
  { key: 'units_sold', label: t('Units sold'), align: 'right', cellClass: 'report-number', render: row => figure(fmtNum(row.units_sold)) },
  financial('selling_price_per_unit', 'report_avg_price'),
  financial('total_revenue', 'Revenue'),
  financial('ingredient_cost_per_unit', 'report_cost_unit'),
  financial('total_ingredient_cost', 'report_ingredient_cost'),
  financial('gross_profit_per_item', 'report_profit_item'),
  financial('gross_profit', 'report_gross_profit'),
  { key: 'gross_profit_margin_pct', label: t('Margin'), align: 'right', cellClass: 'report-number', render: row => figure(pct(row.gross_profit_margin_pct)) },
  { key: 'cost_complete', label: t('report_cost_status') },
])

const pagination = computed(() => ({ page: props.report.pagination.page, perPage: props.report.pagination.per_page, total: props.report.pagination.total }))
function costSource(row: ProductPerformanceRow) {
  const key = `report_source_${row.cost_source}`
  return te(key) ? t(key) : (row.cost_source || '—')
}
function details(row: ProductPerformanceRow) {
  return [
    { label: t('Net units sold'), value: fmtNum(row.net_units) },
    { label: t('report_refunded_units'), value: fmtNum(row.units_refunded) },
    { label: t('Gross sales'), value: money(row.gross_sales_revenue) },
    { label: t('Refunds'), value: money(row.refund_amount) },
    { label: t('report_cost_credit'), value: money(row.ingredient_cost_credit) },
    { label: t('report_cost_coverage'), value: pct(row.cost_coverage_pct) },
    { label: t('report_cost_source'), value: costSource(row) },
    { label: t('report_current_price'), value: money(row.current_catalog_price) },
    { label: t('report_realized_price'), value: `${money(row.minimum_selling_price)} – ${money(row.maximum_selling_price)}` },
    { label: t('Orders'), value: fmtNum(row.orders_sold) },
  ]
}
</script>

<template>
  <DataTable
    class="product-report-table"
    :columns="columns"
    :rows="report.products"
    row-key="product_id"
    :pagination="pagination"
    :per-page-options="[25, 50, 100, 250, 500]"
    :loading="loading"
    expandable
    mobile-cards
    :mobile-summary="['category_name', 'units_sold', 'total_revenue', 'gross_profit', 'cost_complete']"
    @page="emit('page', $event)"
    @per-page="emit('perPage', $event)"
  >
    <template #cell.product_name="{ row }">
      <button
        type="button"
        class="report-product-link"
        :aria-label="t('report_focus_product', { name: row.product_name })"
        @click="emit('product', row)"
      >
        <span class="report-product-rank">{{ fmtNum(row.rank) }}</span><span>{{ row.product_name }}</span><DesignIcon
          name="filter"
          :size="13"
        />
      </button>
    </template>
    <template #cell.cost_complete="{ row }">
      <Badge
        :tone="row.cost_complete ? 'success' : 'warning'"
        :title="costSource(row)"
      >
        {{ t(row.cost_complete ? 'report_cost_verified' : 'report_cost_missing') }}
      </Badge>
    </template>
    <template #expanded="{ row }">
      <dl class="report-row-details">
        <div
          v-for="detail in details(row)"
          :key="detail.label"
        >
          <dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd>
        </div>
      </dl>
      <p class="report-detail-note">
        {{ t('report_catalog_reference') }}
      </p>
    </template>
    <template #empty>
      <ReportState
        icon="box"
        :title="t('report_empty')"
        :description="t('report_empty_body')"
        :action="t('Clear filters')"
        @action="emit('clear')"
      />
    </template>
  </DataTable>
</template>

<style scoped>
.product-report-table :deep(.dtable) { min-width: 1660px; }
.product-report-table :deep(.dtable th) { white-space: normal; line-height: 1.45; font-size: 11px; }
.product-report-table :deep(.dtable > thead > tr > th:nth-child(2)), .product-report-table :deep(.dtable > tbody > tr:not(.expanded-row) > td:nth-child(2)) { position: sticky; left: 0; z-index: 2; min-width: 220px; width: 220px; max-width: 220px; background: var(--surface); }
.product-report-table :deep(.dtable > thead > tr > th:nth-child(3)), .product-report-table :deep(.dtable > tbody > tr:not(.expanded-row) > td:nth-child(3)) { position: sticky; left: 220px; z-index: 2; min-width: 150px; width: 150px; max-width: 150px; background: var(--surface); box-shadow: 1px 0 0 var(--border); overflow-wrap: anywhere; }
.product-report-table :deep(.dtable > thead > tr > th:nth-child(2)), .product-report-table :deep(.dtable > thead > tr > th:nth-child(3)) { background: var(--surface-2); }
.product-report-table :deep(.report-number) { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 12px; white-space: nowrap; }
.product-report-table :deep(.report-figure) { display: block; text-align: right; font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: var(--text); }
.product-report-table :deep(.data-table__empty) { padding: 4px 20px; }
.report-product-link { width: 100%; display: flex; align-items: center; gap: 9px; text-align: left; min-height: 38px; font-size: 12px; font-weight: 500; color: var(--text); }
.report-product-link > span:nth-child(2) { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.report-product-rank { color: var(--text-secondary); font: 10px var(--font-mono); }
.report-product-link > svg { flex-shrink: 0; color: var(--text-secondary); }
.report-product-link:hover { color: var(--primary); }
.report-product-link:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; border-radius: 4px; }
.report-row-details { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px; margin: 0; }
.report-row-details dt { font-size: 11px; color: var(--text-secondary); margin-bottom: 5px; }
.report-row-details dd { margin: 0; font: 12px var(--font-mono); overflow-wrap: anywhere; }
.report-detail-note { margin: 14px 0 0; font-size: 11px; color: var(--text-secondary); }
@media (max-width: 700px) { .report-row-details { grid-template-columns: repeat(2, minmax(0, 1fr)); } .report-product-link { min-height: 44px; font-size: 13px; } .product-report-table :deep(.mobile-records) { padding: 10px; } }
</style>
