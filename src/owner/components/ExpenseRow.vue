<script setup lang="ts">
import DesignIcon from '@/components/design/DesignIcon.vue'
import { fmtDate, fmtNum } from '@/components/design/utils/format'
import type { ExpenseRecord } from '@/types/expenseControl'

defineProps<{ expense: ExpenseRecord }>()

const { t } = useI18n({ useScope: 'global' })
</script>

<template>
  <RouterLink
    :to="`/approvals/${expense.id}`"
    class="owner-row"
  >
    <div class="owner-row__main">
      <span class="owner-row__title">{{ expense.description || expense.category?.name || t('owner_app_expense') }}</span>
      <span class="owner-row__sub">
        {{ fmtDate(expense.expense_date) }} · {{ expense.category?.name || '—' }}
        <template v-if="expense.requested_source"> · {{ t(`supplier_source_${expense.requested_source}`) }}</template>
      </span>
    </div>
    <span class="owner-row__amount">{{ fmtNum(expense.amount_uzs) }}</span>
    <DesignIcon
      name="chevright"
      :size="18"
      class="owner-row__chev"
    />
  </RouterLink>
</template>

<style scoped>
.owner-row__chev { color: var(--text-tertiary); flex: none; }
</style>
