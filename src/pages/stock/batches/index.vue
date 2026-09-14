<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import { useActionDialog } from '@/composables/useActionDialog'

/* ============================================================
   ALPHA POS — Stock Batches
   Design-system primitives only (no Vuetify on the page itself)
   - Filters: search, status, location, expiry, item, expiring-within, ext-status
   - DataTable with controlled pagination + row "consume" action
   - Modals: consume from batch, auto-consume (FIFO/FEFO)
   ============================================================ */
import { stockApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'
import { useUserAccess } from '@/composables/useUserAccess'

const { confirmAction } = useActionDialog()
const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatCurrency, formatDateShort } = useFormatters()
const { isAdministrator } = useUserAccess()
const canAdministerBatches = computed(() => isAdministrator.value)

// The deployed views omit the required movement_type argument when calling
// both consume services, so these mutations currently fail before any domain
// validation runs. Keep the inventory page useful and read-only until that
// backend contract is repaired and regression-tested.
const batchMutationSupported = false
const canConsumeBatches = computed(() => canAdministerBatches.value && batchMutationSupported)

// ---- state ----
const batches = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const statusFilter = ref<string | undefined>(undefined)
const locationFilter = ref<number | undefined>(undefined)
const expiryFilter = ref<string | undefined>(undefined)
const stockItemFilter = ref<number | undefined>(undefined)
const includeZeroStock = ref(false)
const expiringWithinDays = ref<number | undefined>(undefined)

// Extended status filter all|expiring|expired
const extStatusFilter = ref<'all' | 'expiring' | 'expired'>('all')
const extDaysAhead = ref<number>(7)

// Consume modal state
const consumeDialog = ref(false)
const consumeBatch = ref<any | null>(null)
const consumeQty = ref<number | undefined>(undefined)
const consumeNotes = ref('')
const consumeSubmitting = ref(false)

// Auto-consume modal state
const autoConsumeDialog = ref(false)
const autoConsumeStockItem = ref<number | undefined>(undefined)
const autoConsumeLocation = ref<number | undefined>(undefined)
const autoConsumeQty = ref<number | undefined>(undefined)
const autoConsumeSubmitting = ref(false)
const autoConsumeResult = ref<any | null>(null)

const locationsList = ref<any[]>([])
const stockItemsList = ref<any[]>([])

// ---- option lists ----
const statusOptions = computed(() =>
  ['AVAILABLE', 'RESERVED', 'QUARANTINE', 'EXPIRED', 'CONSUMED'].map(v => ({
    value: v,
    label: t(`batch_status_${v}`),
  })),
)

const extStatusOptions = computed(() => [
  { value: 'all', label: t('batches_filter_ext_all') },
  { value: 'expiring', label: t('batches_ext_tab_expiring') },
  { value: 'expired', label: t('batches_ext_tab_expired') },
])

const expiryOptions = computed(() => [
  { value: 'expiring_soon', label: t('Expiring Soon (7 days)') },
  { value: 'expired', label: t('Expired') },
])

const locationOptions = computed(() =>
  locationsList.value.map(l => ({ value: String(l.id), label: l.name })),
)

const stockItemOptions = computed(() =>
  stockItemsList.value.map((i: any) => ({ value: String(i.id), label: i.name })),
)

// ---- tone maps ----
const BATCH_STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  AVAILABLE: 'success',
  RESERVED: 'warning',
  QUARANTINE: 'error',
  EXPIRED: 'error',
  CONSUMED: 'neutral',
}

const QUALITY_STATUS_TONE: Record<string, 'success' | 'warning' | 'error'> = {
  PASSED: 'success',
  FAILED: 'error',
  PENDING: 'warning',
}

// ---- helpers ----
function formatQty(val: any) {
  if (val === null || val === undefined)
    return '0'
  const n = Number(val)

  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

// ---- load ----
function batchEndpoint(params: Record<string, any>) {
  // Extended: route to /batches/expiring/ or /batches/expired/ based on ext status
  let endpoint = '/batches/'
  if (extStatusFilter.value === 'expiring') {
    endpoint = '/batches/expiring/'

    const d = Number(extDaysAhead.value)
    if (d && d > 0)
      params.days = d
  }
  else if (extStatusFilter.value === 'expired') {
    endpoint = '/batches/expired/'
  }

  return endpoint
}

async function loadBatches() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (statusFilter.value)
      params.status = statusFilter.value
    if (locationFilter.value)
      params.location_id = locationFilter.value
    if (stockItemFilter.value)
      params.stock_item_id = stockItemFilter.value
    if (includeZeroStock.value)
      params.has_stock_only = 'false'
    if (expiringWithinDays.value && Number(expiringWithinDays.value) > 0)
      params.expiring_within_days = Number(expiringWithinDays.value)
    if (expiryFilter.value === 'expiring_soon')
      params.expiring_within_days = 7
    else if (expiryFilter.value === 'expired')
      params.expired_only = true

    const endpoint = batchEndpoint(params)

    const res = await axios.get(endpoint, { params })
    const d = res.data?.data ?? res.data

    batches.value = d?.batches ?? d?.results ?? (Array.isArray(d) ? d : [])
    total.value = d.pagination?.total_items ?? d.pagination?.total ?? d?.count ?? batches.value.length
  }
  catch {
    notify(t('Failed to load batches'), 'error')
  }
  finally {
    loading.value = false
  }
}

function openConsumeDialog(row: any) {
  if (!canConsumeBatches.value)
    return

  consumeBatch.value = row
  consumeQty.value = undefined
  consumeNotes.value = ''
  consumeDialog.value = true
}

async function submitConsume() {
  if (consumeSubmitting.value)
    return
  if (!canConsumeBatches.value || !consumeBatch.value) {
    notify(t('batches_ext_select_batch_first'), 'error')

    return
  }
  const qty = Number(consumeQty.value)
  if (!qty || qty <= 0) {
    notify(t('batches_ext_qty_must_be_positive'), 'error')

    return
  }
  const avail = Number(consumeBatch.value.available_quantity)
  if (qty > avail) {
    notify(t('batches_ext_qty_must_be_positive'), 'error')

    return
  }
  const confirmMsg = t('batches_ext_confirm_consume', { qty, batch: consumeBatch.value.batch_number })
  if (!await confirmAction({ title: t('Write off'), message: confirmMsg, confirmLabel: t('Write off'), danger: true }))
    return

  consumeSubmitting.value = true
  try {
    const body: any = { quantity: qty }
    if (consumeNotes.value)
      body.notes = consumeNotes.value
    await axios.post(`/batches/${consumeBatch.value.id}/consume/`, body)
    notify(t('batches_ext_consume_success', { qty, batch: consumeBatch.value.batch_number }), 'success')
    consumeDialog.value = false
    await loadBatches()
  }
  catch {
    notify(t('Failed'), 'error')
  }
  finally {
    consumeSubmitting.value = false
  }
}

function openAutoConsumeDialog() {
  if (!canConsumeBatches.value)
    return

  autoConsumeStockItem.value = undefined
  autoConsumeLocation.value = undefined
  autoConsumeQty.value = undefined
  autoConsumeResult.value = null
  autoConsumeDialog.value = true
}

async function submitAutoConsume() {
  if (!canConsumeBatches.value)
    return

  if (!autoConsumeStockItem.value || !autoConsumeLocation.value) {
    notify(t('batches_ext_select_item_location'), 'error')

    return
  }
  const qty = Number(autoConsumeQty.value)
  if (!qty || qty <= 0) {
    notify(t('batches_ext_qty_must_be_positive'), 'error')

    return
  }
  autoConsumeSubmitting.value = true
  try {
    const body = {
      stock_item_id: autoConsumeStockItem.value,
      location_id: autoConsumeLocation.value,
      quantity: qty,
    }

    const res = await axios.post('/batches/auto-consume/', body)
    const d = res.data?.data ?? res.data

    autoConsumeResult.value = d

    const totalConsumed = d?.total_consumed ?? qty
    const batchCount = Array.isArray(d?.batches) ? d.batches.length : 0

    notify(t('batches_ext_auto_consume_success', { qty: totalConsumed, count: batchCount }), 'success')
    await loadBatches()
  }
  catch {
    notify(t('batches_ext_no_stock_available'), 'error')
  }
  finally {
    autoConsumeSubmitting.value = false
  }
}

async function loadLocations() {
  try {
    const res = await axios.get('/locations/', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data

    locationsList.value = d?.locations ?? []
  }
  catch { /* ignore */ }
}

async function loadStockItems() {
  try {
    const res = await axios.get('/items/', { params: { per_page: 500 } })
    const d = res.data?.data ?? res.data

    stockItemsList.value = d?.items ?? d?.results ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => { loadBatches(); loadLocations(); loadStockItems() })
watch([page, itemsPerPage], loadBatches)
watch(
  [search, statusFilter, locationFilter, expiryFilter, stockItemFilter, includeZeroStock, expiringWithinDays],
  () => { page.value = 1; loadBatches() },
)
watch([extStatusFilter, extDaysAhead], () => { page.value = 1; loadBatches() })

// ---- DataTable columns ----
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'batch_number', label: t('Batch #') },
  { key: 'item', label: t('Item') },
  { key: 'location', label: t('Location') },
  { key: 'received_at', label: t('Received date') },
  { key: 'initial_quantity', label: t('Initial qty'), align: 'right' },
  { key: 'current_quantity', label: t('Current Qty'), align: 'right' },
  { key: 'reserved_quantity', label: t('Reserved qty'), align: 'right' },
  { key: 'available_quantity', label: t('Available'), align: 'right' },
  { key: 'unit_cost', label: t('Unit Cost'), align: 'right' },
  { key: 'status', label: t('Status') },
  { key: 'expiry_date', label: t('Expiry') },
  { key: 'quality_status', label: t('Quality') },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const hasFilters = computed(() =>
  !!(
    search.value
    || statusFilter.value
    || locationFilter.value
    || expiryFilter.value
    || stockItemFilter.value
    || includeZeroStock.value
    || (expiringWithinDays.value && Number(expiringWithinDays.value) > 0)
    || extStatusFilter.value !== 'all'
  ),
)

function clearAll() {
  search.value = ''
  statusFilter.value = undefined
  locationFilter.value = undefined
  expiryFilter.value = undefined
  stockItemFilter.value = undefined
  includeZeroStock.value = false
  expiringWithinDays.value = undefined
  extStatusFilter.value = 'all'
  extDaysAhead.value = 7
}
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('stock_batches_title')"
      :subtitle="t('stock_batches_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canConsumeBatches"
          variant="secondary"
          icon="settings"
          @click="openAutoConsumeDialog"
        >
          {{ t('batches_ext_btn_auto_consume') }}
        </Button>
        <Button
          variant="ghost"
          icon="refresh"
          @click="loadBatches"
        >
          {{ t('Refresh') }}
        </Button>
      </template>
    </PageHeader>

    <div
      v-if="canAdministerBatches && !batchMutationSupported"
      class="inline-alert"
      role="note"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <span>{{ t('batches_ext_mutation_backend_required') }}</span>
    </div>

    <!-- Main card -->
    <div class="card">
      <!-- Toolbar (flex-wrap, collapses to single column on mobile) -->
      <WorkspaceToolbar class="toolbar tb-wrap">
        <div class="tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search by item name...')"
            :aria-label="t('Search by item name...')"
          />
        </div>

        <div class="tb-select">
          <Select
            :model-value="statusFilter ?? ''"
            :placeholder="t('All Statuses')"
            :options="statusOptions"
            @update:model-value="(v: string) => statusFilter = v ? v : undefined"
          />
        </div>

        <div class="tb-select">
          <Select
            :model-value="locationFilter != null ? String(locationFilter) : ''"
            :placeholder="t('All Locations')"
            :options="locationOptions"
            @update:model-value="(v: string) => locationFilter = v ? Number(v) : undefined"
          />
        </div>

        <div class="tb-select">
          <Select
            :model-value="expiryFilter ?? ''"
            :placeholder="t('All Expiry')"
            :options="expiryOptions"
            @update:model-value="(v: string) => expiryFilter = v ? v : undefined"
          />
        </div>

        <div class="tb-select">
          <Select
            :model-value="stockItemFilter != null ? String(stockItemFilter) : ''"
            :placeholder="t('All Items')"
            :options="stockItemOptions"
            @update:model-value="(v: string) => stockItemFilter = v ? Number(v) : undefined"
          />
        </div>

        <div class="tb-select">
          <Input
            v-model.number="expiringWithinDays"
            type="number"
            min="0"
            :placeholder="t('Expiring within (days)')"
            :aria-label="t('Expiring within (days)')"
          />
        </div>

        <div class="tb-select">
          <Select
            :model-value="extStatusFilter"
            :options="extStatusOptions"
            @update:model-value="(v: string) => extStatusFilter = (v || 'all') as any"
          />
        </div>

        <div
          v-if="extStatusFilter === 'expiring'"
          class="tb-select"
        >
          <Input
            v-model.number="extDaysAhead"
            type="number"
            min="1"
            max="3650"
            :placeholder="t('batches_ext_filter_days')"
            :aria-label="t('batches_ext_filter_days')"
          />
        </div>

        <label class="tb-switch">
          <Switch v-model="includeZeroStock" />
          <span>{{ t('Include zero-stock batches') }}</span>
        </label>
      </WorkspaceToolbar>

      <!-- Active filter chips -->
      <div
        v-if="hasFilters"
        class="toolbar"
        style="padding-top: 0;"
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
            <span>{{ t('Search by item name...') }}: <b>{{ search }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="search = ''"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span
            v-if="statusFilter"
            class="chip"
          >
            <span>{{ t('Status') }}: <b>{{ t(`batch_status_${statusFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="statusFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span
            v-if="locationFilter"
            class="chip"
          >
            <span>{{ t('Location') }}: <b>{{ locationOptions.find(o => o.value === String(locationFilter))?.label }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="locationFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span
            v-if="expiryFilter"
            class="chip"
          >
            <span>{{ t('Expiry') }}: <b>{{ expiryOptions.find(o => o.value === expiryFilter)?.label }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="expiryFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span
            v-if="stockItemFilter"
            class="chip"
          >
            <span>{{ t('Item') }}: <b>{{ stockItemOptions.find(o => o.value === String(stockItemFilter))?.label }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="stockItemFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span
            v-if="extStatusFilter !== 'all'"
            class="chip"
          >
            <span>{{ t('batches_filter_ext_status') }}: <b>{{ t(`batches_ext_tab_${extStatusFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="extStatusFilter = 'all'"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span
            v-if="expiringWithinDays && Number(expiringWithinDays) > 0"
            class="chip"
          >
            <span>{{ t('Expiring within (days)') }}: <b>{{ expiringWithinDays }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="expiringWithinDays = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span
            v-if="includeZeroStock"
            class="chip"
          >
            <span>{{ t('Include zero-stock batches') }}</span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="includeZeroStock = false"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
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

      <!-- DataTable -->
      <DataTable
        :columns="columns"
        :rows="batches"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
      >
        <template #cell.batch_number="{ row }">
          <span class="cell-strong">{{ row.batch_number }}</span>
        </template>

        <template #cell.item="{ row }">
          <span class="cell-strong">{{ row.stock_item?.name ?? '—' }}</span>
        </template>

        <template #cell.location="{ row }">
          <span class="cell-muted">{{ row.location_name ?? '—' }}</span>
        </template>

        <template #cell.received_at="{ row }">
          <span class="cell-muted">{{ row.received_at ? formatDateShort(row.received_at) : '—' }}</span>
        </template>

        <template #cell.initial_quantity="{ row }">
          <span class="mono">{{ formatQty(row.initial_quantity) }}</span>
        </template>

        <template #cell.current_quantity="{ row }">
          <span class="mono">{{ formatQty(row.current_quantity) }}</span>
        </template>

        <template #cell.reserved_quantity="{ row }">
          <span class="mono">{{ formatQty(row.reserved_quantity) }}</span>
        </template>

        <template #cell.available_quantity="{ row }">
          <span
            class="mono"
            :class="[Number(row.available_quantity) <= 0 ? 'cell-danger' : '']"
          >
            {{ formatQty(row.available_quantity) }}
          </span>
        </template>

        <template #cell.unit_cost="{ row }">
          <span class="mono">{{ formatCurrency(row.unit_cost) }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge :tone="(BATCH_STATUS_TONE[row.status] ?? 'neutral') as any">
            {{ row.status ? t(`batch_status_${row.status}`) : '—' }}
          </Badge>
        </template>

        <template #cell.expiry_date="{ row }">
          <span class="cell-muted">{{ row.expiry_date ? formatDateShort(row.expiry_date) : '—' }}</span>
        </template>

        <template #cell.quality_status="{ row }">
          <Badge :tone="(QUALITY_STATUS_TONE[row.quality_status] ?? 'neutral') as any">
            {{ row.quality_status ? t(`quality_status_${row.quality_status}`) : '—' }}
          </Badge>
        </template>

        <template
          v-if="canConsumeBatches"
          #row-actions="{ row }"
        >
          <IconAction
            icon="minus"
            tone="primary"
            :title="t('batches_ext_action_consume')"
            :disabled="Number(row.available_quantity) <= 0"
            @click.stop="openConsumeDialog(row)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('stock_batches_empty_title')"
            :sub="t('stock_batches_empty_sub')"
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

    <!-- Consume from batch modal -->
    <Modal
      v-if="canConsumeBatches"
      :open="consumeDialog"
      width="min(540px, 100%)"
      :title="t('batches_ext_consume_title')"
      :subtitle="t('batches_ext_consume_subtitle')"
      @close="consumeDialog = false"
    >
      <div
        v-if="consumeBatch"
        class="consume-summary"
      >
        <div>
          <span class="muted">{{ t('batches_ext_field_batch') }}:</span>
          <b>{{ consumeBatch.batch_number }}</b>
        </div>
        <div>
          <span class="muted">{{ t('batches_ext_col_item') }}:</span>
          <b>{{ consumeBatch.stock_item?.name ?? '—' }}</b>
        </div>
        <div>
          <span class="muted">{{ t('batches_ext_col_location') }}:</span>
          <b>{{ consumeBatch.location_name ?? '—' }}</b>
        </div>
        <div>
          <span class="muted">{{ t('batches_ext_col_available') }}:</span>
          <b class="mono">{{ formatQty(consumeBatch.available_quantity) }}</b>
        </div>
      </div>

      <div class="modal-grid">
        <div class="span-2">
          <Field
            :label="t('batches_ext_field_quantity')"
            :hint="consumeBatch ? t('batches_ext_field_quantity_hint', { qty: formatQty(consumeBatch.available_quantity) }) : ''"
          >
            <Input
              v-model.number="consumeQty"
              type="number"
              min="0.0001"
              step="0.0001"
            />
          </Field>
        </div>
        <div class="span-2">
          <Field :label="t('batches_ext_field_notes')">
            <Input
              v-model="consumeNotes"
              :placeholder="t('batches_ext_field_notes_placeholder')"
            />
          </Field>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="consumeSubmitting"
          @click="submitConsume"
        >
          {{ t('batches_ext_btn_consume') }}
        </Button>
      </template>
    </Modal>

    <!-- Auto-consume modal -->
    <Modal
      v-if="canConsumeBatches"
      :open="autoConsumeDialog"
      width="min(600px, 100%)"
      :title="t('batches_ext_auto_consume_title')"
      :subtitle="t('batches_ext_auto_consume_subtitle')"
      @close="autoConsumeDialog = false"
    >
      <div class="modal-grid">
        <div class="span-2">
          <Field :label="t('batches_ext_field_stock_item')">
            <Select
              :model-value="autoConsumeStockItem != null ? String(autoConsumeStockItem) : ''"
              :placeholder="t('All Items')"
              :options="stockItemOptions"
              @update:model-value="(v: string) => autoConsumeStockItem = v ? Number(v) : undefined"
            />
          </Field>
        </div>
        <div class="span-2">
          <Field :label="t('batches_ext_field_location')">
            <Select
              :model-value="autoConsumeLocation != null ? String(autoConsumeLocation) : ''"
              :placeholder="t('All Locations')"
              :options="locationOptions"
              @update:model-value="(v: string) => autoConsumeLocation = v ? Number(v) : undefined"
            />
          </Field>
        </div>
        <div class="span-2">
          <Field :label="t('batches_ext_field_quantity')">
            <Input
              v-model.number="autoConsumeQty"
              type="number"
              min="0.0001"
              step="0.0001"
            />
          </Field>
        </div>
      </div>

      <div
        v-if="autoConsumeResult && Array.isArray(autoConsumeResult.batches)"
        class="ac-result"
      >
        <div class="ac-result__title">
          {{ t('batches_ext_auto_consume_success', { qty: autoConsumeResult.total_consumed, count: autoConsumeResult.batches.length }) }}
        </div>
        <div class="ac-result__table">
          <table class="dtable">
            <thead>
              <tr>
                <th>{{ t('batches_ext_col_batch_number') }}</th>
                <th class="num">
                  {{ t('batches_ext_field_quantity') }}
                </th>
                <th class="num">
                  {{ t('batches_ext_col_unit_cost') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(b, i) in (autoConsumeResult.batches as any[])"
                :key="i"
              >
                <td>{{ b.batch_number }}</td>
                <td class="num mono">
                  {{ formatQty(b.quantity) }}
                </td>
                <td class="num mono">
                  {{ formatCurrency(b.unit_cost) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="autoConsumeSubmitting"
          @click="submitAutoConsume"
        >
          {{ t('batches_ext_btn_auto_consume') }}
        </Button>
      </template>
    </Modal>
  </WorkspacePage>
</template>

<style scoped>
.inline-alert {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-bottom: var(--sp-4);
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-warning-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
  font-size: 13px;
}

.inline-alert span {
  flex: 1;
  min-width: 0;
}

/* Toolbar — flex-wrap, collapses to one column on mobile */
.toolbar.tb-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.tb-search {
  flex: 1 1 240px;
  min-width: 0;
}
.tb-select {
  flex: 0 1 200px;
  min-width: 160px;
}
.tb-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  white-space: nowrap;
}

/* Consume modal summary block */
.consume-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 16px;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: rgb(var(--v-theme-neutral-weak));
  border: 1px solid rgb(var(--v-theme-neutral-border));
  border-radius: var(--r-xs);
  font-size: 13px;
}
.consume-summary > div {
  display: flex;
  gap: 6px;
  align-items: baseline;
  flex-wrap: wrap;
}
.consume-summary .muted {
  color: var(--text-tertiary);
}

/* Modal grid — 2 cols on desktop, 1 col on mobile */
.modal-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-4);
}
.modal-grid .span-2 {
  grid-column: span 2;
}

/* Auto-consume result table */
.ac-result {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgb(var(--v-theme-neutral-border));
}
.ac-result__title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
}
.ac-result__table {
  overflow-x: auto;
}

.cell-danger {
  color: rgb(var(--v-theme-error-strong));
  font-weight: 600;
}

/* Responsive — collapse toolbar at tablet, modal grid + summary at phone */
@media (max-width: 1024px) {
  .tb-search,
  .tb-select {
    flex: 1 1 100%;
    min-width: 0;
  }
  .tb-switch {
    flex: 1 1 100%;
  }
}
@media (max-width: 768px) {
  .modal-grid {
    grid-template-columns: 1fr;
  }
  .modal-grid .span-2 {
    grid-column: span 1;
  }
  .consume-summary {
    grid-template-columns: 1fr;
  }
  /* Ensure auto-consume result table can scroll horizontally inside modal */
  .ac-result__table .dtable {
    min-width: 360px;
  }
}
</style>

<route lang="yaml">
name: stock-batches
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.batch.view
</route>
