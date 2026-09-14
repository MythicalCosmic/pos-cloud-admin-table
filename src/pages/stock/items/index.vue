<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   Stock Items — refactored to design primitives
   Preserves all axios calls, filters, refs, computeds.
   Replaces Vuetify (VDataTableServer/VDialog/VBtn/VTextField/VSelect)
   with the design DataTable + Modal + Input + Select + IconAction.
   ============================================================ */
import ItemFormDialog from '@/components/stock/items/ItemFormDialog.vue'
import { stockApi as axios } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import BarcodeScanner from '@/components/design/BarcodeScanner.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const route = useRoute()
const { hasPermission } = useUserAccess()
const canManageStock = computed(() => hasPermission('stock.manage'))

const items = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const search = ref('')
const barcodeQuery = ref('')
const barcodeLoading = ref(false)
const scanOpen = ref(false)

function onScanned(code: string) {
  barcodeQuery.value = code
  // Defer lookup one tick so the v-model reflects the new value before lookup runs.
  nextTick(() => { lookupBarcode() })
}
const requestedType = String(Array.isArray(route.query.type) ? route.query.type[0] : route.query.type ?? '').toUpperCase()
const typeFilter = ref<string | undefined>(
  ['RAW', 'SEMI', 'FINISHED', 'PACKAGING'].includes(requestedType) ? requestedType : undefined,
)
const categoryFilter = ref<number | undefined>(undefined)
const lowStockOnly = ref(false)
const statusFilter = ref<string>('all')

// Categories for filter dropdown
const categoriesList = ref<any[]>([])

// Catalog stats (KPI strip) — GET /items/stats/ → { total_items, by_type, low_stock_count, no_category_count }
const stats = ref<any>(null)

// Dialogs
const dialog = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const deleteDialog = ref(false)
const deleting = ref(false)
const selectedItem = ref<any>(null)

// Units for dropdown
const unitsList = ref<any[]>([])

// Map item_type → Badge tone (design system tone)
const typeTone: Record<string, 'success' | 'warning' | 'primary' | 'neutral'> = {
  RAW: 'success',
  SEMI: 'warning',
  FINISHED: 'primary',
  PACKAGING: 'neutral',
}

const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatCurrency } = useFormatters()

// Columns for the design DataTable
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'sku', label: t('SKU') },
  { key: 'name', label: t('Name') },
  { key: 'barcode', label: t('Barcode') },
  { key: 'item_type', label: t('Type') },
  { key: 'category', label: t('Category') },
  { key: 'base_unit', label: t('Unit') },
  { key: 'avg_cost_price', label: t('item_drill_avg_cost'), align: 'right' },
  { key: 'is_active', label: t('Status') },
])

async function loadItems() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (search.value)
      params.search = search.value
    if (typeFilter.value)
      params.type = typeFilter.value
    if (categoryFilter.value)
      params.category_id = categoryFilter.value
    if (lowStockOnly.value)
      params.low_stock = 'true'
    if (statusFilter.value === 'active')
      params.active_only = 'true'
    else if (statusFilter.value === 'inactive')
      params.active_only = 'false'

    const res = await axios.get('/items/', { params })
    const d = res.data?.data ?? res.data

    items.value = d?.items ?? []
    total.value = d.pagination?.total_items ?? d.pagination?.total ?? items.value.length
  }
  catch {
    notify(t('Failed to load items'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadStats() {
  try {
    const res = await axios.get('/items/stats/')
    stats.value = res.data?.data ?? res.data
  }
  catch { /* stats are non-critical — leave KPIs blank on failure */ }
}

async function loadMeta() {
  try {
    const [catRes, unitRes] = await Promise.all([
      axios.get('/categories/', { params: { per_page: 200 } }),
      axios.get('/units/', { params: { per_page: 200 } }),
    ])

    const catD = catRes.data?.data ?? catRes.data
    const unitD = unitRes.data?.data ?? unitRes.data

    categoriesList.value = catD?.categories ?? []
    unitsList.value = unitD?.units ?? []
  }
  catch { /* ignore */ }
}

onMounted(() => { loadItems(); loadMeta(); loadStats() })

// Reload table + stats together after any mutation.
function reloadAll() {
  loadItems()
  loadStats()
}
watch([page, itemsPerPage], loadItems)
watch([search, typeFilter, categoryFilter, lowStockOnly, statusFilter], () => { page.value = 1; loadItems() })

const categoryOptions = computed(() => categoriesList.value.map(c => ({ title: c.name, value: c.id })))
const unitOptions = computed(() => unitsList.value.map(u => ({ title: `${u.name} (${u.short_name})`, value: u.id })))

// Design Select needs { value, label } objects (strings)
const categorySelectOptions = computed(() => categoriesList.value.map(c => ({ value: String(c.id), label: c.name })))
const typeSelectOptions = computed(() => ['RAW', 'SEMI', 'FINISHED', 'PACKAGING'].map(v => ({ value: v, label: t(`item_type_${v}`) })))
const statusSelectOptions = computed(() => [
  { value: 'all', label: t('All Statuses') },
  { value: 'active', label: t('item_status_active') },
  { value: 'inactive', label: t('item_status_inactive') },
])

// --- KPI values (over the whole catalog, not just the current page) ---
const kpiTotal = computed(() => (stats.value ? stats.value.total_items ?? 0 : null))
const kpiLowStock = computed(() => (stats.value ? stats.value.low_stock_count ?? 0 : null))
const kpiRaw = computed(() => (stats.value ? stats.value.by_type?.RAW ?? 0 : null))
const kpiUncategorized = computed(() => (stats.value ? stats.value.no_category_count ?? 0 : null))

// Clicking the low-stock KPI toggles the low-stock filter.
function toggleLowStock() {
  lowStockOnly.value = !lowStockOnly.value
}

// --- Active filter chips ---
const hasFilters = computed(() =>
  !!(search.value || typeFilter.value || categoryFilter.value !== undefined
    || (statusFilter.value && statusFilter.value !== 'all') || lowStockOnly.value),
)
function clearAll() {
  search.value = ''
  typeFilter.value = undefined
  categoryFilter.value = undefined
  statusFilter.value = 'all'
  lowStockOnly.value = false
}
const categoryLabel = computed(() =>
  categoriesList.value.find(c => c.id === categoryFilter.value)?.name ?? '',
)

function openCreate() {
  if (!canManageStock.value)
    return

  dialogMode.value = 'create'
  selectedItem.value = null
  dialog.value = true
}

function openEdit(item: any) {
  if (!canManageStock.value)
    return

  dialogMode.value = 'edit'
  selectedItem.value = item
  dialog.value = true
}

function confirmDelete(item: any) {
  if (!canManageStock.value)
    return

  selectedItem.value = item
  deleteDialog.value = true
}

async function doDelete() {
  if (!canManageStock.value)
    return

  deleting.value = true
  try {
    await axios.delete(`/items/${selectedItem.value.id}/`)
    notify(t('Item deleted'))
    deleteDialog.value = false
    reloadAll()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error deleting item'), 'error')
  }
  finally {
    deleting.value = false
  }
}

async function lookupBarcode() {
  const code = (barcodeQuery.value || '').trim()
  if (!code)
    return
  barcodeLoading.value = true
  try {
    const res = await axios.get(`/items/barcode/${encodeURIComponent(code)}/`)
    const d = res.data?.data ?? res.data
    const item = d?.item ?? d
    const id = item?.id
    if (id) {
      notify(t('items_ext_open'))
      router.push({ path: '/stock/items', query: { id: String(id) } })
      barcodeQuery.value = ''
    }
    else {
      notify(t('items_ext_not_found'), 'error')
    }
  }
  catch (e: any) {
    const status = e?.response?.status
    if (status === 404)
      notify(t('items_ext_not_found'), 'error')
    else
      notify(e?.response?.data?.message ?? t('items_ext_not_found'), 'error')
  }
  finally {
    barcodeLoading.value = false
  }
}

async function toggleActive(item: any) {
  if (!canManageStock.value)
    return

  try {
    // The item detail route accepts GET/PUT/DELETE (NOT PATCH). Deactivation is a
    // soft-delete (DELETE), which the backend blocks while stock remains on hand;
    // reactivation goes through PUT. Using the real verbs avoids a 405 and surfaces
    // the backend's "adjust stock to zero first" guard to the operator.
    if (item.is_active)
      await axios.delete(`/items/${item.id}/`)
    else
      await axios.put(`/items/${item.id}/`, { is_active: true })
    notify(item.is_active ? t('Item deactivated') : t('Item activated'))
    reloadAll()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error updating item'), 'error')
  }
}

// DataTable pagination passthrough (controlled by server)
const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('items_page_title')"
      :subtitle="t('items_page_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canManageStock"
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('Add Item') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div class="grid cols-4 kpi-grid" style="margin-bottom: var(--sp-5);">
      <Kpi
        :data="{
          label: t('items_kpi_total'),
          icon: 'package',
          tone: 'primary',
          value: kpiTotal,
        }"
      />
      <div
        class="kpi-click"
        :class="{ 'is-active': lowStockOnly }"
        role="button"
        tabindex="0"
        :title="t('items_kpi_low_stock_hint')"
        @click="toggleLowStock"
        @keydown.enter.prevent="toggleLowStock"
        @keydown.space.prevent="toggleLowStock"
      >
        <Kpi
          :data="{
            label: t('items_kpi_low_stock'),
            icon: 'alert',
            tone: 'warning',
            value: kpiLowStock,
          }"
        />
      </div>
      <Kpi
        :data="{
          label: t('items_kpi_raw'),
          icon: 'box',
          tone: 'success',
          value: kpiRaw,
        }"
      />
      <Kpi
        :data="{
          label: t('items_kpi_uncategorized'),
          icon: 'tag',
          tone: 'neutral',
          value: kpiUncategorized,
        }"
      />
    </div>

    <div class="card">
      <!-- Toolbar -->
      <WorkspaceToolbar class="toolbar items-toolbar">
        <div class="grow tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search items...')"
            :aria-label="t('Search items...')"
          />
        </div>

        <div class="tb-filter tb-filter--md" style="display: flex; gap: 6px; align-items: stretch;">
          <Input
            v-model="barcodeQuery"
            icon="barcode"
            :placeholder="t('items_ext_barcode_placeholder')"
            :aria-label="t('items_ext_barcode_tab')"
            :disabled="barcodeLoading"
            style="flex: 1;"
            @keydown.enter.prevent="lookupBarcode"
          />
          <!-- Open camera-based barcode scanner. Only meaningful on devices with a camera. -->
          <button
            type="button"
            class="scan-trigger"
            :title="t('Scan barcode')"
            :aria-label="t('Scan barcode')"
            :disabled="barcodeLoading"
            @click="scanOpen = true"
          >
            <DesignIcon name="camera" :size="18" />
          </button>
        </div>

        <div class="tb-filter tb-filter--sm">
          <Select
            :model-value="typeFilter ?? ''"
            :placeholder="t('All Types')"
            :options="typeSelectOptions"
            @update:model-value="(v: string) => typeFilter = v ? v : undefined"
          />
        </div>

        <div class="tb-filter tb-filter--sm">
          <Select
            :model-value="statusFilter"
            :placeholder="t('All Statuses')"
            :options="statusSelectOptions"
            @update:model-value="(v: string) => statusFilter = v || 'all'"
          />
        </div>

        <div class="tb-filter tb-filter--md">
          <Select
            :model-value="categoryFilter !== undefined ? String(categoryFilter) : ''"
            :placeholder="t('All Categories')"
            :options="categorySelectOptions"
            @update:model-value="(v: string) => categoryFilter = v ? Number(v) : undefined"
          />
        </div>

        <label class="row tb-switch">
          <Switch v-model="lowStockOnly" />
          <span class="tb-switch__label">{{ t('Low stock only') }}</span>
        </label>
      </WorkspaceToolbar>

      <!-- Active filter chips -->
      <div v-if="hasFilters" class="toolbar" style="padding-top: 0;">
        <div class="chips">
          <span class="tertiary" style="font-size: 13px; margin-right: 2px;">{{ t('Filters') }}:</span>

          <span v-if="search" class="chip">
            <span>{{ t('Search') }}: <b>{{ search }}</b></span>
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

          <span v-if="typeFilter" class="chip">
            <span>{{ t('Type') }}: <b>{{ t(`item_type_${typeFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="typeFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span v-if="categoryFilter !== undefined" class="chip">
            <span>{{ t('Category') }}: <b>{{ categoryLabel }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="categoryFilter = undefined"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span v-if="statusFilter && statusFilter !== 'all'" class="chip">
            <span>{{ t('Status') }}: <b>{{ t(`item_status_${statusFilter}`) }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="statusFilter = 'all'"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <span v-if="lowStockOnly" class="chip">
            <span>{{ t('Low stock only') }}</span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="lowStockOnly = false"
            ><DesignIcon
              name="close"
              :size="13"
            /></button>
          </span>

          <button class="chip--clear" @click="clearAll">
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columns"
        :rows="items"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
        :empty-title="t('items_no_results_title')"
        :empty-sub="t('items_no_results_sub')"
        empty-icon="inbox"
      >
        <template #cell.sku="{ row }">
          <span class="cell-strong mono">{{ row.sku ?? '—' }}</span>
        </template>

        <template #cell.barcode="{ row }">
          <span v-if="row.barcode" class="cell-muted mono">{{ row.barcode }}</span>
          <span v-else class="cell-muted">—</span>
        </template>

        <template #cell.item_type="{ row }">
          <Badge :tone="typeTone[row.item_type] ?? 'neutral'">
            {{ row.item_type ? t(`item_type_${row.item_type}`) : (row.item_type_display ?? '—') }}
          </Badge>
        </template>

        <template #cell.category="{ row }">
          <span class="cell-muted">{{ row.category?.name ?? '—' }}</span>
        </template>

        <template #cell.base_unit="{ row }">
          <span class="cell-muted">{{ row.base_unit?.short_name ?? row.base_unit?.name ?? '—' }}</span>
        </template>

        <template #cell.avg_cost_price="{ row }">
          <span class="mono cell-strong">{{ formatCurrency(row.avg_cost_price ?? row.cost_price ?? 0) }}</span>
        </template>

        <template #cell.is_active="{ row }">
          <Badge :tone="row.is_active ? 'success' : 'neutral'" dot>
            {{ row.is_active ? t('Active') : t('Inactive') }}
          </Badge>
        </template>

        <template v-if="canManageStock" #row-actions="{ row }">
          <IconAction
            icon="edit"
            :title="t('Edit')"
            @click="openEdit(row)"
          />
          <IconAction
            :icon="row.is_active ? 'pause' : 'play'"
            :tone="row.is_active ? 'warning' : 'success'"
            :title="row.is_active ? t('Deactivate') : t('Activate')"
            @click="toggleActive(row)"
          />
          <IconAction
            icon="trash"
            tone="danger"
            :title="t('Delete')"
            @click="confirmDelete(row)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('items_no_results_title')"
            :sub="hasFilters ? t('items_no_results_sub') : t('items_empty_sub')"
          >
            <div v-if="hasFilters" style="margin-top: 12px;">
              <Button variant="secondary" @click="clearAll">
                {{ t('Clear filters') }}
              </Button>
            </div>
            <div v-else-if="canManageStock" style="margin-top: 12px;">
              <Button variant="primary" icon="plus" @click="openCreate">
                {{ t('Add Item') }}
              </Button>
            </div>
          </StateFill>
        </template>
      </DataTable>
    </div>

    <!-- Create / Edit Dialog (kept as ItemFormDialog) -->
    <ItemFormDialog
      v-if="canManageStock"
      v-model="dialog"
      :mode="dialogMode"
      :item="selectedItem"
      :category-options="categoryOptions"
      :unit-options="unitOptions"
      @saved="reloadAll"
    />

    <!-- Delete confirmation -->
    <Modal
      v-if="canManageStock"
      :open="deleteDialog"
      :width="440"
      :title="t('Delete Item')"
      :subtitle="t('This action cannot be undone')"
      @close="deleteDialog = false"
    >
      <div class="row delete-confirm">
        <div class="kpi__icon t-error delete-confirm__icon">
          <DesignIcon name="alert" :size="22" />
        </div>
        <div class="delete-confirm__body">
          <p class="delete-confirm__name">
            {{ selectedItem?.name }}
          </p>
          <p class="muted delete-confirm__sub">
            {{ t('items_confirm_delete_body') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          :loading="deleting"
          :disabled="deleting"
          @click="doDelete"
        >
          {{ t('Delete') }}
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

    <!-- Camera-based EAN/UPC/QR scanner. Lazy-loads ~150kB ZXing on first open. -->
    <BarcodeScanner v-model:open="scanOpen" @decoded="onScanned" />
  </WorkspacePage>
</template>

<style scoped>
/* Camera-scan trigger button */
.scan-trigger {
  display: grid;
  place-items: center;
  width: 38px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-secondary);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.scan-trigger:hover {
  background: var(--surface-2);
  color: var(--text);
}
.scan-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Clickable low-stock KPI */
.kpi-click {
  cursor: pointer;
  border-radius: var(--radius, 12px);
  transition: box-shadow 0.12s ease, transform 0.12s ease;
}
.kpi-click:hover {
  transform: translateY(-1px);
}
.kpi-click:focus-visible {
  outline: 2px solid rgb(var(--v-theme-warning-strong));
  outline-offset: 2px;
}
.kpi-click.is-active {
  box-shadow: 0 0 0 2px rgb(var(--v-theme-warning-strong)) inset;
  border-radius: 14px;
}

@media (max-width: 1100px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 420px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

/* --- Responsive toolbar --- */
.items-toolbar {
  flex-wrap: wrap;
  row-gap: 8px;
}

.tb-search {
  max-width: 280px;
  min-width: 200px;
  flex: 1 1 200px;
}

.tb-filter {
  flex: 0 1 auto;
}

.tb-filter--md { width: 200px; }
.tb-filter--sm { width: 170px; }

.tb-switch {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 8px;
  cursor: pointer;
}

.tb-switch__label {
  font-size: 13px;
}

.tb-spacer {
  margin-left: auto;
}

/* Delete confirm body */
.delete-confirm {
  gap: 14px;
  align-items: flex-start;
}

.delete-confirm__icon {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
}

.delete-confirm__body {
  min-width: 0;
  flex: 1 1 auto;
}

.delete-confirm__name {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.delete-confirm__sub {
  margin: 6px 0 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}

/* Tablet collapse */
@media (max-width: 1100px) {
  .tb-spacer {
    margin-left: 0;
    flex-basis: 100%;
    height: 0;
  }
  .tb-filter--md,
  .tb-filter--sm {
    width: auto;
    flex: 1 1 160px;
    min-width: 160px;
  }
  .tb-search {
    max-width: none;
    flex: 1 1 100%;
  }
}

/* Mobile collapse — canonical phone breakpoint */
@media (max-width: 768px) {
  .items-toolbar {
    gap: 10px;
  }
  .tb-filter,
  .tb-search,
  .tb-switch {
    flex: 1 1 100% !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: none !important;
  }
}

.row {
  display: flex;
  align-items: center;
}
</style>

<route lang="yaml">
name: stock-items
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.catalog.view
</route>
