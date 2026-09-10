<script setup lang="ts">
import ReportState from './ReportState.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { fmtNum } from '@/components/design/utils/format'
import { useFormatters } from '@/composables/useFormatters'
import { orderChannelColors } from '@/components/design/charts/orderChannelColors'

const props = defineProps<{
  dates: string[]
  revenue: number[]
  expenses: number[]
  channels: Array<{ label: string; values: { hall: number; delivery: number; pickup: number } }>
}>()

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const channelColors = orderChannelColors()

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
      <template #cell.date="{ row }">
        <span class="daily-ledger__date"><span aria-hidden="true">{{ String(row.date).slice(-2) }}</span><strong>{{ row.date }}</strong></span>
      </template>
      <template #cell.revenue="{ row }">
        <span class="daily-ledger__revenue">
          <span>{{ row.revenue === null ? '—' : formatCurrency(row.revenue) }}</span>
          <i
            v-if="row.revenue !== null"
            aria-hidden="true"
          ><b :style="{ width: `${Math.abs(Number(row.revenue)) / maxRevenue * 100}%` }" /></i>
        </span>
      </template>
      <template
        v-for="key in (['hall', 'delivery', 'pickup'] as const)"
        :key="key"
        #[`cell.${key}`]="{ row }"
      >
        <span class="daily-ledger__channel"><i :style="{ background: channelColors[key] }" />{{ row[key] === null ? '—' : fmtNum(row[key]) }}</span>
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
.daily-ledger__date { display: inline-flex; align-items: center; gap: 10px; white-space: nowrap; }
.daily-ledger__date > span { display: grid; place-items: center; width: 32px; height: 34px; border-radius: 9px; background: var(--primary-weak); color: var(--primary); font: 600 16px var(--font-sans); }
.daily-ledger__date > strong { font: 500 12px var(--font-sans); }
.daily-ledger__revenue { position: relative; display: grid; justify-items: end; padding: 8px 10px; isolation: isolate; }
.daily-ledger__revenue i { position: absolute; z-index: -1; inset: 0; border-radius: 6px; overflow: hidden; }
.daily-ledger__revenue b { display: block; height: 100%; background: linear-gradient(90deg, color-mix(in srgb, var(--c4) 9%, transparent), color-mix(in srgb, var(--primary) 24%, transparent)); border-radius: inherit; }
.daily-ledger__channel { display: inline-flex; gap: 8px; align-items: center; }
.daily-ledger__channel i { width: 5px; height: 5px; border-radius: 2px; }
.daily-ledger :deep(.dtable td) { padding-block: 11px; }
.daily-ledger :deep(.dtable th:first-child), .daily-ledger :deep(.dtable td:first-child) { position: sticky; left: 0; background: var(--surface); }
.daily-ledger__hint { margin: 5px 0 0; font-size: 12px; line-height: 1.5; color: var(--text-secondary); }
.daily-ledger :deep(.dtable) { min-width: 630px; }
.daily-ledger :deep(.tablewrap) { overscroll-behavior-inline: contain; }
.daily-ledger :deep(.dtable tbody tr:nth-child(even)) { background: color-mix(in srgb, var(--surface-2) 50%, transparent); }
.daily-ledger :deep(.dtable tbody tr:hover) { background: var(--primary-weak); }
</style>
