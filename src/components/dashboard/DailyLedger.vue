<script setup lang="ts">
import ReportState from './ReportState.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { fmtNum } from '@/components/design/utils/format'
import { useFormatters } from '@/composables/useFormatters'

const props = defineProps<{
  dates: string[]
  revenue: number[]
  expenses: number[]
  channels: Array<{ label: string; values: { hall: number; delivery: number; pickup: number } }>
}>()

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()

const rows = computed(() => props.dates.map((date, index) => {
  const channel = props.channels.find(row => row.label === date)?.values
  return { id: `${date}-${index}`, date, revenue: props.revenue[index] ?? null, expenses: props.expenses[index] ?? null, hall: channel?.hall ?? null, delivery: channel?.delivery ?? null, pickup: channel?.pickup ?? null }
}))

const maxRevenue = computed(() => Math.max(1, ...rows.value.map(row => Math.abs(Number(row.revenue) || 0))))

type LedgerRow = typeof rows.value[number]

const columns = computed<DataTableColumn<LedgerRow>[]>(() => [
  { key: 'date', label: t('Date'), sortable: true, cellClass: 'cell-strong', width: '17%' },
  ...(['revenue', 'expenses', 'hall', 'delivery', 'pickup'] as const).map(key => ({
    key,
    label: `${t({ revenue: 'Revenue', expenses: 'Expenses', hall: 'Hall', delivery: 'Delivery', pickup: 'Pickup' }[key])}${['revenue', 'expenses'].includes(key) ? ' · UZS' : ''}`,
    sortable: true,
    align: 'right' as const,
    cellClass: 'mono',
    width: key === 'revenue' ? '26%' : undefined,
    render: (row: LedgerRow) => {
      const value = row[key]
      return value === null ? '—' : ['revenue', 'expenses'].includes(key) ? formatCurrency(value) : fmtNum(value)
    },
  })),
])
</script>

<template>
  <Card class="daily-ledger">
    <div class="card__head">
      <div class="card__head-text">
        <h3 class="card__title">
          {{ t('dash_daily_ledger') }}
        </h3><p class="daily-ledger__hint">
          {{ t('dash_ledger_hint') }}
        </p>
      </div>
    </div>
    <DataTable
      :columns="columns"
      :rows="rows"
      :per-page="7"
      mobile-cards
      mobile-title-key="date"
      :mobile-summary="['revenue', 'expenses']"
      :per-page-options="[7, 14, 30]"
    >
      <template #cell.revenue="{ row }">
        <span class="daily-ledger__revenue">
          <span>{{ row.revenue === null ? '—' : formatCurrency(row.revenue) }}</span>
          <i
            v-if="row.revenue !== null"
            aria-hidden="true"
          ><b :style="{ width: `${Math.abs(Number(row.revenue)) / maxRevenue * 100}%` }" /></i>
        </span>
      </template>
      <template #empty>
        <ReportState
          :title="t('No data for this range')"
          :description="t('Try a different date range.')"
        />
      </template>
    </DataTable>
  </Card>
</template>

<style scoped>
.daily-ledger { min-width: 0; }
.daily-ledger__revenue { display: grid; justify-items: end; gap: 6px; }
.daily-ledger__revenue i { width: 100%; max-width: 140px; height: 3px; background: var(--chart-track); border-radius: 3px; overflow: hidden; }
.daily-ledger__revenue b { display: block; height: 100%; background: var(--primary); border-radius: inherit; }
.daily-ledger :deep(.dtable td) { padding-block: 11px; }
.daily-ledger :deep(.dtable th:first-child), .daily-ledger :deep(.dtable td:first-child) { position: sticky; left: 0; background: var(--surface); }
.daily-ledger__hint { margin: 5px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
.daily-ledger :deep(.dtable) { min-width: 630px; }
.daily-ledger :deep(.tablewrap) { overscroll-behavior-inline: contain; }
.daily-ledger :deep(.dtable tbody tr:nth-child(even)) { background: color-mix(in srgb, var(--surface-2) 50%, transparent); }
.daily-ledger :deep(.dtable tbody tr:hover) { background: var(--primary-weak); }
</style>
