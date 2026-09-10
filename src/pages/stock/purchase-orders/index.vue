<script setup lang="ts">
/* ============================================================
   PURCHASE ORDERS — list, create, lifecycle actions
   Refactored to design primitives: PageHeader, Card, DataTable,
   Modal, Input, Select, Button, IconAction, Badge. All UI strings
   are routed through t(). Toolbar wraps; filters drop to a single
   column under 900px. Expanded row shows order line items.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { stockApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import { useStateAction } from '@/composables/useStateAction'
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()

const orders = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const statusFilter = ref<string>('')
const paymentFilter = ref<string>('')
const supplierFilter = ref<string>('')
const dateFrom = ref<string>('')
const dateTo = ref<string>('')

const suppliersList = ref<any[]>([])
const locationsList = ref<any[]>([])

// Create dialog
const createDialog = ref(false)
const saving = ref(false)

const form = ref({
  supplier_id: '' as string | number,
  delivery_location_id: '' as string | number,
  order_date: new Date().toISOString().substring(0, 10),
  expected_date: '',
  currency: 'UZS',
  notes: '',
})

const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency, formatDateShort } = useFormatters()
const { hasPermission, isAdministrator } = useUserAccess()
const canManagePurchaseOrders = computed(() => hasPermission('stock.manage'))
const canCreateReceiving = computed(() => hasPermission('stock.receiving.create'))

// Status / payment tone maps for Badge
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  DRAFT: 'neutral',
  SENT: 'info',
  CONFIRMED: 'primary',
  PARTIAL: 'warning',
  RECEIVED: 'success',
  CANCELED: 'error',
}

const PAYMENT_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  UNPAID: 'error',
  PARTIAL: 'warning',
  PAID: 'success',
}

const statusOptions = computed(() =>
  ['DRAFT', 'SENT', 'CONFIRMED', 'PARTIAL', 'RECEIVED', 'CANCELED'].map(s => ({ value: s, label: t(`po_status_${s}`) })),
)

const paymentStatusOptions = computed(() =>
  ['UNPAID', 'PARTIAL', 'PAID'].map(s => ({ value: s, label: t(`po_payment_${s}`) })),
)

// Backend stores currency as a 3-char code (default UZS). Offer the codes an
// operator here actually deals with instead of a free-text box that can be typo'd.
const currencyOptions = ['UZS', 'USD', 'EUR', 'RUB'].map(c => ({ value: c, label: c }))

// Active-filter awareness — drives the clear-filters control, the filter chips,
// and a context-aware empty state (mirrors the sibling Receiving page).
const hasFilters = computed(() =>
  !!(search.value || statusFilter.value || paymentFilter.value || supplierFilter.value || dateFrom.value || dateTo.value),
)

function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  paymentFilter.value = ''
  supplierFilter.value = ''
  dateFrom.value = ''
  dateTo.value = ''
}

function supplierLabel(id: string) {
  return suppliersList.value.find(s => String(s.id) === String(id))?.name ?? id
}

const columns: DataTableColumn<any>[] = [
  { key: 'order_number', label: t('po_col_order_number'), sortable: false },
  { key: 'supplier_name', label: t('Supplier'), sortable: false },
  { key: 'status', label: t('Status'), sortable: false, width: 140 },
  { key: 'total', label: t('Total'), sortable: false, align: 'right', width: 140 },
  { key: 'order_date', label: t('Date'), sortable: false, width: 130 },
]

// Detail cache: list endpoint returns serialize_brief (no items / delivery_location /
// expected_date), so the expand row must fetch the full detail per id.
const detailCache = ref<Record<string | number, any>>({})
const detailLoading = ref<Record<string | number, boolean>>({})

async function ensureDetail(row: any) {
  if (!row?.id)
    return
  if (detailCache.value[row.id] || detailLoading.value[row.id])
    return
  detailLoading.value[row.id] = true
  try {
    const res = await axios.get(`/purchase-orders/${row.id}/`)
    const d = res.data?.data ?? res.data

    detailCache.value[row.id] = d?.order ?? d
  }
  catch {
    /* ignore — expanded row will show fallback dashes */
  }
  finally {
    detailLoading.value[row.id] = false
  }
}

async function loadOrders() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (statusFilter.value)
      params.status = statusFilter.value
    if (paymentFilter.value)
      params.payment_status = paymentFilter.value
    if (supplierFilter.value)
      params.supplier_id = supplierFilter.value
    if (dateFrom.value)
      params.date_from = dateFrom.value
    if (dateTo.value)
      params.date_to = dateTo.value

    const res = await axios.get('/purchase-orders/', { params })
    const d = res.data?.data ?? res.data

    orders.value = d?.orders ?? []
    total.value = d?.pagination?.total ?? orders.value.length

    // Invalidate the per-row detail cache whenever the list reloads, so
    // expanded rows refetch fresh detail after pagination/filter changes.
    detailCache.value = {}
  }
  catch {
    notify(t('Failed to load purchase orders'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadMeta() {
  try {
    const [suppRes, locRes] = await Promise.all([
      axios.get('/suppliers/', { params: { per_page: 200, is_active: true } }),
      axios.get('/locations/', { params: { per_page: 200 } }),
    ])

    const suppD = suppRes.data?.data ?? suppRes.data
    const locD = locRes.data?.data ?? locRes.data

    suppliersList.value = suppD?.suppliers ?? []
    locationsList.value = locD?.locations ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => { loadOrders(); loadMeta() })
watch([page, itemsPerPage], loadOrders)
watch([statusFilter, paymentFilter, supplierFilter, dateFrom, dateTo], () => { page.value = 1; loadOrders() })

const debouncedSearch = useDebounceFn(() => {
  page.value = 1
  loadOrders()
}, 400)

watch(search, debouncedSearch)

const supplierOptions = computed(() => suppliersList.value.map(s => ({ value: String(s.id), label: s.name })))
const locationOptions = computed(() => locationsList.value.map(l => ({ value: String(l.id), label: l.name })))

async function createOrder() {
  // The backend requires BOTH a supplier and a delivery location (it 404s with
  // "Supplier not found" otherwise), so validate supplier up front instead of
  // letting a confusing server error surface.
  if (!form.value.supplier_id) {
    notify(t('Supplier is required'), 'error')

    return
  }
  if (!form.value.delivery_location_id) {
    notify(t('Delivery location is required'), 'error')

    return
  }
  if (form.value.expected_date && form.value.expected_date < form.value.order_date) {
    notify(t('po_expected_before_order'), 'error')

    return
  }
  saving.value = true
  try {
    const payload: any = {
      ...form.value,
      supplier_id: form.value.supplier_id ? Number(form.value.supplier_id) : null,
      delivery_location_id: form.value.delivery_location_id ? Number(form.value.delivery_location_id) : null,
    }

    if (!payload.expected_date)
      delete payload.expected_date
    if (!payload.notes)
      delete payload.notes
    if (!payload.supplier_id)
      delete payload.supplier_id
    await axios.post('/purchase-orders/', payload)
    notify(t('Purchase order created'))
    createDialog.value = false
    await loadOrders()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error creating order'), 'error')
  }
  finally {
    saving.value = false
  }
}

function openCreate() {
  form.value = {
    supplier_id: '',
    delivery_location_id: '',
    order_date: new Date().toISOString().substring(0, 10),
    expected_date: '',
    currency: 'UZS',
    notes: '',
  }
  createDialog.value = true
}

const { actionDialog, actionItem, actionType, actioning, openAction, doAction } = useStateAction('/purchase-orders/', loadOrders, notify, t, axios)

const actionTitle = computed(() => {
  switch (actionType.value) {
    case 'send': return t('po_action_send_title')
    case 'confirm': return t('po_action_confirm_title')
    case 'cancel': return t('po_action_cancel_title')
    case 'receive': return t('po_action_receive_title')
    default: return t('Confirm')
  }
})

// Receiving goods is a dedicated multi-step flow (create receiving → add lines →
// complete) that lives on its own page. The PO action endpoint only supports
// send/confirm/cancel, so route the operator to the Receiving page rather than
// firing a POST the backend rejects as an unknown action.
function goReceive(item: any) {
  router.push({ path: '/stock/receiving', query: { po: String(item.id) } })
}

function recordAllows(item: any, action: string, fallback: boolean) {
  return Array.isArray(item?.allowed_actions) ? item.allowed_actions.map(String).includes(action) : fallback
}
function canSend(item: any) { return isAdministrator.value && item.status === 'DRAFT' && recordAllows(item, 'send', true) }
function canConfirm(item: any) { return isAdministrator.value && item.status === 'SENT' && recordAllows(item, 'confirm', true) }
function canReceive(item: any) { return canCreateReceiving.value && ['CONFIRMED', 'PARTIAL'].includes(item.status) && recordAllows(item, 'receive', true) }
function canCancel(item: any) { return isAdministrator.value && !['RECEIVED', 'CANCELED'].includes(item.status) && recordAllows(item, 'cancel', true) }

const pagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (n: number) => { page.value = n },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

// Esc closes whichever modal is open (handled by Modal closeOnEsc already, plus action modal)
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Purchase Orders')"
      :subtitle="t('po_page_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canManagePurchaseOrders"
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('New Order') }}
        </Button>
      </template>
    </PageHeader>

    <Card>
      <!-- Toolbar — wraps; controls collapse to 1 column under 900px -->
      <div class="po-toolbar">
        <div class="po-tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search orders...')"
          />
        </div>
        <div class="po-tb-cell">
          <Select
            v-model="statusFilter"
            icon="filter"
            :placeholder="t('All Statuses')"
            :options="statusOptions"
          />
        </div>
        <div class="po-tb-cell">
          <Select
            v-model="paymentFilter"
            icon="wallet"
            :placeholder="t('Payment Status')"
            :options="paymentStatusOptions"
          />
        </div>
        <div class="po-tb-cell">
          <Select
            v-model="supplierFilter"
            icon="store"
            :placeholder="t('All Suppliers')"
            :options="supplierOptions"
          />
        </div>
        <div class="po-tb-cell po-tb-date">
          <Input
            v-model="dateFrom"
            icon="calendar"
            type="date"
            :placeholder="t('Date From')"
          />
        </div>
        <div class="po-tb-cell po-tb-date">
          <Input
            v-model="dateTo"
            icon="calendar"
            type="date"
            :placeholder="t('Date To')"
          />
        </div>
      </div>

      <!-- Active-filter chips + live result count -->
      <div
        v-if="hasFilters || (!loading && total > 0)"
        class="po-subbar"
      >
        <div
          v-if="hasFilters"
          class="chips"
        >
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
            v-if="statusFilter"
            class="chip"
          >
            <span>{{ t('Status') }}: <b>{{ t(`po_status_${statusFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="statusFilter = ''"
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
            <span>{{ t('Payment') }}: <b>{{ t(`po_payment_${paymentFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="paymentFilter = ''"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>
          <span
            v-if="supplierFilter"
            class="chip"
          >
            <span>{{ t('Supplier') }}: <b>{{ supplierLabel(supplierFilter) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="supplierFilter = ''"
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
            <span>{{ t('Date From') }}: <b>{{ dateFrom }}</b></span>
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
            <span>{{ t('Date To') }}: <b>{{ dateTo }}</b></span>
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
            @click="clearFilters"
          >
            {{ t('Clear filters') }}
          </button>
        </div>

        <span class="po-count">{{ t('po_result_count', { count: total }) }}</span>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="orders"
        row-key="id"
        :loading="loading"
        :pagination="pagination"
        expandable
        :empty-title="hasFilters ? t('po_empty_filtered_title') : t('po_empty_title')"
        :empty-sub="hasFilters ? t('po_empty_filtered_sub') : t('po_empty_sub')"
        :empty-icon="hasFilters ? 'search' : 'receipt'"
      >
        <template #cell.order_number="{ row }">
          <span class="cell-strong">{{ row.order_number }}</span>
        </template>

        <template #cell.supplier_name="{ row }">
          <span>{{ row.supplier_name ?? row.supplier?.name ?? '—' }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="STATUS_TONE[row.status] ?? 'neutral'">
            {{ row.status ? t(`po_status_${row.status}`) : '—' }}
          </Badge>
        </template>

        <template #cell.total="{ row }">
          <span class="mono num-tabular">{{ formatCurrency(row.total ?? 0) }}</span>
        </template>

        <template #cell.order_date="{ row }">
          <span>{{ row.order_date ? formatDateShort(row.order_date) : '—' }}</span>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            v-if="canSend(row)"
            icon="send"
            tone="primary"
            :title="t('po_action_send_title')"
            @click="openAction(row, 'send')"
          />
          <IconAction
            v-if="canConfirm(row)"
            icon="check"
            tone="success"
            :title="t('po_action_confirm_title')"
            @click="openAction(row, 'confirm')"
          />
          <IconAction
            v-if="canReceive(row)"
            icon="package"
            tone="primary"
            :title="t('po_action_receive_goto')"
            @click="goReceive(row)"
          />
          <IconAction
            v-if="canCancel(row)"
            icon="close"
            tone="danger"
            :title="t('po_action_cancel_title')"
            @click="openAction(row, 'cancel')"
          />
        </template>

        <!--
          Expanded row: order metadata + line items.
          BE list endpoint returns serialize_brief (no items / delivery_location /
          expected_date / payment_status). Fetch detail on first expand and read
          from detailCache.
        -->
        <template #expanded="{ row }">
          <!-- Trigger detail fetch on first render of the expanded slot -->
          {{ ensureDetail(row), '' }}
          <div class="po-expand">
            <div class="po-expand__meta">
              <span>
                <span class="cell-muted">{{ t('Supplier') }}: </span>
                <strong>{{ (detailCache[row.id]?.supplier?.name) ?? row.supplier_name ?? '—' }}</strong>
              </span>
              <span>
                <span class="cell-muted">{{ t('Location') }}: </span>
                <strong>{{ detailCache[row.id]?.delivery_location ?? '—' }}</strong>
              </span>
              <span v-if="detailCache[row.id]?.expected_date">
                <span class="cell-muted">{{ t('Expected') }}: </span>
                <strong>{{ formatDateShort(detailCache[row.id]?.expected_date) }}</strong>
              </span>
              <span v-if="detailCache[row.id]?.payment_status">
                <span class="cell-muted">{{ t('Payment') }}: </span>
                <Badge :tone="PAYMENT_TONE[detailCache[row.id]?.payment_status] ?? 'neutral'">
                  {{ t(`po_payment_${detailCache[row.id]?.payment_status}`) }}
                </Badge>
              </span>
            </div>

            <div class="po-lines-wrap">
              <table class="po-lines">
                <thead>
                  <tr>
                    <th>{{ t('Item') }}</th>
                    <th class="num">
                      {{ t('Qty Ordered') }}
                    </th>
                    <th class="num">
                      {{ t('Qty Received') }}
                    </th>
                    <th class="num">
                      {{ t('Unit Price') }}
                    </th>
                    <th class="num">
                      {{ t('Total') }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(li, idx) in ((detailCache[row.id]?.items ?? []) as any[])"
                    :key="idx"
                  >
                    <td>{{ li.stock_item?.name ?? '—' }}</td>
                    <td class="num mono">
                      {{ li.quantity_ordered ?? '—' }}
                    </td>
                    <td class="num mono">
                      {{ li.quantity_received ?? '—' }}
                    </td>
                    <td class="num mono">
                      {{ formatCurrency(li.unit_price ?? 0) }}
                    </td>
                    <td class="num mono">
                      {{ formatCurrency(li.total_price ?? 0) }}
                    </td>
                  </tr>
                  <tr v-if="detailLoading[row.id] && !detailCache[row.id]">
                    <td
                      colspan="5"
                      class="po-lines__empty"
                    >
                      {{ t('Loading...') }}
                    </td>
                  </tr>
                  <tr v-else-if="!detailCache[row.id]?.items?.length">
                    <td
                      colspan="5"
                      class="po-lines__empty"
                    >
                      {{ t('No items') }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Create Modal -->
    <Modal
      :open="createDialog"
      :title="t('New Purchase Order')"
      :subtitle="t('po_create_subtitle')"
      :width="560"
      :close-on-backdrop="false"
      @close="createDialog = false"
    >
      <form @submit.prevent="createOrder">
        <div class="form-grid">
          <Field
            :label="t('Supplier *')"
            class="span-2"
          >
            <Select
              v-model="form.supplier_id"
              icon="store"
              :placeholder="t('Select supplier')"
              :options="supplierOptions"
            />
          </Field>

          <Field
            :label="t('Delivery Location *')"
            class="span-2"
          >
            <Select
              v-model="form.delivery_location_id"
              icon="store"
              :placeholder="t('Select location')"
              :options="locationOptions"
            />
          </Field>

          <Field :label="t('Order Date')">
            <Input
              v-model="form.order_date"
              icon="calendar"
              type="date"
            />
          </Field>

          <Field :label="t('Expected Delivery')">
            <Input
              v-model="form.expected_date"
              icon="calendar"
              type="date"
            />
          </Field>

          <Field :label="t('Currency')">
            <Select
              v-model="form.currency"
              icon="wallet"
              :placeholder="t('Currency')"
              :options="currencyOptions"
            />
          </Field>

          <Field
            :label="t('Notes')"
            class="span-2"
          >
            <Input
              v-model="form.notes"
              :placeholder="t('Notes')"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="saving"
          :disabled="saving"
          @click="createOrder"
        >
          {{ t('Create') }}
        </Button>
      </template>
    </Modal>

    <!-- Action Confirm Modal -->
    <Modal
      :open="actionDialog"
      :title="actionTitle"
      :width="440"
      @close="actionDialog = false"
    >
      <div class="row po-confirm">
        <div
          class="kpi__icon"
          :class="actionType === 'cancel' ? 't-error' : 't-warning'"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            :name="actionType === 'cancel' ? 'alert' : 'info'"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;">
            {{ t('Confirm action for order') }}
            <strong>{{ actionItem?.order_number }}</strong>
          </p>
          <p
            class="cell-muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            {{ actionTitle }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          :variant="actionType === 'cancel' ? 'danger' : 'primary'"
          icon="check"
          :loading="actioning"
          :disabled="actioning"
          @click="() => doAction()"
        >
          {{ t('Confirm') }}
        </Button>
      </template>
    </Modal>

    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </div>
</template>

<style scoped>
.po-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 14px 16px;
  align-items: center;
}

.po-tb-search {
  flex: 1 1 240px;
  min-width: 200px;
  max-width: 320px;
}

.po-tb-cell {
  flex: 1 1 180px;
  min-width: 160px;
  max-width: 220px;
}

.po-tb-date {
  flex: 1 1 160px;
  min-width: 150px;
}

/* Sub-bar under the toolbar: active-filter chips on the left, live result
   count on the right. Collapses to a stacked layout on narrow screens. */
.po-subbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px 14px;
  flex-wrap: wrap;
}

.po-count {
  margin-inline-start: auto;
  font-size: 13px;
  font-weight: 500;
  color: rgb(var(--v-theme-text-secondary));
  white-space: nowrap;
}

.po-expand {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.po-expand__meta {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  font-size: 13px;
}

.po-lines-wrap {
  overflow-x: auto;
  width: 100%;
}

.po-lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 480px;
}

.po-lines th,
.po-lines td {
  padding: 8px 10px;
  border-bottom: 1px solid rgb(var(--v-theme-neutral-border));
  text-align: left;
}

.po-lines th.num,
.po-lines td.num {
  text-align: right;
}

.po-lines__empty {
  text-align: center !important;
  padding: 16px;
  color: rgb(var(--v-theme-text-secondary));
}

.po-confirm {
  gap: 14px;
  align-items: flex-start;
  display: flex;
}

.po-confirm > div:last-child {
  flex: 1 1 0;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

@media (max-width: 900px) {
  .po-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .po-tb-search,
  .po-tb-cell,
  .po-tb-date {
    flex: 1 1 100%;
    max-width: 100%;
    min-width: 0;
    width: 100%;
  }

  .po-expand__meta {
    flex-direction: column;
    gap: 6px;
  }
}

/* Phone — ensure modal-internal form-grid collapses to single column
   and the line-items table remains horizontally scrollable. */
@media (max-width: 768px) {
  .po-lines-wrap {
    -webkit-overflow-scrolling: touch;
  }
}

/* Small phone — tighten confirm icon and lines table padding. */
@media (max-width: 420px) {
  .po-confirm {
    gap: 10px;
  }

  .po-lines th,
  .po-lines td {
    padding: 6px 8px;
  }
}
</style>

<route lang="yaml">
name: stock-purchase-orders
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.purchase.view
</route>
