<script setup lang="ts">
import type { DataTableColumn } from '@/components/design/DataTable.vue'

/* Paid purchases for one supplier: supplier-purchase expenses linked to it
   (paid from the Safe, the Bank or a till), filterable by date. */
import Badge from '@/components/design/Badge.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DateRangePicker from '@/components/design/DateRangePicker.vue'
import StateFill from '@/components/design/StateFill.vue'
import { fmtDate, fmtNum } from '@/components/design/utils/format'
import { stockApi } from '@/plugins/axios'

const props = defineProps<{ supplierId: string }>()

const { t } = useI18n({ useScope: 'global' })

const rows = ref<any[]>([])
const totals = ref<{ count: number; amount_uzs: number; paid_uzs: number; by_source: Record<string, { count: number; amount_uzs: number }> } | null>(null)
const loading = ref(false)
const failed = ref(false)
const page = ref(1)
const perPage = ref(20)
const range = ref<{ from: string; to: string }>({ from: '', to: '' })
let requestId = 0

const SOURCE_ORDER = ['SAFE', 'BANK', 'DRAWER']

const columns = computed<DataTableColumn[]>(() => [
  { key: 'date', label: t('Date'), width: 120 },
  { key: 'description', label: t('Description') },
  { key: 'category', label: t('Category'), width: 200 },
  { key: 'source_account', label: t('supplier_purchases_paid_from'), width: 130 },
  { key: 'amount_uzs', label: t('Amount'), align: 'right', width: 140 },
  { key: 'status', label: t('Status'), width: 120 },
])

const sourceTotals = computed(() => {
  const bySource = totals.value?.by_source ?? {}

  return SOURCE_ORDER
    .filter(source => bySource[source])
    .map(source => ({ source, ...bySource[source] }))
})

async function load() {
  const current = ++requestId

  loading.value = true
  failed.value = false
  try {
    const res = await stockApi.get(`/suppliers/${props.supplierId}/purchases/`, {
      params: {
        page: page.value,
        per_page: perPage.value,
        ...((range.value.from && range.value.to) ? { date_from: range.value.from, date_to: range.value.to } : {}),
      },
    })

    if (current !== requestId)
      return
    const d = res.data?.data ?? res.data

    rows.value = d?.purchases ?? []
    totals.value = d?.totals ?? null
  }
  catch {
    if (current === requestId) {
      rows.value = []
      totals.value = null
      failed.value = true
    }
  }
  finally {
    if (current === requestId)
      loading.value = false
  }
}

const pagination = computed(() => ({
  page: page.value,
  perPage: perPage.value,
  total: totals.value?.count ?? 0,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { perPage.value = n; page.value = 1 },
}))

watch(() => props.supplierId, () => { page.value = 1; load() }, { immediate: true })
watch([page, perPage], load)
watch(range, () => {
  if (page.value !== 1)
    page.value = 1
  else
    load()
}, { deep: true })
</script>

<template>
  <Card class="supplier-purchases">
    <div class="supplier-purchases__head">
      <div>
        <h3 class="supplier-purchases__title">
          {{ t('supplier_purchases_title') }}
        </h3>
        <p class="supplier-purchases__sub">
          {{ t('supplier_purchases_sub') }}
        </p>
      </div>
      <div class="supplier-purchases__range">
        <DateRangePicker
          v-model="range"
          :enable-time="false"
          :placeholder="t('All time')"
          :aria-label="t('expense_filter_dates')"
        />
      </div>
    </div>

    <dl
      v-if="totals"
      class="supplier-purchases__totals"
    >
      <div>
        <dt>{{ t('supplier_purchases_total') }}</dt>
        <dd>{{ fmtNum(totals.amount_uzs) }}</dd>
      </div>
      <div>
        <dt>{{ t('supplier_purchases_count') }}</dt>
        <dd>{{ fmtNum(totals.count) }}</dd>
      </div>
      <div
        v-for="item in sourceTotals"
        :key="item.source"
      >
        <dt>{{ t(`supplier_purchases_source_${item.source}`) }}</dt>
        <dd>{{ fmtNum(item.amount_uzs) }}</dd>
      </div>
    </dl>

    <div class="card__divider" />
    <StateFill
      v-if="failed"
      icon="alert"
      :title="t('supplier_purchases_failed')"
    />
    <DataTable
      v-else
      :columns="columns"
      :rows="rows"
      row-key="expense_id"
      :loading="loading"
      :pagination="pagination"
      :empty-title="t('supplier_purchases_empty')"
      empty-icon="receipt"
    >
      <template #cell.date="{ row }">
        <span class="nowrap">{{ fmtDate(row.date) }}</span>
      </template>
      <template #cell.description="{ row }">
        <span>{{ row.description || '—' }}</span>
      </template>
      <template #cell.category="{ row }">
        <span class="cell-muted">{{ row.category || '—' }}</span>
      </template>
      <template #cell.source_account="{ row }">
        <span class="cell-muted">{{ row.source_account ? t(`supplier_purchases_source_${row.source_account}`) : '—' }}</span>
      </template>
      <template #cell.amount_uzs="{ row }">
        <span class="mono cell-strong">{{ fmtNum(row.amount_uzs) }}</span>
      </template>
      <template #cell.status="{ row }">
        <Badge :tone="row.status === 'PAID' ? 'success' : 'warning'">
          {{ t(`expense_status_${row.status}`) }}
        </Badge>
      </template>
    </DataTable>
  </Card>
</template>

<style scoped>
.supplier-purchases__head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 12px; }
.supplier-purchases__title { margin: 0; font-size: 15px; font-weight: 600; }
.supplier-purchases__sub { margin: 2px 0 0; color: var(--text-secondary); font-size: 13px; }
.supplier-purchases__range { display: flex; justify-content: flex-end; min-width: 240px; }
.supplier-purchases__totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 0; padding: 0 18px 16px; }
.supplier-purchases__totals > div { min-width: 0; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); }
.supplier-purchases__totals dt { color: var(--text-secondary); font-size: 12px; }
.supplier-purchases__totals dd { margin: 2px 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
@media (max-width: 560px) {
  .supplier-purchases__head { padding: 14px 14px 10px; }
  .supplier-purchases__totals { padding: 0 14px 14px; }
  .supplier-purchases__range { min-width: 0; width: 100%; }
}
</style>
