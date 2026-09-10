<script setup lang="ts">
import { ORDER_STATUS_COLOR as statusColor } from '@/constants/statusColors'
import axios from '@/plugins/axios'
import { buildDateParams } from '@/composables/useBusinessDay'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import IconAction from '@/components/design/IconAction.vue'
import MultiSelect from '@/components/design/MultiSelect.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import DateRangePicker from '@/components/design/DateRangePicker.vue'
import OrdersInsights from '@/components/design/OrdersInsights.vue'
import PaymentBreakdown from '@/components/design/PaymentBreakdown.vue'
import { buildCsv } from '@/utils/csv'
import type { OrderPreparation } from '@/utils/preparationTime'
import {
  formatPreparationTarget,
  getOrderPreparation,
} from '@/utils/preparationTime'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatCurrency, formatDate } = useFormatters()
const route = useRoute()

// ---- state ----
const orders = ref<any[]>([])
const totalOrders = ref(0)
const loading = ref(false)
const stats = ref<any>(null)

const page = ref(1)
const itemsPerPage = ref(10)
const statusFilter = ref<string[]>([])
const paymentFilter = ref<string | undefined>(undefined)
const search = ref(String(route.query.id ?? route.query.search ?? ''))
const dateRange = ref<{ from: string; to: string; preset?: string; fromTime?: string; toTime?: string }>({ from: '', to: '', preset: 'all' })
const dateFrom = computed({ get: () => dateRange.value.from, set: v => dateRange.value = { ...dateRange.value, from: v } })
const dateTo = computed({ get: () => dateRange.value.to, set: v => dateRange.value = { ...dateRange.value, to: v } })

// New filters mirroring BE /orders query params
const orderTypeFilter = ref<string | undefined>(undefined)
const cashierFilter = ref<string | undefined>(undefined)
const categoryFilter = ref<string[]>([])
const productFilter = ref<string[]>([])

// Lookups for cashier / category / product selects
const cashierOptions = ref<{ value: string; label: string }[]>([])
const categoryOptions = ref<{ value: string; label: string }[]>([])
const productOptions = ref<{ value: string; label: string }[]>([])
const filterPanelOpen = ref(false)

const selected = ref<Set<number | string>>(new Set())

const sortKey = ref<string>('id')
const sortDir = ref<'asc' | 'desc'>('desc')

// Per-row + bulk loading state to prevent duplicate POSTs
const actingOnId = ref<number | string | null>(null)
const bulking = ref(false)

// Destructive-action confirm dialogs
type ConfirmKind = 'cancel-one' | 'cancel-bulk' | 'pay-one' | 'pay-bulk' | 'unpay-one'
const confirmDialog = ref<{ kind: ConfirmKind; order?: any } | null>(null)
function openConfirm(kind: ConfirmKind, order?: any) {
  confirmDialog.value = { kind, order }
}
function closeConfirm() {
  confirmDialog.value = null
}

const debouncedSearch = useDebounceFn(() => {
  if (page.value !== 1)
    page.value = 1
  else
    loadOrders()
  loadStats()
}, 400)

const orderStatuses = ['OPEN', 'PREPARING', 'READY', 'COMPLETED', 'CANCELED']
const paymentStatuses = ['PAID', 'UNPAID']
const orderTypes = ['HALL', 'DELIVERY', 'PICKUP']

// Status tone map mirrored from the design bundle
const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  READY: 'success',
  PAID: 'success',
  PREPARING: 'warning',
  PENDING: 'warning',
  OPEN: 'warning',
  INACTIVE: 'neutral',
  CANCELLED: 'error',
  CANCELED: 'error',
  UNPAID: 'error',
  CASHIER: 'info',
  USER: 'neutral',
  MANAGER: 'primary',
  ADMIN: 'primary',
  HALL: 'neutral',
  DELIVERY: 'info',
  PICKUP: 'primary',
}

function tone(v: string | undefined) {
  if (!v)
    return 'neutral'
  return STATUS_TONE[v] ?? statusColor[v] ?? 'neutral'
}

// ---- load ----
let ordersRequestId = 0
let statsRequestId = 0

async function loadOrders() {
  const requestId = ++ordersRequestId

  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (statusFilter.value.length)
      params.statuses = statusFilter.value.join(',')
    if (paymentFilter.value)
      params.payment_status = paymentFilter.value
    if (search.value.trim())
      params.search = search.value.trim()
    Object.assign(params, buildDateParams({
      from: dateFrom.value,
      to: dateTo.value,
      fromTime: dateRange.value.fromTime,
      toTime: dateRange.value.toTime,
    }, { orders: true }))
    if (orderTypeFilter.value)
      params.order_type = orderTypeFilter.value
    if (cashierFilter.value)
      params.cashier_id = cashierFilter.value
    if (categoryFilter.value.length)
      params.category_ids = categoryFilter.value.join(',')
    if (productFilter.value.length)
      params.product_ids = productFilter.value.join(',')
    const res = await axios.get('/orders', { params })
    const d = res.data?.data
    if (requestId !== ordersRequestId)
      return

    orders.value = (d?.orders ?? []).map((order: any) => ({
      ...order,
      preparation: getOrderPreparation(order),
    }))
    totalOrders.value = d?.pagination?.total_orders ?? orders.value.length
  }
  catch {
    if (requestId !== ordersRequestId)
      return
    orders.value = []
    totalOrders.value = 0
    notify(t('Failed to load orders'), 'error')
  }
  finally {
    if (requestId === ordersRequestId)
      loading.value = false
  }
}

async function loadStats() {
  const requestId = ++statsRequestId
  try {
    const params: any = buildDateParams({
      from: dateFrom.value,
      to: dateTo.value,
      fromTime: dateRange.value.fromTime,
      toTime: dateRange.value.toTime,
    }, { orders: true })

    if (cashierFilter.value)
      params.cashier_id = cashierFilter.value
    if (categoryFilter.value.length)
      params.category_ids = categoryFilter.value.join(',')
    if (productFilter.value.length)
      params.product_ids = productFilter.value.join(',')
    if (statusFilter.value.length)
      params.statuses = statusFilter.value.join(',')
    if (paymentFilter.value)
      params.payment_status = paymentFilter.value
    if (search.value.trim())
      params.search = search.value.trim()
    if (orderTypeFilter.value)
      params.order_type = orderTypeFilter.value
    const res = await axios.get('/orders/stats', { params })
    if (requestId !== statsRequestId)
      return
    stats.value = res.data?.data ?? res.data
  }
  catch {
    if (requestId === statsRequestId)
      stats.value = null
  }
}

// `payment_counts.UNPAID` is an actionable settlement queue and excludes
// unpaid OPEN carts. The payment-status chart instead needs a complete
// paid/unpaid partition of this same filtered population.
const paymentStatusCounts = computed<Record<string, number> | null>(() => {
  if (!stats.value)
    return null
  const total = Number(stats.value.total_orders)
  const paid = Number(stats.value.paid_orders)
  if (!Number.isFinite(total) || !Number.isFinite(paid))
    return null
  return {
    PAID: Math.max(0, paid),
    UNPAID: Math.max(0, total - paid),
  }
})

async function loadCashiers() {
  try {
    const res = await axios.get('/users', { params: { role: 'CASHIER', per_page: 100 } })
    const d = res.data?.data ?? res.data
    const list: any[] = d?.users ?? []

    cashierOptions.value = list.map((u: any) => ({
      value: String(u.id),
      label: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || String(u.id),
    }))
  }
  catch { /* ignore */ }
}

async function loadCategoriesLookup() {
  try {
    const res = await axios.get('/categories', { params: { per_page: 100 } })
    const d = res.data?.data ?? res.data
    const list: any[] = d?.categories ?? d?.items ?? []

    categoryOptions.value = list.map((c: any) => ({
      value: String(c.id),
      label: c.name ?? String(c.id),
    }))
  }
  catch { /* ignore */ }
}

async function loadProductsLookup() {
  try {
    const res = await axios.get('/products', { params: { per_page: 500 } })
    const d = res.data?.data ?? res.data
    const list: any[] = d?.products ?? d?.items ?? []

    productOptions.value = list.map((p: any) => ({
      value: String(p.id),
      label: p.name ?? String(p.id),
    }))
  }
  catch { /* ignore */ }
}

// Products can be numerous — filter the picker list by a search box.

onMounted(() => {
  loadOrders()
  loadStats()
  loadCashiers()
  loadCategoriesLookup()
  loadProductsLookup()
})

watch([page, itemsPerPage], loadOrders)
watch([statusFilter, paymentFilter, dateRange, orderTypeFilter, cashierFilter, categoryFilter, productFilter], () => {
  if (page.value !== 1)
    page.value = 1
  else
    loadOrders()
  loadStats()
})
watch(search, () => debouncedSearch())
watch(
  () => route.query.id ?? route.query.search,
  value => {
    const next = String(value ?? '')
    if (next !== search.value)
      search.value = next
  },
)

// ---- actions ----
async function markPaid(order: any) {
  if (actingOnId.value === order.id)
    return
  actingOnId.value = order.id
  try {
    await axios.post(`/orders/${order.id}/pay`)
    notify(t('Order marked as paid'))
    await Promise.all([loadOrders(), loadStats()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error updating order'), 'error')
  }
  finally {
    actingOnId.value = null
  }
}

async function cancelOrder(order: any) {
  if (actingOnId.value === order.id)
    return
  actingOnId.value = order.id
  try {
    await axios.post(`/orders/${order.id}/cancel`)
    notify(t('Order cancelled'))
    await Promise.all([loadOrders(), loadStats()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error cancelling order'), 'error')
  }
  finally {
    actingOnId.value = null
  }
}

// Advance an OPEN / PREPARING order to READY (kitchen/counter hand-off).
// Non-destructive, so it fires directly with the same per-row guard — no modal.
async function markReady(order: any) {
  if (actingOnId.value === order.id)
    return
  actingOnId.value = order.id
  try {
    await axios.post(`/orders/${order.id}/ready`)
    notify(t('Order marked as ready'))
    await Promise.all([loadOrders(), loadStats()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error updating order'), 'error')
  }
  finally {
    actingOnId.value = null
  }
}

// Reverse an accidental payment (returns the cash leg to the drawer, restores
// stock server-side). Financially sensitive → routed through the confirm modal.
async function unpayOrder(order: any) {
  if (actingOnId.value === order.id)
    return
  actingOnId.value = order.id
  try {
    await axios.post(`/orders/${order.id}/unpay`)
    notify(t('Order payment reversed'))
    await Promise.all([loadOrders(), loadStats()])
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error updating order'), 'error')
  }
  finally {
    actingOnId.value = null
  }
}

// Wrappers triggered from confirm dialog
async function confirmCancelOne() {
  const o = confirmDialog.value?.order

  closeConfirm()
  if (o)
    await cancelOrder(o)
}
async function confirmPayOne() {
  const o = confirmDialog.value?.order

  closeConfirm()
  if (o)
    await markPaid(o)
}
async function confirmUnpayOne() {
  const o = confirmDialog.value?.order

  closeConfirm()
  if (o)
    await unpayOrder(o)
}
async function confirmCancelBulk() {
  closeConfirm()
  await bulkCancel()
}
async function confirmPayBulk() {
  closeConfirm()
  await bulkMarkPaid()
}

// ---- bulk + selection ----
async function bulkMarkPaid() {
  if (bulking.value)
    return
  bulking.value = true
  try {
    const ids = [...selected.value]
    for (const id of ids) {
      const o = orders.value.find((x: any) => x.id === id)
      if (o)
        await markPaid(o)
    }
    selected.value = new Set()
  }
  finally {
    bulking.value = false
  }
}
async function bulkCancel() {
  if (bulking.value)
    return
  bulking.value = true
  try {
    const ids = [...selected.value]
    for (const id of ids) {
      const o = orders.value.find((x: any) => x.id === id)
      if (o)
        await cancelOrder(o)
    }
    selected.value = new Set()
  }
  finally {
    bulking.value = false
  }
}

// Client-side CSV export of the currently SELECTED orders from in-memory rows.
// Previously this just toasted "Exporting N orders…" without doing anything —
// the BE export endpoint hasn't shipped, so the toast was a lie. Until BE ships
// a /orders/export endpoint that can stream all matching rows, this gives users
// a real (if scoped to the current page selection) CSV.
function onBulkExport() {
  const ids = Array.from(selected.value)
  const rows = orders.value.filter((o: any) => ids.includes(o.id))
  if (!rows.length) {
    notify(t('Nothing to export yet'), 'warning')
    return
  }

  const cols: Array<[string, (o: any) => any]> = [
    ['ID', o => o.order_number ?? o.display_id ?? o.id],
    ['Created', o => o.created_at],
    ['Status', o => o.status],
    ['Type', o => o.order_type],
    ['Cashier', o => o.cashier?.name ?? ''],
    ['Total', o => o.total_amount],
    ['Paid', o => o.is_paid ? '1' : '0'],
    ['Payment', o => o.payment_method ?? ''],
    ['Items', o => o.items_count ?? (o.items?.length ?? '')],
  ]

  const csv = buildCsv([
    cols.map(column => column[0]),
    ...rows.map(order => cols.map(column => column[1](order))),
  ], { alwaysQuote: true })

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 10)

  a.href = url
  a.download = `orders-${stamp}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  notify(t('Exported {n} orders', { n: rows.length }), 'success')
}

function orderSortValue(order: any, key: string) {
  switch (key) {
    case 'id': return order.order_number ?? order.display_id ?? 0
    case 'total': return Number(order.total_amount) || 0
    case 'at': return new Date(order.created_at).getTime()
    case 'prep': return order.preparation?.elapsedSeconds
    default: return order[key]
  }
}

const sortedOrders = computed(() => {
  const arr = [...orders.value]
  const k = sortKey.value
  const dir = sortDir.value === 'asc' ? 1 : -1

  arr.sort((a: any, b: any) => {
    const av = orderSortValue(a, k)
    const bv = orderSortValue(b, k)
    if (av == null)
      return 1
    if (bv == null)
      return -1
    if (av < bv)
      return -1 * dir
    if (av > bv)
      return 1 * dir
    return 0
  })
  return arr
})

// ---- filter chips ----
const hasFilters = computed(() =>
  !!(search.value || statusFilter.value.length || paymentFilter.value || dateFrom.value || dateTo.value
    || orderTypeFilter.value || cashierFilter.value || categoryFilter.value.length || productFilter.value.length),
)

function clearAll() {
  search.value = ''
  statusFilter.value = []
  paymentFilter.value = undefined
  dateRange.value = { from: '', to: '', preset: 'all' }
  orderTypeFilter.value = undefined
  cashierFilter.value = undefined
  categoryFilter.value = []
  productFilter.value = []
}
function cashierLabel(id: string | undefined) {
  if (!id)
    return ''
  return cashierOptions.value.find(o => o.value === id)?.label ?? id
}
function categoryLabel(id: string) {
  return categoryOptions.value.find(o => o.value === id)?.label ?? id
}
function productLabel(id: string) {
  return productOptions.value.find(o => o.value === id)?.label ?? id
}

// ---- formatters ----
function infoOf(o: any) {
  const ph = (o.phone_number && o.phone_number !== '+998') ? o.phone_number : null
  return ph || o.description || '—'
}
function itemsOf(o: any) {
  return o.items_count ?? o.items?.length ?? '—'
}

function prepElapsedLabel(preparation: OrderPreparation): string {
  return `${preparation.elapsedMinutes} ${t('time_minute_short')}`
}
function prepTargetLabel(preparation: OrderPreparation): string {
  if (!preparation.target)
    return t('prep_status_UNTRACKED')
  return formatPreparationTarget(preparation.target, t('time_minute_short'))
}
function prepAriaLabel(preparation: OrderPreparation): string {
  return t('prep_time_status_tooltip', {
    elapsed: prepElapsedLabel(preparation),
    status: t(`prep_status_${preparation.status}`),
    target: prepTargetLabel(preparation),
  })
}

// ---- DataTable columns ----
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'id', label: t('Order #'), sortable: true },
  { key: 'type', label: t('Type') },
  { key: 'info', label: t('Info') },
  { key: 'customer', label: t('Customer') },
  { key: 'cashier', label: t('Cashier') },
  { key: 'status', label: t('Status'), sortable: true },
  { key: 'prep', label: t('Prep Time'), sortable: true, align: 'right', width: 126 },
  { key: 'payment', label: t('Payment') },
  { key: 'total', label: t('Total'), sortable: true, align: 'right' },
  { key: 'items', label: t('Items'), align: 'right' },
  { key: 'at', label: t('Date'), sortable: true, align: 'right' },
  { key: 'paid_at', label: t('Paid at'), align: 'right' },
])

// Bridge our internal sort state to DataTable's sort prop
const dtSort = computed(() => ({
  key: sortKey.value === 'id'
    ? 'id'
    : sortKey.value === 'total'
      ? 'total'
      : sortKey.value === 'at' ? 'at' : sortKey.value === 'status' ? 'status' : sortKey.value,
  dir: sortDir.value,
}))

function onDtSort(s: { key: string | null; dir: 'asc' | 'desc' }) {
  if (!s.key)
    return
  sortKey.value = s.key
  sortDir.value = s.dir
}

// Selection sync with DataTable
function onDtSelection(next: Set<string | number>) {
  selected.value = next
}

// Pagination passthrough
const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: totalOrders.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const noResultsMsg = computed(() => t('No orders match your filters'))
const noResultsSub = computed(() => t('Adjust the search, status or date range to see results.'))

// ---- Stats-level payment breakdown ----
// BE shape (per /orders/stats): payment_breakdown: { CASH: '<dec>', CARD: '<dec>', DIGITAL: '<dec>' }
// Adapt flat object to PaymentBreakdown's Array<{ type, amount }> shape.
const statsPaymentMethods = computed(() => {
  const pb = stats.value?.payment_breakdown
  if (!pb || typeof pb !== 'object')
    return []
  const out: Array<{ type: string; amount: number }> = []
  for (const [k, v] of Object.entries(pb)) {
    const amount = Number(v) || 0
    if (amount > 0)
      out.push({ type: k, amount })
  }
  return out
})

const statsPaymentTotal = computed(() =>
  statsPaymentMethods.value.reduce((a, m) => a + m.amount, 0),
)

// ---- OrdersInsights bridge ----
// Click a status segment/legend: toggle membership in the multi-status array.
function onStatusToggle(s: string) {
  if (statusFilter.value.includes(s))
    statusFilter.value = statusFilter.value.filter(x => x !== s)
  else
    statusFilter.value = [...statusFilter.value, s]
}

// Click a payment legend: set, or clear if already that value.
function onPaymentToggle(p: string) {
  paymentFilter.value = paymentFilter.value === p ? undefined : p
}
</script>

<template>
  <div class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('Orders')"
      :subtitle="t('Track, settle and reconcile every order')"
    />

    <!-- KPI strip -->
    <div
      class="grid cols-4 kpi-grid"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi
        :data="{
          label: t('Total'),
          icon: 'receipt',
          tone: 'primary',
          value: stats ? (stats.total_orders ?? 0) : null,
        }"
      />
      <Kpi
        :data="{
          label: t('Preparing'),
          icon: 'clock',
          tone: 'warning',
          value: stats ? (stats.preparing_orders ?? 0) : null,
        }"
      />
      <Kpi
        :data="{
          label: t('Ready'),
          icon: 'check',
          tone: 'success',
          value: stats ? (stats.ready_orders ?? 0) : null,
        }"
      />
      <Kpi
        :data="{
          label: t('Revenue'),
          icon: 'dollar',
          tone: 'info',
          money: true,
          value: stats ? (stats.total_revenue ?? 0) : null,
        }"
      />
    </div>

    <!-- Insights strip (additive port from v3) -->
    <OrdersInsights
      v-if="!loading && orders.length"
      :orders="orders"
      :status="statusFilter"
      :payment="paymentFilter"
      :status-counts="stats?.status_counts ?? null"
      :payment-counts="paymentStatusCounts"
      :payment-methods="statsPaymentMethods"
      :payment-total="statsPaymentTotal"
      @status="onStatusToggle"
      @payment="onPaymentToggle"
    />

    <!-- Main table card -->
    <div class="card">
      <!-- Toolbar -->
      <div
        class="toolbar orders-toolbar"
        :class="{ 'is-open': filterPanelOpen }"
      >
        <div class="grow tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search orders...')"
            :aria-label="t('Search orders')"
          />
        </div>

        <button
          type="button"
          class="orders-filter-toggle"
          :aria-expanded="filterPanelOpen"
          @click="filterPanelOpen = !filterPanelOpen"
        >
          <DesignIcon
            name="filter"
            :size="18"
          />{{ t('Filters') }}<span v-if="hasFilters" />
        </button>
        <div class="tb-filter tb-filter--md">
          <MultiSelect
            :model-value="statusFilter"
            :options="orderStatuses.map(value => ({ value, label: t(`order_status_${value}`) }))"
            :placeholder="t('Filter by Status')"
            @update:model-value="statusFilter = $event.map(String)"
          />
        </div>

        <!-- Order type (HALL / DELIVERY / PICKUP) -->
        <div class="tb-filter tb-filter--xs">
          <Select
            :model-value="orderTypeFilter ?? ''"
            :placeholder="t('Order type')"
            :options="orderTypes.map(o => ({ value: o, label: t(`order_type_${o}`) }))"
            @update:model-value="(v: string) => orderTypeFilter = v ? v : undefined"
          />
        </div>

        <!-- Cashier -->
        <div class="tb-filter tb-filter--sm">
          <Select
            :model-value="cashierFilter ?? ''"
            :placeholder="t('All cashiers')"
            :options="cashierOptions"
            @update:model-value="(v: string) => cashierFilter = v ? v : undefined"
          />
        </div>

        <div class="tb-filter tb-filter--md">
          <MultiSelect
            :model-value="categoryFilter"
            :options="categoryOptions"
            :placeholder="t('All categories')"
            @update:model-value="categoryFilter = $event.map(String)"
          />
        </div>
        <div class="tb-filter tb-filter--md">
          <MultiSelect
            :model-value="productFilter"
            :options="productOptions"
            :placeholder="t('All products')"
            @update:model-value="productFilter = $event.map(String)"
          />
        </div>
      </div>

      <!-- Compact filter strip: single date range popover + payment segmented control -->
      <div
        class="filterstrip"
        :class="{ 'is-open': filterPanelOpen }"
      >
        <div class="filterstrip__group">
          <span class="filterstrip__lbl">{{ t('Period') }}</span>
          <DateRangePicker
            v-model="dateRange"
            align="left"
            :placeholder="t('All time')"
          />
        </div>

        <div class="filterstrip__group">
          <span class="filterstrip__lbl">{{ t('Payment') }}</span>
          <div class="segctl">
            <button
              type="button"
              class="segctl__btn"
              :class="{ 'is-active': !paymentFilter }"
              @click="paymentFilter = undefined"
            >
              {{ t('All') }}
            </button>
            <button
              v-for="p in paymentStatuses"
              :key="p"
              type="button"
              class="segctl__btn"
              :class="{ 'is-active': paymentFilter === p }"
              @click="paymentFilter = p"
            >
              {{ t(`payment_status_${p}`) }}
            </button>
          </div>
        </div>
      </div>

      <!-- Active filter chips -->
      <div
        v-if="hasFilters"
        class="toolbar"
        style="padding-top: var(--sp-3);"
      >
        <div class="chips">
          <span
            class="tertiary"
            style="font-size: 13px; margin-right: 2px;"
          >{{ t('Filters') }}:</span>

          <span
            v-if="search"
            class="chip"
          >
            <span>{{ t('Search') }}: <b>{{ search }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="search = ''"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-for="s in statusFilter"
            :key="s"
            class="chip"
          >
            <span>{{ t('Status') }}: <b>{{ t(`order_status_${s}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="statusFilter = statusFilter.filter(x => x !== s)"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-if="paymentFilter"
            class="chip"
          >
            <span>{{ t('Payment') }}: <b>{{ t(`payment_status_${paymentFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="paymentFilter = undefined"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-if="orderTypeFilter"
            class="chip"
          >
            <span>{{ t('Type') }}: <b>{{ t(`order_type_${orderTypeFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="orderTypeFilter = undefined"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-if="cashierFilter"
            class="chip"
          >
            <span>{{ t('Cashier') }}: <b>{{ cashierLabel(cashierFilter) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="cashierFilter = undefined"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-for="cid in categoryFilter"
            :key="`cat-${cid}`"
            class="chip"
          >
            <span>{{ t('Category') }}: <b>{{ categoryLabel(cid) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="categoryFilter = categoryFilter.filter(x => x !== cid)"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-for="pid in productFilter"
            :key="`prod-${pid}`"
            class="chip"
          >
            <span>{{ t('Product') }}: <b>{{ productLabel(pid) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="productFilter = productFilter.filter(x => x !== pid)"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-if="dateFrom"
            class="chip"
          >
            <span>{{ t('Date from') }}: <b>{{ dateFrom }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="dateFrom = ''"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <span
            v-if="dateTo"
            class="chip"
          >
            <span>{{ t('Date to') }}: <b>{{ dateTo }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="dateTo = ''"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>

          <button
            class="chip--clear"
            @click="clearAll"
          >
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <!-- DataTable: sortable / selectable / expandable, server-paginated -->
      <DataTable
        :columns="columns"
        :rows="sortedOrders"
        row-key="id"
        :loading="loading"
        selectable
        expandable
        mobile-cards
        :mobile-summary="['status', 'total', 'type', 'payment']"
        :sort="dtSort"
        :selection="selected"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
        @sort="onDtSort"
        @update:selection="onDtSelection"
      >
        <!-- Order # -->
        <template #cell.id="{ row: o }">
          <span class="cell-strong mono">#{{ o.order_number ?? o.display_id ?? '—' }}</span>
        </template>

        <!-- Type -->
        <template #cell.type="{ row: o }">
          <Badge :tone="tone(o.order_type) as any">
            {{ o.order_type ? t(`order_type_${o.order_type}`) : '—' }}
          </Badge>
        </template>

        <!-- Info -->
        <template #cell.info="{ row: o }">
          <span class="cell-muted">{{ infoOf(o) }}</span>
        </template>

        <!-- Customer -->
        <template #cell.customer="{ row: o }">
          <span class="cell-muted">{{ o.customer?.name ?? o.phone_number ?? '—' }}</span>
        </template>

        <!-- Cashier -->
        <template #cell.cashier="{ row: o }">
          <span class="cell-muted">{{ o.cashier?.name ?? '—' }}</span>
        </template>

        <!-- Status with dot -->
        <template #cell.status="{ row: o }">
          <Badge
            :tone="tone(o.status) as any"
            dot
          >
            {{ o.status ? t(`order_status_${o.status}`) : '—' }}
          </Badge>
        </template>

        <!-- Preparation time from order creation until it was marked ready -->
        <template #cell.prep="{ row: o }">
          <div
            v-if="o.preparation"
            class="prep-time"
          >
            <Badge
              class="prep-time-badge"
              :tone="o.preparation.tone"
              :title="prepAriaLabel(o.preparation)"
              :aria-label="prepAriaLabel(o.preparation)"
            >
              <span class="mono">{{ prepElapsedLabel(o.preparation) }}</span>
            </Badge>
            <span
              class="prep-time__target"
              :class="{ 'prep-time__target--unknown': !o.preparation.target }"
              :title="prepAriaLabel(o.preparation)"
            >
              <template v-if="o.preparation.target">≤ {{ prepTargetLabel(o.preparation) }}</template>
              <template v-else>{{ prepTargetLabel(o.preparation) }}</template>
            </span>
          </div>
          <span
            v-else
            class="cell-muted"
          >—</span>
        </template>

        <!-- Payment -->
        <template #cell.payment="{ row: o }">
          <Badge :tone="o.is_paid ? 'success' : 'error'">
            {{ t(`payment_status_${o.is_paid ? 'PAID' : 'UNPAID'}`) }}
          </Badge>
        </template>

        <!-- Paid at -->
        <template #cell.paid_at="{ row: o }">
          <span class="mono cell-muted nowrap">{{ o.paid_at ? formatDate(o.paid_at) : '—' }}</span>
        </template>

        <!-- Total -->
        <template #cell.total="{ row: o }">
          <span class="mono cell-strong">{{ formatCurrency(o.total_amount ?? 0) }}</span>
        </template>

        <!-- Items -->
        <template #cell.items="{ row: o }">
          <span class="mono cell-muted">{{ itemsOf(o) }}</span>
        </template>

        <!-- Date -->
        <template #cell.at="{ row: o }">
          <span class="mono cell-muted nowrap">{{ formatDate(o.created_at) }}</span>
        </template>

        <!-- Bulk actions -->
        <template #bulk-actions>
          <Button
            variant="secondary"
            size="sm"
            icon="dollar"
            :loading="bulking"
            :disabled="bulking"
            @click="openConfirm('pay-bulk')"
          >
            {{ t('Mark paid') }}
          </Button>
          <Button
            variant="danger-soft"
            size="sm"
            icon="close"
            :loading="bulking"
            :disabled="bulking"
            @click="openConfirm('cancel-bulk')"
          >
            {{ t('Cancel') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="download"
            @click="onBulkExport"
          >
            {{ t('Export') }}
          </Button>
        </template>

        <!-- Inline row actions -->
        <template #row-actions="{ row: o }">
          <IconAction
            v-if="(o.status === 'OPEN' || o.status === 'PREPARING')"
            icon="check"
            tone="warning"
            :title="t('Mark ready')"
            :disabled="actingOnId === o.id"
            @click="markReady(o)"
          />
          <IconAction
            v-if="!o.is_paid && o.status !== 'CANCELED'"
            icon="dollar"
            tone="success"
            :title="t('Pay')"
            :disabled="actingOnId === o.id"
            @click="openConfirm('pay-one', o)"
          />
          <IconAction
            v-if="o.is_paid && o.status !== 'CANCELED'"
            icon="refresh"
            tone="primary"
            :title="t('Reverse payment')"
            :disabled="actingOnId === o.id"
            @click="openConfirm('unpay-one', o)"
          />
          <IconAction
            v-if="o.status !== 'CANCELED' && o.status !== 'COMPLETED'"
            icon="close"
            tone="danger"
            :title="t('Cancel')"
            :disabled="actingOnId === o.id"
            @click="openConfirm('cancel-one', o)"
          />
        </template>

        <!-- Expanded row: order items (compact) -->
        <template #expanded="{ row: o }">
          <div class="oitems">
            <div class="oitems__head">
              <span class="oitems__title">{{ t('Order Items') }}</span>
              <span
                v-if="o.items?.length"
                class="oitems__count"
              >{{ o.items.length }}</span>
            </div>
            <div
              v-if="o.items?.length"
              class="oitems__list"
            >
              <div
                v-for="(li, i) in ((o.items ?? []) as any[])"
                :key="i"
                class="oitems__item"
              >
                <span class="oitems__qty">{{ li.quantity ?? 1 }}×</span>
                <span
                  class="oitems__name"
                  :title="li.product__name ?? ''"
                >{{ li.product__name ?? '—' }}</span>
                <span class="oitems__unit">{{ formatCurrency(li.price ?? 0) }}</span>
                <span class="oitems__sub">{{ formatCurrency((Number(li.price) || 0) * (li.quantity ?? 1)) }}</span>
              </div>
            </div>
            <div
              v-else
              class="oitems__empty"
            >
              {{ t('No items') }}
            </div>
          </div>

          <!-- Per-method payment breakdown (additive port from v3) -->
          <div
            v-if="o.is_paid && o.payments?.length"
            class="orders-paybreak-wrap"
          >
            <PaymentBreakdown
              :methods="o.payments"
              :total="Number(o.total_amount) || 0"
            />
          </div>
        </template>

        <!-- Empty state -->
        <template #empty>
          <StateFill
            icon="receipt"
            :title="noResultsMsg"
            :sub="noResultsSub"
          >
            <div
              v-if="hasFilters"
              style="margin-top: 12px;"
            >
              <Button
                variant="secondary"
                @click="clearAll"
              >
                {{ t('Clear filters') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </div>

    <!-- Confirm action modal (cancel / mark paid, single or bulk) -->
    <Modal
      :open="confirmDialog !== null"
      :width="440"
      class="confirm-modal"
      :title="confirmDialog?.kind === 'cancel-one' ? t('Cancel this order?')
        : confirmDialog?.kind === 'cancel-bulk' ? t('Cancel selected orders?')
          : confirmDialog?.kind === 'pay-one' ? t('Mark this order as paid?')
            : confirmDialog?.kind === 'unpay-one' ? t('Reverse this payment?')
              : t('Mark selected orders as paid?')"
      :subtitle="(confirmDialog?.kind === 'cancel-one' || confirmDialog?.kind === 'cancel-bulk')
        ? t('This action cannot be undone')
        : confirmDialog?.kind === 'unpay-one'
          ? t('Payment will be reversed and the drawer adjusted.')
          : t('Payment status will change immediately.')"
      @close="closeConfirm"
    >
      <div
        v-if="confirmDialog"
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon"
          :class="(confirmDialog.kind === 'cancel-one' || confirmDialog.kind === 'cancel-bulk') ? 't-error'
            : confirmDialog.kind === 'unpay-one' ? 't-warning' : 't-success'"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p
            v-if="confirmDialog.order"
            style="margin:0;font-weight:600;"
          >
            #{{ confirmDialog.order.order_number ?? confirmDialog.order.display_id ?? '—' }}
            · {{ formatCurrency(confirmDialog.order.total_amount ?? 0) }}
          </p>
          <p
            v-else
            style="margin:0;font-weight:600;"
          >
            {{ t('{count} selected', { count: selected.size }) }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            <template v-if="confirmDialog.kind === 'cancel-one' || confirmDialog.kind === 'cancel-bulk'">
              {{ t('Cancelling may require a refund and impact the customer.') }}
            </template>
            <template v-else-if="confirmDialog.kind === 'unpay-one'">
              {{ t('The cash leg returns to the drawer and stock is restored.') }}
            </template>
            <template v-else>
              {{ t('No refund flow will be triggered.') }}
            </template>
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          :disabled="bulking || actingOnId !== null"
          @click="closeConfirm"
        >
          {{ t('Close') }}
        </Button>
        <Button
          v-if="confirmDialog?.kind === 'cancel-one'"
          variant="danger"
          :loading="actingOnId !== null"
          :disabled="actingOnId !== null"
          @click="confirmCancelOne"
        >
          {{ t('Cancel order') }}
        </Button>
        <Button
          v-else-if="confirmDialog?.kind === 'cancel-bulk'"
          variant="danger"
          :loading="bulking"
          :disabled="bulking"
          @click="confirmCancelBulk"
        >
          {{ t('Cancel orders') }}
        </Button>
        <Button
          v-else-if="confirmDialog?.kind === 'unpay-one'"
          variant="secondary"
          :loading="actingOnId !== null"
          :disabled="actingOnId !== null"
          @click="confirmUnpayOne"
        >
          {{ t('Reverse payment') }}
        </Button>
        <Button
          v-else-if="confirmDialog?.kind === 'pay-one'"
          variant="primary"
          :loading="actingOnId !== null"
          :disabled="actingOnId !== null"
          @click="confirmPayOne"
        >
          {{ t('Mark paid') }}
        </Button>
        <Button
          v-else
          variant="primary"
          :loading="bulking"
          :disabled="bulking"
          @click="confirmPayBulk"
        >
          {{ t('Mark paid') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.orders-filter-toggle { display: none; }
@media (max-width: 700px) {
  .orders-filter-toggle { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 9px; font-size: 12px; }
  .orders-filter-toggle > span { width: 5px; height: 5px; border-radius: 50%; background: var(--primary); }
  .orders-filter-toggle[aria-expanded="true"] { background: var(--primary-weak); border-color: var(--primary-border); }
  .orders-toolbar .tb-search { flex: 1; min-width: 0; }
  .orders-toolbar:not(.is-open) .tb-filter, .filterstrip:not(.is-open) { display: none; }
}

/* Layout-only safeguards. All visual styling comes from
   src/styles/design-shell.css (verbatim ported alpha-design-system.css). */
.row {
  display: flex;
  align-items: center;
}

/* Compact filter strip — segmented controls for date + payment */
.filterstrip {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.filterstrip--date {
  padding-top: 10px;
  padding-bottom: 14px;
}
.filterstrip__group {
  display: flex;
  align-items: center;
  gap: 10px;
}
.filterstrip__lbl {
  font-size: var(--fs-micro);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
  color: var(--text-tertiary);
}
.segctl {
  display: inline-flex;
  background: var(--surface-inset);
  border-radius: var(--r-sm);
  padding: 3px;
  gap: 2px;
}
.segctl__btn {
  border: none;
  background: transparent;
  padding: 6px 12px;
  border-radius: 6px;
  font-family: inherit;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background .12s, color .12s;
  white-space: nowrap;
}
.segctl__btn:hover:not(.is-active) {
  color: var(--text);
}
.segctl__btn.is-active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-xs);
  font-weight: var(--fw-semibold);
}
@media (max-width: 768px) {
  .filterstrip { gap: 12px; padding: 10px 14px; }
  .filterstrip__group { flex: 1 1 100%; flex-direction: column; align-items: flex-start; gap: 6px; }
  .segctl { overflow-x: auto; max-width: 100%; }
  .segctl__btn { padding: 6px 10px; }
}

/* --- Responsive toolbar --- */
.orders-toolbar {
  flex-wrap: wrap;
  row-gap: 8px;
}

.tb-search {
  max-width: 280px;
  min-width: 220px;
  flex: 1 1 220px;
}

.tb-filter {
  flex: 0 1 auto;
}

.tb-filter--md { width: 200px; }
.tb-filter--sm { width: 180px; }
.tb-filter--xs { width: 160px; }

.tb-daterange {
  margin-left: auto;
  flex-wrap: wrap;
}

.tb-date {
  width: 160px;
}

/* --- Tablet collapse --- */
@media (max-width: 1100px) {
  .tb-daterange {
    margin-left: 0;
  }
}

/* --- Intermediate tablet: shrink fixed filter widths so toolbar doesn't overflow narrow tablets (769-899px) --- */
@media (max-width: 900px) {
  .tb-filter--md { width: 160px; }
  .tb-filter--sm { width: 140px; }
  .tb-filter--xs { width: 120px; }
  .tb-date { width: 140px; }
}

/* --- Mobile collapse (canonical 768px phone breakpoint) --- */
@media (max-width: 768px) {
  .orders-toolbar > * {
    width: 100%;
    max-width: 100%;
    flex: 1 1 100%;
  }

  .tb-search,
  .tb-filter,
  .tb-filter--md,
  .tb-filter--sm,
  .tb-filter--xs {
    width: 100%;
    max-width: 100%;
  }

  .tb-daterange {
    width: 100%;
    margin-left: 0;
  }

  .tb-date {
    flex: 1 1 calc(50% - 16px);
    width: auto;
  }
}

/* --- KPI grid responsive collapse --- */
@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

/* Keep 2-up down to small-phone breakpoint (420px) per canonical spec; collapse to 1-col only below */
@media (max-width: 420px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

/* --- Expanded row: compact order items --- */
.oitems {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--r-md, 10px);
  padding: 8px 10px;
}
.oitems__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-block-end: 6px;
}
.oitems__title {
  font-size: var(--fs-label, 11px);
  text-transform: uppercase;
  letter-spacing: var(--tracking-label, 0.04em);
  font-weight: 700;
  color: var(--text-tertiary);
}
.oitems__count {
  font: 600 11px/1 var(--font-mono);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 99px;
  padding: 2px 7px;
  color: var(--text-secondary);
}
.oitems__list { display: flex; flex-direction: column; }
.oitems__item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto auto;
  align-items: baseline;
  gap: 12px;
  padding: 5px 8px;
  border-radius: 7px;
  font-size: 13px;
}
.oitems__item:nth-child(odd) { background: var(--surface); }
.oitems__qty { font: 600 12px/1.3 var(--font-mono); color: var(--primary); }
.oitems__name {
  font-weight: 500;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oitems__unit {
  font: 12px/1.3 var(--font-mono);
  color: var(--text-tertiary);
  white-space: nowrap;
}
.oitems__sub {
  font: 600 13px/1.3 var(--font-mono);
  color: var(--text);
  text-align: right;
  min-width: 78px;
  white-space: nowrap;
}
.oitems__empty {
  padding: 8px;
  text-align: center;
  font-size: 13px;
  color: var(--text-tertiary);
}

@media (max-width: 700px) {
  .oitems__item { grid-template-columns: 24px minmax(0, 1fr) auto; gap: 6px 8px; padding-block: 9px; }
  .oitems__name { grid-column: 2 / -1; white-space: normal; overflow-wrap: anywhere; }
  .oitems__unit { grid-column: 2; }
  .oitems__sub { min-width: 0; }
}

.prep-time {
  display: grid;
  justify-items: end;
  gap: 4px;
  min-width: 72px;
}
:deep(.prep-time-badge) {
  min-width: 58px;
  justify-content: center;
  font-feature-settings: "tnum" 1;
}
.prep-time__target {
  max-width: 116px;
  overflow: hidden;
  color: var(--text-tertiary);
  font: 500 var(--fs-micro)/1.1 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prep-time__target--unknown {
  font-family: var(--font-ui);
}

/* --- Modal mobile safety --- */
:deep(.confirm-modal .modal__panel),
:deep(.confirm-modal .modal) {
  max-width: calc(100vw - 24px);
}

/* --- Expanded row: payment breakdown wrapper --- */
.orders-paybreak-wrap {
  margin-block-start: var(--sp-4);
  max-width: 480px;
}
@media (max-width: 768px) {
  .orders-paybreak-wrap { max-width: 100%; }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
