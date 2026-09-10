<script setup lang="ts">
import Badge from '@/components/design/Badge.vue'
import Checkbox from '@/components/design/Checkbox.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import PaymentBreakdown from '@/components/design/PaymentBreakdown.vue'
import Modal from '@/components/design/Modal.vue'
import type { OrderPreparation } from '@/utils/preparationTime'
import { formatPreparationTarget } from '@/utils/preparationTime'
import { fmtNum } from '@/components/design/utils/format'

interface TicketItem { product__name?: string; product?: { name?: string }; product_name?: string; quantity?: number; price?: number | string }
interface TicketOrder { id: string | number; status: string; is_paid: boolean; items?: TicketItem[]; [field: string]: any }
const props = defineProps<{ rows: TicketOrder[]; selection: Set<string | number>; busy?: boolean }>()
const emit = defineEmits<{ (event: 'selection', value: Set<string | number>): void }>()
const { t } = useI18n({ useScope: 'global' })
const { formatCurrency, formatDate } = useFormatters()
const detailId = ref<string | number | null>(null)
const detail = computed(() => props.rows.find(order => order.id === detailId.value))
const tones: Record<string, 'primary' | 'warning' | 'success' | 'error' | 'neutral'> = { OPEN: 'neutral', PREPARING: 'warning', READY: 'success', COMPLETED: 'primary', CANCELED: 'error' }

function select(id: string | number, checked: boolean) {
  const next = new Set(props.selection)
  if (checked)
    next.add(id)
  else next.delete(id)
  emit('selection', next)
}
function showDetails(id: string | number) { detailId.value = id }
function target(preparation: OrderPreparation) {
  return preparation.target ? formatPreparationTarget(preparation.target, t('time_minute_short')) : t('prep_status_UNTRACKED')
}
watch(() => props.rows, rows => {
  if (!rows.some(row => row.id === detailId.value))
    detailId.value = null
})
</script>

<template>
  <div class="order-tickets">
    <article
      v-for="order in rows"
      :key="order.id"
      class="order-ticket"
      :class="{ 'is-selected': selection.has(order.id) }"
      :data-status="order.status"
    >
      <header class="order-ticket__head">
        <label>
          <Checkbox
            :model-value="selection.has(order.id)"
            :disabled="busy"
            :aria-label="t('orders_select_order', { id: order.order_number ?? order.display_id ?? '—' })"
            @update:model-value="select(order.id, $event)"
          />
          <strong>#{{ order.order_number ?? order.display_id ?? '—' }}</strong>
        </label>
        <Badge
          :tone="tones[order.status] || 'neutral'"
          dot
        >
          {{ order.status ? t(`order_status_${order.status}`) : '—' }}
        </Badge>
      </header>
      <div class="order-ticket__context">
        <span><DesignIcon
          :name="order.order_type === 'HALL' ? 'table' : 'receipt'"
          :size="14"
        />{{ order.order_type ? t(`order_type_${order.order_type}`) : '—' }}<template v-if="order.table?.name"> · {{ order.table.name }}</template></span>
        <time :datetime="order.created_at">{{ formatDate(order.created_at) }}</time>
      </div>
      <div class="order-ticket__items">
        <div
          v-for="(item, index) in (order.items || []).slice(0, 3)"
          :key="index"
        >
          <span class="order-ticket__quantity">{{ fmtNum(Number(item.quantity ?? 1)) }}×</span>
          <span>{{ item.product__name ?? item.product?.name ?? item.product_name ?? '—' }}</span>
        </div>
        <span
          v-if="!order.items?.length"
          class="order-ticket__muted"
        >{{ t('No items') }}</span>
        <button
          v-else-if="order.items.length > 3"
          type="button"
          @click="showDetails(order.id)"
        >
          {{ t('orders_more_items', { n: order.items.length - 3 }) }}
        </button>
      </div>
      <div class="order-ticket__settlement">
        <div><span>{{ t('Total') }} · UZS</span><strong>{{ order.total_amount == null ? '—' : formatCurrency(order.total_amount) }}</strong></div>
        <Badge :tone="order.is_paid ? 'success' : 'warning'">
          {{ t(`payment_status_${order.is_paid ? 'PAID' : 'UNPAID'}`) }}
        </Badge>
      </div>
      <div class="order-ticket__prep">
        <DesignIcon
          name="clock"
          :size="14"
        />
        <template v-if="order.preparation">
          <span>{{ t('Prep Time') }}</span>
          <Badge :tone="order.preparation.tone">
            {{ order.preparation.elapsedMinutes }} {{ t('time_minute_short') }}
          </Badge>
          <span>{{ order.preparation.target ? `${t('Target')} ${target(order.preparation)}` : t('prep_status_UNTRACKED') }}</span>
        </template>
        <span v-else>{{ t('orders_prep_unavailable') }}</span>
      </div>
      <footer class="order-ticket__foot">
        <button
          type="button"
          class="order-ticket__details"
          aria-haspopup="dialog"
          @click="showDetails(order.id)"
        >
          {{ t('Details') }}<DesignIcon
            name="arrowright"
            :size="15"
          />
        </button>
        <slot
          name="actions"
          :row="order"
        />
      </footer>
    </article>
  </div>
  <Modal
    :open="!!detail"
    :title="`${t('Order')} #${detail?.order_number ?? detail?.display_id ?? '—'}`"
    :subtitle="detail?.created_at ? formatDate(detail.created_at) : ''"
    :width="640"
    class="order-detail-sheet"
    @close="detailId = null"
  >
    <template v-if="detail">
      <div class="order-detail-sheet__summary">
        <div><span>{{ t('Total') }} · UZS</span><strong>{{ detail.total_amount == null ? '—' : formatCurrency(detail.total_amount) }}</strong></div>
        <div>
          <Badge :tone="tones[detail.status] || 'neutral'">
            {{ detail.status ? t(`order_status_${detail.status}`) : '—' }}
          </Badge><Badge :tone="detail.is_paid ? 'success' : 'warning'">
            {{ t(`payment_status_${detail.is_paid ? 'PAID' : 'UNPAID'}`) }}
          </Badge>
        </div>
      </div>
      <div
        v-if="detail"
        class="order-ticket__expanded"
      >
        <dl>
          <div><dt>{{ t('Customer') }}</dt><dd>{{ detail.customer?.name ?? detail.phone_number ?? '—' }}</dd></div>
          <div><dt>{{ t('Cashier') }}</dt><dd>{{ detail.cashier?.name ?? '—' }}</dd></div>
          <div><dt>{{ t('Info') }}</dt><dd>{{ detail.description || (detail.phone_number !== '+998' ? detail.phone_number : '') || '—' }}</dd></div>
          <div><dt>{{ t('Paid at') }}</dt><dd>{{ detail.paid_at ? formatDate(detail.paid_at) : '—' }}</dd></div>
          <div><dt>{{ t('Items') }}</dt><dd>{{ fmtNum(Number(detail.items_count ?? detail.items?.length ?? 0)) }}</dd></div>
        </dl>
        <div
          v-if="detail.items?.length"
          class="order-ticket__lines"
        >
          <h3>{{ t('Order Items') }}</h3>
          <div
            v-for="(item, index) in detail.items"
            :key="index"
          >
            <span>{{ item.product__name ?? item.product?.name ?? item.product_name ?? '—' }}<small>{{ fmtNum(Number(item.quantity ?? 1)) }} × {{ formatCurrency(item.price ?? 0) }}</small></span>
            <strong>{{ formatCurrency(Number(item.quantity ?? 1) * Number(item.price ?? 0)) }}</strong>
          </div>
        </div>
        <PaymentBreakdown
          v-if="detail.is_paid && detail.payments?.length"
          :methods="detail.payments"
          :total="Number(detail.total_amount) || 0"
        />
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.order-tickets { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 14px; align-items: stretch; }
.order-ticket { --ticket-accent: var(--text-secondary); display: flex; flex-direction: column; min-width: 0; color: var(--text); border: 1px solid var(--orders-edge, var(--border)); border-radius: 16px; background: var(--surface); overflow: hidden; box-shadow: var(--orders-shadow); transition: border-color 160ms, box-shadow 160ms; }
.order-ticket[data-status="PREPARING"] { --ticket-accent: var(--c4); }
.order-ticket[data-status="READY"] { --ticket-accent: var(--success); }
.order-ticket[data-status="COMPLETED"] { --ticket-accent: var(--primary); }
.order-ticket[data-status="CANCELED"] { --ticket-accent: var(--error); }
.order-ticket.is-selected { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary); }
.order-ticket__head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px; background: color-mix(in srgb, var(--ticket-accent) 5%, var(--surface)); }
.order-ticket__head label { display: flex; align-items: center; gap: 10px; min-width: 0; cursor: pointer; }
.order-ticket__head strong { font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.order-ticket__context { display: flex; justify-content: space-between; gap: 8px; padding: 12px 16px 0; font-size: 10px; color: var(--text-secondary); flex-wrap: wrap; }
.order-ticket__context > span { display: inline-flex; align-items: center; gap: 5px; }
.order-ticket__items { flex: 1; display: grid; align-content: start; gap: 8px; min-height: 82px; padding: 16px 16px 12px; }
.order-ticket__items > div { display: flex; gap: 9px; font-size: 12px; line-height: 1.5; }
.order-ticket__items > div > span:last-child { overflow-wrap: anywhere; }
.order-ticket__quantity { flex-shrink: 0; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.order-ticket__items > button { justify-self: start; color: var(--primary); font-size: 11px; padding: 3px 0; }
.order-ticket__muted { font-size: 12px; color: var(--text-secondary); }
.order-ticket__settlement { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 16px; border-top: 1px dashed var(--border); }
.order-ticket__settlement > div { display: grid; gap: 5px; min-width: 0; }
.order-ticket__settlement > div > span { font-size: 10px; color: var(--text-secondary); }
.order-ticket__settlement strong { font: 600 24px/1.2 var(--font-sans); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.order-ticket__prep { min-height: 36px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 0 16px 12px; font-size: 10px; color: var(--text-secondary); }
.order-ticket__foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); }
.order-ticket__details { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px; border-radius: 8px; font-size: 12px; font-weight: 500; }
.order-ticket__details:hover { background: var(--surface-2); }
.order-ticket__expanded { padding: 20px 0 0; border-top: 1px solid var(--border); background: transparent; }
.order-ticket__expanded dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; margin: 0 0 20px; }
.order-ticket__expanded dt { font-size: 10px; color: var(--text-secondary); margin-bottom: 5px; }
.order-ticket__expanded dd { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
.order-ticket__lines h3 { margin: 0 0 12px; font-size: 12px; }
.order-ticket__lines > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); font-size: 12px; }
.order-ticket__lines > div > span { min-width: 0; overflow-wrap: anywhere; }
.order-ticket__lines small { display: block; margin-top: 4px; color: var(--text-secondary); font-size: 10px; }
.order-ticket__lines strong { flex-shrink: 0; font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.order-ticket button:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.order-detail-sheet__summary { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.order-detail-sheet__summary > div { display: flex; gap: 6px; flex-wrap: wrap; }
.order-detail-sheet__summary > div:first-child { display: grid; gap: 6px; }
.order-detail-sheet__summary > div > span:not(.badge) { font-size: 11px; color: var(--text-secondary); }
.order-detail-sheet__summary strong { font-size: 27px; font-weight: 600; font-variant-numeric: tabular-nums; }
@media (max-width: 1250px) { .order-tickets { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) { .order-tickets { grid-template-columns: minmax(0, 1fr); gap: 12px; } .order-ticket__items { min-height: 0; } .order-ticket__details { min-height: 44px; } }
@media (prefers-reduced-motion: reduce) { .order-ticket { transition: none; } }
</style>
