<script setup lang="ts">
import Card from '@/components/design/Card.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import DistributionChart from '@/components/dashboard/DistributionChart.vue'
import ReportState from '@/components/dashboard/ReportState.vue'
import { fmtNum, fmtPct } from '@/components/design/utils/format'
import { groupPaymentMethods, paymentMethodColors, paymentMethodNames } from '@/utils/paymentBreakdown'

interface Props {
  orders: any[]
  status: string[]
  payment?: string

  // Whole filtered counts from /orders/stats; fall back to the loaded page only.
  statusCounts?: Record<string, number> | null
  paymentCounts?: Record<string, number> | null
  paymentMethods?: { type: string; amount: number | string }[]
  paymentTotal?: number
}
const props = defineProps<Props>()

const emit = defineEmits<{
  (e: 'status', value: string): void
  (e: 'payment', value: string): void
}>()

const { t } = useI18n({ useScope: 'global' })

const statuses = computed(() => [
  { key: 'OPEN', color: 'var(--c3)' },
  { key: 'PREPARING', color: 'var(--c4)' },
  { key: 'READY', color: 'var(--c2)' },
  { key: 'COMPLETED', color: 'var(--primary)' },
  { key: 'CANCELED', color: 'var(--error)' },
].map(status => ({
  ...status,
  label: t(`order_status_${status.key}`),
  value: props.statusCounts
    ? Number(props.statusCounts[status.key] ?? 0)
    : props.orders.filter(order => order.status === status.key).length,
})))

const statusTotal = computed(() => statuses.value.reduce((sum, row) => sum + row.value, 0))
const share = (value: number) => statusTotal.value > 0 ? value / statusTotal.value * 100 : 0

const paymentRows = computed(() => [
  { key: 'PAID', label: t('payment_status_PAID'), color: 'var(--c2)', value: props.paymentCounts ? Number(props.paymentCounts.PAID ?? 0) : props.orders.filter(order => order.is_paid).length },
  { key: 'UNPAID', label: t('payment_status_UNPAID'), color: 'var(--c3)', value: props.paymentCounts ? Number(props.paymentCounts.UNPAID ?? 0) : props.orders.filter(order => !order.is_paid).length },
])

const selectedPayment = computed(() => {
  const index = paymentRows.value.findIndex(row => row.key === props.payment)
  return index < 0 ? null : index
})

function selectPayment(index: number | null) {
  const key = index === null ? props.payment : paymentRows.value[index]?.key
  if (key)
    emit('payment', key)
}

const tenderRows = computed(() => groupPaymentMethods(props.paymentMethods ?? []).map(row => ({
  label: paymentMethodNames[row.type] ? t(paymentMethodNames[row.type]) : row.type,
  value: row.amount,
  color: paymentMethodColors[row.type] || 'var(--c5)',
})))
</script>

<template>
  <div class="ordersinsights">
    <section
      class="order-status-strip"
      :aria-label="t('Status distribution')"
    >
      <div class="order-status-strip__heading">
        <h3>{{ t('Status distribution') }}</h3>
        <span>{{ t(statusCounts ? 'orders_stats_scope' : 'orders_page_scope') }} · {{ t('click to filter') }}</span>
      </div>
      <div class="order-status-strip__items">
        <button
          v-for="row in statuses"
          :key="row.key"
          type="button"
          :style="{ '--status-color': row.color }"
          :aria-pressed="status.includes(row.key)"
          @click="emit('status', row.key)"
        >
          <span class="order-status-strip__label"><i />{{ row.label }}</span>
          <strong>{{ fmtNum(row.value) }}</strong><small>{{ fmtPct(share(row.value), 2) }}</small>
          <span
            class="order-status-strip__track"
            aria-hidden="true"
          ><span :style="{ width: `${share(row.value)}%` }" /></span>
        </button>
      </div>
    </section>
    <Card class-name="ordersinsights__card ordersinsights__payment-status">
      <header class="ordersinsights__head">
        <div><h3>{{ t('Payment status') }}</h3><p>{{ t(paymentCounts ? 'orders_stats_scope' : 'orders_page_scope') }} · {{ t('click to filter') }}</p></div>
        <DesignIcon
          name="check"
          :size="18"
        />
      </header>
      <DistributionChart
        :data="paymentRows"
        :label="t('Orders')"
        :unit="t('orders')"
        visual="donut"
        :percent-precision="2"
        :selected-index="selectedPayment"
        @select="selectPayment"
      />
    </Card>
    <Card class-name="ordersinsights__card ordersinsights__tenders">
      <header class="ordersinsights__head">
        <div><h3>{{ t('Payment breakdown') }}</h3><p>{{ t('orders_stats_scope') }} · UZS</p></div>
        <DesignIcon
          name="wallet"
          :size="18"
        />
      </header>
      <DistributionChart
        v-if="tenderRows.length"
        :data="tenderRows"
        :label="t('Collected')"
        unit="UZS"
        visual="donut"
        :percent-precision="2"
      />
      <ReportState
        v-else
        :title="t('orders_payments_unavailable')"
        :description="t('Try a different date range.')"
        icon="wallet"
      />
    </Card>
  </div>
</template>

<style scoped>
.ordersinsights { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: stretch; gap: 16px; margin: 20px 0; }
.order-status-strip { grid-column: 1 / -1; min-width: 0; padding: 0 2px 2px; }
.order-status-strip__heading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 5px 12px; margin: 0 0 10px; }
.order-status-strip__heading h3 { font-size: 13px; font-weight: 600; margin: 0; }
.order-status-strip__heading > span { font-size: 11px; color: var(--text-secondary); }
.order-status-strip__items { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.order-status-strip__items > button { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 6px; padding: 12px 14px; min-width: 0; border: 1px solid transparent; border-radius: 10px; text-align: start; background: color-mix(in srgb, var(--status-color) 5%, var(--surface)); transition: background 150ms, border-color 150ms; }
.order-status-strip__items > button:hover, .order-status-strip__items > button[aria-pressed="true"] { border-color: color-mix(in srgb, var(--status-color) 45%, var(--border)); background: color-mix(in srgb, var(--status-color) 10%, var(--surface)); }
.order-status-strip__label { grid-column: 1 / -1; display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--text-secondary); overflow-wrap: anywhere; }
.order-status-strip__label i { flex: 0 0 6px; height: 6px; border-radius: 2px; background: var(--status-color); }
.order-status-strip__items strong { font: 600 22px/1.3 var(--font-sans); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.order-status-strip__items small { font-size: 10px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.order-status-strip__track { grid-column: 1 / -1; height: 4px; border-radius: 3px; background: color-mix(in srgb, var(--status-color) 8%, var(--surface-2)); margin-top: 2px; overflow: hidden; }
.order-status-strip__track > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--status-color) 48%, white), var(--status-color)); }
.order-status-strip button:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
:deep(.ordersinsights__card) { min-width: 0; padding: 20px; display: flex; flex-direction: column; }
.ordersinsights__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
.ordersinsights__head h3 { font-size: 15px; font-weight: 600; margin: 0; }
.ordersinsights__head p { font-size: 11px; color: var(--text-secondary); margin: 6px 0 0; }
.ordersinsights__head > .ic { flex-shrink: 0; color: var(--primary); }
.ordersinsights :deep(.distribution) { flex: 1; }
.ordersinsights :deep(.distribution__visual) { max-width: 290px; }
.ordersinsights :deep(.report-state) { flex: 1; }
@media (max-width: 1100px) { .ordersinsights { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 650px) {
  .ordersinsights { gap: 12px; }
  .order-status-strip__items { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .order-status-strip__items > button { padding: 10px 12px; }
  .order-status-strip__items > button:last-child { grid-column: 1 / -1; grid-template-columns: 1fr auto auto; }
  .order-status-strip__items > button:last-child .order-status-strip__label { grid-column: 1; }
  .order-status-strip__items strong { font-size: 20px; }
  :deep(.ordersinsights__card) { padding: 16px; }
}
@media (prefers-reduced-motion: reduce) { .order-status-strip__items > button { transition: none; } }
</style>
