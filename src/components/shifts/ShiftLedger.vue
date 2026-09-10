<script setup lang="ts">
import ShiftCard from './ShiftCard.vue'
import DataTable from '@/components/design/DataTable.vue'
import Button from '@/components/design/Button.vue'
import Badge from '@/components/design/Badge.vue'
import { useShiftPresentation } from '@/composables/useShiftPresentation'
import { fmtMoney, fmtNum } from '@/components/design/utils/format'

defineProps<{ shifts: Record<string, any>[] }>()
defineEmits<{ (e: 'receive' | 'report' | 'end', shift: Record<string, any>): void }>()

const { t } = useI18n({ useScope: 'global' })
const { fullName, shiftState, fmtDateTime, expectedSettlement, confirmedSettlement, reportedCash, netOf } = useShiftPresentation()

const columns = computed(() => [
  { key: 'cashier', label: t('Cashier') },
  { key: 'status', label: t('Status') },
  { key: 'start_time', label: t('Started at') },
  { key: 'orders', label: t('Orders'), align: 'right' as const },
  { key: 'net', label: `${t('Net')} · UZS`, align: 'right' as const },
  { key: 'settlement', label: `${t('Settlement')} · UZS`, align: 'right' as const },
])

function settlement(shift: Record<string, any>) {
  const state = shiftState(shift)
  if (state === 'closed')
    return null
  return state === 'reconciled' ? (confirmedSettlement(shift) ?? reportedCash(shift)) : expectedSettlement(shift)
}
</script>

<template>
  <div class="shift-ledger card">
    <DataTable
      :rows="shifts"
      :columns="columns"
      :per-page="20"
      :per-page-options="[20, 50, 100]"
      expandable
      mobile-cards
      :mobile-summary="['status', 'orders', 'net', 'settlement']"
    >
      <template #cell.cashier="{ row }">
        <div class="shift-ledger__cashier">
          <strong>{{ fullName(row.user) }}</strong><small>{{ t('Shift') }} #{{ row.id }}</small>
        </div>
      </template>
      <template #cell.status="{ row }">
        <Badge
          :tone="shiftState(row) === 'active' ? 'success' : shiftState(row) === 'awaiting' ? 'warning' : 'neutral'"
          dot
        >
          {{ t(shiftState(row) === 'awaiting' ? 'shift_status_AWAITING_CASH' : `shift_status_${row.status === 'OPEN' ? 'ACTIVE' : row.status}`) }}
        </Badge>
      </template>
      <template #cell.start_time="{ row }">
        <span class="shift-ledger__time">{{ fmtDateTime(row.start_time) }}</span>
      </template>
      <template #cell.orders="{ row }">
        <span class="mono">{{ fmtNum(row.total_orders) }}</span>
      </template>
      <template #cell.net="{ row }">
        <span class="mono">{{ fmtMoney(netOf(row)) }}</span>
      </template>
      <template #cell.settlement="{ row }">
        <strong class="mono">{{ settlement(row) === null ? t('Settlement unavailable') : fmtMoney(settlement(row)) }}</strong>
      </template>
      <template #row-actions="{ row }">
        <Button
          v-if="shiftState(row) === 'awaiting'"
          size="sm"
          @click="$emit('receive', row)"
        >
          {{ t('Receive money') }}
        </Button>
        <Button
          v-if="shiftState(row) === 'active'"
          variant="ghost"
          size="sm"
          @click="$emit('end', row)"
        >
          {{ t('End shift') }}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          @click="$emit('report', row)"
        >
          {{ t(shiftState(row) === 'active' ? 'Live report' : 'Report') }}
        </Button>
      </template>
      <template #expanded="{ row }">
        <ShiftCard
          :shift="row"
          @receive="$emit('receive', row)"
          @report="$emit('report', row)"
          @end="$emit('end', row)"
        />
      </template>
    </DataTable>
  </div>
</template>

<style scoped>
.shift-ledger { min-width: 0; overflow: hidden; }
.shift-ledger__cashier { display: grid; gap: 4px; min-width: 100px; }
.shift-ledger__cashier strong { font-size: 13px; }
.shift-ledger__cashier small, .shift-ledger__time { color: var(--text-secondary); font-size: 11px; }
.shift-ledger :deep(.row-actions) { flex-wrap: wrap; }
.shift-ledger :deep(.expand-inner) { padding: 12px; }
.shift-ledger :deep(.dtable tbody td) { padding-block: 10px; }
.shift-ledger :deep(.mobile-record__actions) { flex-wrap: wrap; }
</style>
