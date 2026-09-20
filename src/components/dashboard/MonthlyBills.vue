<script setup lang="ts">
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Skeleton from '@/components/design/Skeleton.vue'
import { useApiError } from '@/composables/useApiError'
import { useFormatters } from '@/composables/useFormatters'
import { fetchCashPosition } from '@/services/moneyControlApi'
import type { CashPosition } from '@/types/moneyControl'

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency } = useFormatters()
const { translate: translateError } = useApiError()

const position = shallowRef<CashPosition | null>(null)
const loading = ref(false)
const loadError = shallowRef<unknown>(null)

const GROUP_LABELS: Record<string, string> = {
  RENT: 'moneyControl.costGroupRent',
  UTILITIES: 'moneyControl.costGroupUtilities',
  OPERATING: 'moneyControl.costGroupOperating',
  TAXES: 'moneyControl.costGroupTaxes',
}

async function load() {
  loading.value = true
  loadError.value = null
  try {
    position.value = await fetchCashPosition()
  }
  catch (error) {
    loadError.value = error
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

function num(value: unknown): number {
  return typeof value === 'number' ? value : (Number(value ?? 0) || 0)
}

/** Every monthly bill as a balance: planned, already paid, still to pay. */
const bills = computed(() => {
  const costs = position.value?.monthlyCosts
  if (!costs)
    return []

  return costs.groups.map(group => {
    const planned = num(group.plannedMonthlyUzs)
    const paid = num(group.paidCurrentPeriodUzs)

    return {
      key: group.reportingGroup,
      label: t(GROUP_LABELS[group.reportingGroup] ?? 'moneyControl.costGroupOperating'),
      planned,
      paid,
      left: num(group.remainingUzs),
      dueByToday: num(group.accruedToDateUzs),
      paidPct: planned > 0 ? Math.min(100, Math.round((paid / planned) * 100)) : 0,
      items: costs.rows
        .filter(row => group.rowKeys.includes(row.rowKey))
        .map(row => ({ key: row.rowKey, name: row.name, monthly: num(row.monthlyBaselineUzs) })),
    }
  })
})

const totals = computed(() => ({
  planned: bills.value.reduce((sum, bill) => sum + bill.planned, 0),
  paid: bills.value.reduce((sum, bill) => sum + bill.paid, 0),
  left: bills.value.reduce((sum, bill) => sum + bill.left, 0),
}))

const days = computed(() => {
  const calculation = position.value?.calculation

  return {
    elapsed: calculation?.elapsedDays ?? 0,
    total: calculation?.currentMonthDays ?? 0,
  }
})
</script>

<template>
  <Card
    class="bills"
    aria-labelledby="bills-title"
  >
    <header class="bills__head">
      <div>
        <h2 id="bills-title">
          {{ t('bills_title') }}
        </h2>
        <p>{{ t('bills_subtitle', { elapsed: days.elapsed, total: days.total }) }}</p>
      </div>
      <RouterLink
        class="bills__manage"
        to="/money-control"
      >
        {{ t('bills_manage') }}
      </RouterLink>
    </header>

    <div
      v-if="loadError && !position"
      class="bills__error"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <span>{{ translateError(loadError) }}</span>
      <Button
        size="sm"
        icon="retry"
        :loading="loading"
        @click="load"
      >
        {{ t('Retry') }}
      </Button>
    </div>

    <div
      v-else-if="!position"
      class="bills__list"
      aria-hidden="true"
    >
      <Skeleton
        v-for="index in 3"
        :key="index"
        class="bills__skeleton"
      />
    </div>

    <p
      v-else-if="!bills.length"
      class="bills__empty"
    >
      {{ t('bills_empty') }}
      <RouterLink to="/money-control">
        {{ t('bills_add') }}
      </RouterLink>
    </p>

    <template v-else>
      <ul class="bills__list">
        <li
          v-for="bill in bills"
          :key="bill.key"
          class="bill"
        >
          <div class="bill__top">
            <span class="bill__name">{{ bill.label }}</span>
            <span class="bill__amounts">
              <strong>{{ formatCurrency(bill.paid) }}</strong>
              <span class="bill__of">/ {{ formatCurrency(bill.planned) }}</span>
            </span>
          </div>
          <div
            class="bill__bar"
            role="progressbar"
            :aria-valuenow="bill.paidPct"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-label="bill.label"
          >
            <i :style="{ width: `${bill.paidPct}%` }" />
          </div>
          <div class="bill__foot">
            <span :class="{ 'is-left': bill.left > 0 }">{{ t('bills_left') }}: <strong>{{ formatCurrency(bill.left) }}</strong></span>
            <span>{{ t('bills_due_by_today') }}: {{ formatCurrency(bill.dueByToday) }}</span>
            <span
              v-if="bill.items.length > 1"
              class="bill__items"
            >{{ bill.items.map(item => item.name).join(', ') }}</span>
          </div>
        </li>
      </ul>

      <div class="bills__total">
        <span>{{ t('bills_total_planned') }}<strong>{{ formatCurrency(totals.planned) }}</strong></span>
        <span>{{ t('bills_total_paid') }}<strong>{{ formatCurrency(totals.paid) }}</strong></span>
        <span class="is-left">{{ t('bills_total_left') }}<strong>{{ formatCurrency(totals.left) }}</strong></span>
      </div>
    </template>
  </Card>
</template>

<style scoped>
.bills { display: grid; gap: 14px; padding: 20px; }
.bills__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.bills__head h2 { margin: 0; font-size: 17px; font-weight: 650; }
.bills__head p { margin: 3px 0 0; color: var(--text-secondary); font-size: 12px; }
.bills__manage { color: var(--primary); font-size: 12px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.bills__manage:hover { text-decoration: underline; }
.bills__manage:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: 4px; }
.bills__error { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px; border: 1px solid var(--error-border); border-radius: 12px; background: var(--error-weak); color: var(--error-strong); font-size: 13px; }
.bills__error span { flex: 1; min-width: 200px; }
.bills__empty { margin: 0; color: var(--text-secondary); font-size: 13px; }
.bills__empty a { margin-left: 6px; color: var(--primary); font-weight: 600; text-decoration: none; }
.bills__list { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.bills__skeleton { min-height: 56px; border-radius: 12px; }
.bill { display: grid; gap: 7px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
.bill__top { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.bill__name { font-size: 13px; font-weight: 600; }
.bill__amounts strong { font-family: var(--font-mono); font-size: 16px; font-variant-numeric: tabular-nums; }
.bill__of { margin-left: 4px; color: var(--text-tertiary); font-family: var(--font-mono); font-size: 13px; }
.bill__bar { height: 7px; border-radius: 999px; background: var(--surface-inset); overflow: hidden; }
.bill__bar > i { display: block; height: 100%; border-radius: 999px; background: var(--primary); }
.bill__foot { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--text-tertiary); font-size: 11px; }
.bill__foot strong { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.bill__foot .is-left strong { color: var(--warning-strong); }
.bill__items { color: var(--text-tertiary); }
.bills__total { display: flex; flex-wrap: wrap; gap: 8px 22px; padding: 12px 14px; border-radius: 12px; background: var(--surface-inset); font-size: 12px; }
.bills__total span { display: flex; align-items: baseline; gap: 8px; color: var(--text-secondary); }
.bills__total strong { font-family: var(--font-mono); font-size: 15px; font-variant-numeric: tabular-nums; }
.bills__total .is-left strong { color: var(--warning-strong); }

@media (max-width: 560px) {
  .bills { padding: 16px 14px; }
}
</style>
