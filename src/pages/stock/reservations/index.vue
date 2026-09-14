<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   ALPHA POS — Stock Reservations
   Built on design primitives only (no Vuetify).
   List /levels/ rows, reserve via /reserve/, release via /release-reservation/.
   ============================================================ */
import { stockApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { formatDateShort } = useFormatters()

// ---- enums ----
const ITEM_TYPES = ['RAW_MATERIAL', 'INGREDIENT', 'FINISHED_GOOD', 'SEMI_FINISHED', 'CONSUMABLE', 'PACKAGING']
const REFERENCE_TYPES = ['ORDER', 'PURCHASE_ORDER', 'PRODUCTION_ORDER', 'TRANSFER', 'MANUAL']

const LOCATION_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  WAREHOUSE: 'primary',
  KITCHEN: 'warning',
  BAR: 'info',
  STORE: 'success',
  TRANSIT: 'neutral',
}

// ---- state ----
const levels = ref<any[]>([])
const total = ref(0)
const loading = ref(false)

const page = ref(1)
const itemsPerPage = ref(10)

const search = ref('')
const locationFilter = ref<string>('')
const categoryFilter = ref<string>('')
const itemTypeFilter = ref<string>('')
const reservedOnly = ref(false)

const locationsList = ref<any[]>([])
const categoriesList = ref<any[]>([])
const stockItemsList = ref<any[]>([])

const debouncedSearch = useDebounceFn(() => {
  page.value = 1
  loadLevels()
}, 350)

// ---- helpers ----
function formatQty(val: any) {
  if (val === null || val === undefined)
    return '0'
  const n = Number(val)
  if (!Number.isFinite(n))
    return '0'

  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

function readData<T = any>(res: any): T {
  return (res?.data?.data ?? res?.data) as T
}

// ---- load ----
async function loadLevels() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value.trim())
      params.search = search.value.trim()
    if (locationFilter.value)
      params.location_id = locationFilter.value
    if (categoryFilter.value)
      params.category_id = categoryFilter.value
    if (itemTypeFilter.value)
      params.item_type = itemTypeFilter.value

    const res = await axios.get('/levels/', { params })
    const d = readData<any>(res)

    levels.value = d?.levels ?? []
    total.value = d?.pagination?.total ?? levels.value.length
  }
  catch {
    notify(t('msg_load_failed'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadLocations() {
  try {
    const res = await axios.get('/locations/', { params: { per_page: 200 } })
    const d = readData<any>(res)

    locationsList.value = d?.locations ?? []
  }
  catch { /* ignore */ }
}

async function loadCategories() {
  try {
    const res = await axios.get('/categories/', { params: { per_page: 200 } })
    const d = readData<any>(res)

    categoriesList.value = d?.categories ?? []
  }
  catch { /* ignore */ }
}

async function loadStockItems() {
  try {
    const res = await axios.get('/items/', { params: { per_page: 200 } })
    const d = readData<any>(res)

    stockItemsList.value = d?.items ?? d?.results ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => {
  loadLevels()
  loadLocations()
  loadCategories()
  loadStockItems()
})

watch([page, itemsPerPage], loadLevels)
watch([locationFilter, categoryFilter, itemTypeFilter], () => {
  page.value = 1
  loadLevels()
})
watch(search, () => debouncedSearch())

// ---- client-side filter for "reserved only" ----
const visibleRows = computed(() => {
  if (!reservedOnly.value)
    return levels.value

  return levels.value.filter((row: any) => Number(row.reserved_quantity) > 0)
})

// ---- options ----
const locationOptions = computed(() =>
  locationsList.value.map(l => ({ value: String(l.id), label: l.name })),
)
const categoryOptions = computed(() =>
  categoriesList.value.map(c => ({ value: String(c.id), label: c.name })),
)
const itemTypeOptions = computed(() =>
  ITEM_TYPES.map(v => ({ value: v, label: t(`item_type_${v}`) })),
)
const referenceTypeOptions = computed(() =>
  REFERENCE_TYPES.map(v => ({ value: v, label: t(`reference_type_${v}`) })),
)
const stockItemOptions = computed(() =>
  stockItemsList.value.map((i: any) => ({ value: String(i.id), label: i.name })),
)

// ---- KPIs ----
const kpiItemsCount = computed(() =>
  levels.value.filter((row: any) => Number(row.reserved_quantity) > 0).length,
)
const kpiTotalReserved = computed(() =>
  levels.value.reduce((s: number, r: any) => s + (Number(r.reserved_quantity) || 0), 0),
)
const kpiTotalAvailable = computed(() =>
  levels.value.reduce((s: number, r: any) => s + (Number(r.available_quantity) || 0), 0),
)
const kpiLocationsCount = computed(() => locationsList.value.length)

// ---- columns ----
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'item', label: t('col_item') },
  { key: 'sku', label: t('col_sku') },
  { key: 'location', label: t('col_location') },
  { key: 'unit', label: t('col_unit') },
  { key: 'quantity', label: t('col_quantity'), align: 'right' },
  { key: 'reserved', label: t('col_reserved'), align: 'right' },
  { key: 'available', label: t('col_available'), align: 'right' },
  { key: 'last_movement', label: t('col_last_movement') },
])

// ---- modal state ----
type ModalMode = null | 'reserve' | 'release'
const modalMode = ref<ModalMode>(null)
const modalRow = ref<any>(null)
const submitting = ref(false)

const form = ref({
  stock_item_id: '' as string,
  location_id: '' as string,
  quantity: '' as string,
  reference_type: '' as string,
  reference_id: '' as string,
  notes: '' as string,
})

const errors = ref<Record<string, string>>({})

function resetForm() {
  form.value = {
    stock_item_id: '',
    location_id: '',
    quantity: '',
    reference_type: '',
    reference_id: '',
    notes: '',
  }
  errors.value = {}
}

function openReserveModal(row?: any) {
  resetForm()
  modalMode.value = 'reserve'
  modalRow.value = row ?? null
  if (row) {
    form.value.stock_item_id = String(row.stock_item_id ?? row.stock_item?.id ?? '')
    form.value.location_id = String(row.location_id ?? row.location?.id ?? '')
  }
}

function openReleaseModal(row: any) {
  resetForm()
  modalMode.value = 'release'
  modalRow.value = row
  form.value.stock_item_id = String(row.stock_item_id ?? row.stock_item?.id ?? '')
  form.value.location_id = String(row.location_id ?? row.location?.id ?? '')
  // default to currently reserved amount
  const reserved = Number(row.reserved_quantity ?? 0)
  form.value.quantity = reserved > 0 ? String(reserved) : ''
}

function closeModal() {
  if (submitting.value)
    return
  modalMode.value = null
  modalRow.value = null
  resetForm()
}

const modalTitle = computed(() => {
  if (modalMode.value === 'reserve')
    return t('modal_reserve_title')
  if (modalMode.value === 'release')
    return t('modal_release_title')

  return ''
})

const submitLabel = computed(() =>
  modalMode.value === 'release' ? t('action_submit_release') : t('action_submit_reserve'),
)

const submitVariant = computed<'primary' | 'danger'>(() =>
  modalMode.value === 'release' ? 'danger' : 'primary',
)

const quantityHint = computed(() =>
  modalMode.value === 'release' ? t('hint_release_quantity') : t('hint_reserve_quantity'),
)

// max allowed in the form, based on selected row
const quantityMax = computed(() => {
  if (!modalRow.value)
    return null
  if (modalMode.value === 'reserve')
    return Number(modalRow.value.available_quantity ?? 0)
  if (modalMode.value === 'release')
    return Number(modalRow.value.reserved_quantity ?? 0)

  return null
})

// ---- validate ----
function validate(): boolean {
  const e: Record<string, string> = {}
  if (!form.value.stock_item_id)
    e.stock_item_id = t('validate_required')
  if (!form.value.location_id)
    e.location_id = t('validate_required')

  const qty = Number(form.value.quantity)
  if (!form.value.quantity || Number.isNaN(qty))
    e.quantity = t('validate_required')
  else if (qty <= 0)
    e.quantity = t('validate_positive')
  else if (quantityMax.value !== null && qty > quantityMax.value) {
    e.quantity = modalMode.value === 'release'
      ? t('msg_release_exceeds_reserved')
      : t('msg_insufficient_stock')
  }

  errors.value = e

  return Object.keys(e).length === 0
}

// ---- submit ----
async function submit() {
  if (submitting.value)
    return
  if (!validate())
    return

  submitting.value = true
  const isRelease = modalMode.value === 'release'
  const url = isRelease ? '/release-reservation/' : '/reserve/'
  const payload: any = {
    stock_item_id: Number(form.value.stock_item_id),
    location_id: Number(form.value.location_id),
    quantity: Number(form.value.quantity),
  }
  if (form.value.reference_type)
    payload.reference_type = form.value.reference_type
  if (form.value.reference_id)
    payload.reference_id = Number(form.value.reference_id)
  if (form.value.notes)
    payload.notes = form.value.notes

  try {
    await axios.post(url, payload)
    notify(isRelease ? t('msg_released_success') : t('msg_reserved_success'))
    modalMode.value = null
    modalRow.value = null
    resetForm()
    await loadLevels()
  }
  catch (e: any) {
    const msg = e?.response?.data?.message
      ?? (isRelease ? t('msg_release_failed') : t('msg_reserve_failed'))
    notify(msg, 'error')
  }
  finally {
    submitting.value = false
  }
}

// ---- pagination glue for DataTable ----
const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const hasFilters = computed(() =>
  !!(search.value || locationFilter.value || categoryFilter.value || itemTypeFilter.value || reservedOnly.value),
)

function clearFilters() {
  search.value = ''
  locationFilter.value = ''
  categoryFilter.value = ''
  itemTypeFilter.value = ''
  reservedOnly.value = false
}
</script>

<template>
  <WorkspacePage class="page">
    <PageHeader
      :title="t('stock_reservations_title')"
      :subtitle="t('stock_reservations_subtitle')"
    >
      <template #actions>
        <Button
          variant="primary"
          icon="lock"
          @click="openReserveModal()"
        >
          {{ t('reserve_stock') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div class="grid cols-4 kpi-strip" style="margin-bottom: var(--sp-5);">
      <Kpi
        :data="{
          label: t('kpi_total_items'),
          icon: 'box',
          tone: 'primary',
          value: kpiItemsCount,
        }"
      />
      <Kpi
        :data="{
          label: t('kpi_total_reserved'),
          icon: 'lock',
          tone: 'warning',
          value: formatQty(kpiTotalReserved),
        }"
      />
      <Kpi
        :data="{
          label: t('kpi_total_available'),
          icon: 'check',
          tone: 'success',
          value: formatQty(kpiTotalAvailable),
        }"
      />
      <Kpi
        :data="{
          label: t('kpi_locations_count'),
          icon: 'pin',
          tone: 'info',
          value: kpiLocationsCount,
        }"
      />
    </div>

    <!-- Main card -->
    <div class="card">
      <!-- Toolbar -->
      <WorkspaceToolbar class="toolbar res-toolbar">
        <div class="grow tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('filter_search_placeholder')"
            :aria-label="t('filter_search_placeholder')"
          />
        </div>

        <div class="tb-filter">
          <Select
            :model-value="locationFilter"
            :placeholder="t('filter_all_locations')"
            :options="locationOptions"
            @update:model-value="(v: string) => locationFilter = v"
          />
        </div>

        <div class="tb-filter">
          <Select
            :model-value="categoryFilter"
            :placeholder="t('filter_all_categories')"
            :options="categoryOptions"
            @update:model-value="(v: string) => categoryFilter = v"
          />
        </div>

        <div class="tb-filter">
          <Select
            :model-value="itemTypeFilter"
            :placeholder="t('filter_all_types')"
            :options="itemTypeOptions"
            @update:model-value="(v: string) => itemTypeFilter = v"
          />
        </div>

        <label class="row tb-toggle" style="gap:8px; cursor:pointer;">
          <Switch v-model="reservedOnly" />
          <span style="font-size:13px;">{{ t('filter_reserved_only') }}</span>
        </label>
      </WorkspaceToolbar>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="visibleRows"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
      >
        <!-- Item -->
        <template #cell.item="{ row }">
          <span class="cell-strong">{{ row.stock_item?.name ?? '—' }}</span>
        </template>

        <!-- SKU -->
        <template #cell.sku="{ row }">
          <span class="mono cell-muted">{{ row.stock_item?.sku ?? '—' }}</span>
        </template>

        <!-- Location -->
        <template #cell.location="{ row }">
          <span class="row" style="gap:8px; align-items:center;">
            <span class="cell-strong">{{ row.location?.name ?? '—' }}</span>
            <Badge
              v-if="row.location?.type"
              :tone="LOCATION_TONE[row.location.type] ?? 'neutral'"
            >
              {{ t(`location_type_${row.location.type}`) }}
            </Badge>
          </span>
        </template>

        <!-- Unit -->
        <template #cell.unit="{ row }">
          <span class="cell-muted">{{ row.stock_item?.unit ?? '—' }}</span>
        </template>

        <!-- Quantity -->
        <template #cell.quantity="{ row }">
          <span class="mono">{{ formatQty(row.quantity) }}</span>
        </template>

        <!-- Reserved -->
        <template #cell.reserved="{ row }">
          <span
            class="mono"
            :class="Number(row.reserved_quantity) > 0 ? 'cell-strong t-warning-text' : 'cell-muted'"
            :style="Number(row.reserved_quantity) > 0 ? { color: 'rgb(var(--v-theme-warning-strong))' } : undefined"
          >
            {{ formatQty(row.reserved_quantity) }}
          </span>
        </template>

        <!-- Available -->
        <template #cell.available="{ row }">
          <span
            class="mono"
            :class="Number(row.available_quantity) <= 0 ? 'cell-strong' : ''"
            :style="Number(row.available_quantity) <= 0 ? { color: 'rgb(var(--v-theme-error-strong))' } : undefined"
          >
            {{ formatQty(row.available_quantity) }}
          </span>
        </template>

        <!-- Last movement -->
        <template #cell.last_movement="{ row }">
          <span class="mono cell-muted nowrap">{{ row.last_movement_at ? formatDateShort(row.last_movement_at) : '—' }}</span>
        </template>

        <!-- Row actions -->
        <template #row-actions="{ row }">
          <IconAction
            icon="lock"
            tone="primary"
            :title="t('reserve_stock')"
            :disabled="Number(row.available_quantity) <= 0"
            @click="openReserveModal(row)"
          />
          <IconAction
            icon="unlock"
            tone="warning"
            :title="t('release_reservation')"
            :disabled="Number(row.reserved_quantity) <= 0"
            @click="openReleaseModal(row)"
          />
        </template>

        <!-- Empty -->
        <template #empty>
          <StateFill
            icon="box"
            :title="t('msg_no_reservations')"
            :sub="t('stock_reservations_subtitle')"
          >
            <div v-if="hasFilters" style="margin-top: 12px;">
              <Button variant="secondary" @click="clearFilters">
                {{ t('action_cancel') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </div>

    <!-- Reserve / Release modal -->
    <Modal
      :open="modalMode !== null"
      :width="560"
      :title="modalTitle"
      :close-on-backdrop="!submitting"
      :close-on-esc="!submitting"
      @close="closeModal"
    >
      <div class="grid cols-2 modal-grid" style="gap: var(--sp-4);">
        <Field
          :label="t('field_stock_item')"
          :error="errors.stock_item_id"
        >
          <Select
            :model-value="form.stock_item_id"
            :placeholder="t('field_stock_item')"
            :options="stockItemOptions"
            :disabled="modalMode === 'release' || !!modalRow"
            :error="!!errors.stock_item_id"
            @update:model-value="(v: string) => form.stock_item_id = v"
          />
        </Field>

        <Field
          :label="t('field_location')"
          :error="errors.location_id"
        >
          <Select
            :model-value="form.location_id"
            :placeholder="t('field_location')"
            :options="locationOptions"
            :disabled="modalMode === 'release' || !!modalRow"
            :error="!!errors.location_id"
            @update:model-value="(v: string) => form.location_id = v"
          />
        </Field>

        <Field
          :label="t('field_quantity')"
          :error="errors.quantity"
          :hint="!errors.quantity ? quantityHint : undefined"
        >
          <Input
            v-model="form.quantity"
            type="number"
            step="0.0001"
            min="0.0001"
            :error="!!errors.quantity"
            :placeholder="t('field_quantity')"
          />
        </Field>

        <Field :label="t('field_reference_type')" :hint="t('hint_reference_type')">
          <Select
            :model-value="form.reference_type"
            :placeholder="t('field_reference_type')"
            :options="referenceTypeOptions"
            @update:model-value="(v: string) => form.reference_type = v"
          />
        </Field>

        <Field :label="t('field_reference_id')" :hint="t('hint_reference_id')">
          <Input
            v-model="form.reference_id"
            type="number"
            min="1"
            step="1"
            :placeholder="t('field_reference_id')"
          />
        </Field>

        <Field :label="t('field_notes')" style="grid-column: 1 / -1;">
          <Textarea
            v-model="form.notes"
            class="control"
            rows="3"
            style="resize: vertical; padding: 10px; font: inherit;"
            :placeholder="t('field_notes')"
          />
        </Field>
      </div>

      <!-- Context row info on release -->
      <div
        v-if="modalRow"
        class="row"
        style="gap:14px; align-items:flex-start; margin-top: var(--sp-4); padding: var(--sp-3); background: var(--surface-soft, var(--surface)); border: 1px solid var(--border); border-radius: var(--r-md);"
      >
        <div class="kpi__icon t-info" style="width:36px;height:36px;flex:0 0 36px;">
          <DesignIcon name="info" :size="18" />
        </div>
        <div style="min-width:0;">
          <p style="margin:0; font-weight:600;">
            {{ modalRow.stock_item?.name ?? '—' }}
            <span class="cell-muted" style="font-weight:400;">
              · {{ modalRow.location?.name ?? '—' }}
            </span>
          </p>
          <p class="muted" style="margin:6px 0 0; font-size:13px;">
            {{ t('col_reserved') }}: <b>{{ formatQty(modalRow.reserved_quantity) }}</b>
            · {{ t('col_available') }}: <b>{{ formatQty(modalRow.available_quantity) }}</b>
          </p>
        </div>
      </div>

      <template #footer>
        <Button variant="ghost" :disabled="submitting" @click="closeModal">
          {{ t('action_cancel') }}
        </Button>
        <Button
          :variant="submitVariant"
          :loading="submitting"
          :disabled="submitting"
          @click="submit"
        >
          {{ submitLabel }}
        </Button>
      </template>
    </Modal>
  </WorkspacePage>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
}

.res-toolbar {
  flex-wrap: wrap;
  gap: 12px;
  row-gap: 12px;
}

.tb-search {
  max-width: 280px;
  min-width: 200px;
  flex: 1 1 200px;
}

.tb-filter {
  width: 200px;
  min-width: 160px;
  flex: 0 1 200px;
}

.tb-toggle {
  margin-left: auto;
}

@media (max-width: 1100px) {
  .kpi-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .kpi-strip {
    grid-template-columns: repeat(2, 1fr);
  }

  .modal-grid {
    grid-template-columns: 1fr;
  }

  .res-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .tb-search,
  .tb-filter {
    width: 100%;
    max-width: 100%;
    flex: 1 1 100%;
  }

  .tb-toggle {
    margin-left: 0;
  }
}

@media (max-width: 420px) {
  .kpi-strip {
    grid-template-columns: 1fr;
  }
}
</style>

<route lang="yaml">
name: stock-reservations
meta:
  action: manage
  subject: all
</route>
