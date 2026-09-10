<script setup lang="ts">
/* Interactive insights strip for the Orders page.
   Port of v3 OrdersInsights — additive, sits between KPI grid and table card.

   Notes vs v3:
   - status filter is a STRING[] on the FE (multi-select), not a single value.
     Clicking a segment/legend toggles membership.
   - payment filter is a single optional string ('PAID' | 'UNPAID' | undefined).
     Clicking a row toggles to undefined when re-clicked.
   - STATUSES uses FE-canonical OPEN/PREPARING/READY/COMPLETED/CANCELED
     (not v3's reduced [PREPARING, READY, COMPLETED, CANCELLED]).
*/
import Card from '@/components/design/Card.vue'
import PaymentBreakdown from '@/components/design/PaymentBreakdown.vue'
import ProgressRing from '@/components/design/charts/ProgressRing.vue'
import { cx } from '@/components/design/utils'

interface Props {
  orders: any[]
  status: string[]
  payment?: string
  // Global counts from /orders/stats (whole filtered set, not just the page).
  // When provided the status distribution + payment split use these instead of
  // deriving from the current page's rows. Fall back to page-derived when absent.
  statusCounts?: Record<string, number> | null
  paymentCounts?: Record<string, number> | null
  paymentMethods?: { type: string; amount: number | string }[]
  paymentTotal?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'status', s: string): void
  (e: 'payment', p: string): void
}>()

const { t } = useI18n({ useScope: 'global' })

interface StatusDef {
  key: string
  label: string
  color: string
}

const STATUSES = computed<StatusDef[]>(() => [
  { key: 'OPEN', label: t('order_status_OPEN'), color: 'var(--warning)' },
  { key: 'PREPARING', label: t('order_status_PREPARING'), color: 'var(--c4, var(--warning))' },
  { key: 'READY', label: t('order_status_READY'), color: 'var(--success)' },
  { key: 'COMPLETED', label: t('order_status_COMPLETED'), color: 'var(--primary)' },
  { key: 'CANCELED', label: t('order_status_CANCELED'), color: 'var(--error)' },
])

const counts = computed<Record<string, number>>(() => {
  const c: Record<string, number> = {}
  STATUSES.value.forEach(s => { c[s.key] = 0 })
  // Prefer global /orders/stats counts when supplied.
  if (props.statusCounts) {
    STATUSES.value.forEach((s) => { c[s.key] = Number(props.statusCounts![s.key] ?? 0) })
    return c
  }
  for (const o of (props.orders || [])) {
    if (c[o.status] !== undefined) c[o.status] += 1
  }
  return c
})

// Denominator for the status distribution bars = sum of all status counts
// (distinct axis from paid/unpaid, so it can't reuse `totals.total`).
const statusTotal = computed(() => Object.values(counts.value).reduce((a, b) => a + b, 0) || 1)

const totals = computed(() => {
  let paid = 0
  let unpaid = 0
  if (props.paymentCounts) {
    paid = Number(props.paymentCounts.PAID ?? 0)
    unpaid = Number(props.paymentCounts.UNPAID ?? 0)
  }
  else {
    for (const o of (props.orders || [])) {
      if (o.is_paid) paid += 1
      else unpaid += 1
    }
  }
  const total = (paid + unpaid) || 1
  const paidPct = Math.round((paid / total) * 100)
  return { paid, unpaid, total, paidPct }
})

function isStatusActive(key: string) {
  return Array.isArray(props.status) && props.status.includes(key)
}
function anyStatusActive() {
  return Array.isArray(props.status) && props.status.length > 0
}

function toggleStatus(key: string) {
  emit('status', key)
}
function togglePayment(p: string) {
  emit('payment', p)
}
</script>

<template>
  <div class="ordersinsights">
    <!-- Status distribution -->
    <Card class-name="ordersinsights__card">
      <div class="row between" style="margin-bottom: 14px;">
        <span class="kpi__label">{{ t('Status distribution') }}</span>
        <span class="tertiary" style="font-size: 12px;">{{ t('click to filter') }}</span>
      </div>
      <div class="distbar">
        <template v-for="s in STATUSES" :key="s.key">
          <div
            v-if="(counts[s.key] / statusTotal * 100) > 0"
            :class="cx('distbar__seg', anyStatusActive() && !isStatusActive(s.key) && 'is-dim')"
            :style="{
              width: `${counts[s.key] / statusTotal * 100}%`,
              background: s.color,
            }"
            :title="`${s.label}: ${counts[s.key]}`"
            @click="toggleStatus(s.key)"
          />
        </template>
      </div>
      <div class="row wrap" style="gap: 14px; margin-top: 14px;">
        <button
          v-for="s in STATUSES"
          :key="`l-${s.key}`"
          type="button"
          :class="cx('distlegend', isStatusActive(s.key) && 'is-active')"
          @click="toggleStatus(s.key)"
        >
          <span class="legend-swatch" :style="{ background: s.color }" />
          <span>{{ s.label }}</span>
          <b class="mono">{{ counts[s.key] }}</b>
        </button>
      </div>
    </Card>

    <!-- Payment ring -->
    <Card class-name="ordersinsights__card">
      <div class="kpi__label" style="margin-bottom: 8px;">{{ t('Payment status') }}</div>
      <div class="row" style="gap: 16px; align-items: center;">
        <ProgressRing
          :value="totals.paidPct"
          color="var(--success)"
          track-color="var(--error)"
          :size="84"
        />
        <div style="flex: 1; min-width: 0;">
          <button
            type="button"
            :class="cx('distlegend', payment === 'PAID' && 'is-active')"
            style="width: 100%; justify-content: flex-start;"
            @click="togglePayment('PAID')"
          >
            <span class="legend-swatch" style="background: var(--success);" />
            <span>{{ t('payment_status_PAID') }}</span>
            <b class="mono" style="margin-left: auto;">{{ totals.paid }}</b>
          </button>
          <button
            type="button"
            :class="cx('distlegend', payment === 'UNPAID' && 'is-active')"
            style="width: 100%; justify-content: flex-start; margin-top: 4px;"
            @click="togglePayment('UNPAID')"
          >
            <span class="legend-swatch" style="background: var(--error);" />
            <span>{{ t('payment_status_UNPAID') }}</span>
            <b class="mono" style="margin-left: auto;">{{ totals.unpaid }}</b>
          </button>
        </div>
      </div>
    </Card>

    <!-- Payment breakdown replaces the unused hourly chart. -->
    <Card class-name="ordersinsights__card">
      <div class="kpi__label" style="margin-bottom: 8px;">{{ t('Payment breakdown') }}</div>
      <PaymentBreakdown
        v-if="paymentMethods?.length"
        :methods="paymentMethods"
        :total="paymentTotal ?? 0"
      />
      <div v-else class="statefill">
        <div class="statefill__title">{{ t('No data') }}</div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.ordersinsights {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr;
  gap: var(--sp-5);
  margin-bottom: var(--sp-5);
}
:deep(.ordersinsights__card) {
  padding: var(--sp-5);
}
.row {
  display: flex;
  align-items: center;
}
.row.between {
  justify-content: space-between;
}
.row.wrap {
  flex-wrap: wrap;
}

@media (max-width: 1100px) {
  .ordersinsights {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 768px) {
  .ordersinsights {
    grid-template-columns: 1fr;
    gap: var(--sp-4);
  }
}
</style>
