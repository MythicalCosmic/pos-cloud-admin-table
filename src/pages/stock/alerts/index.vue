<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'

/* ============================================================
   STOCK ALERTS — alert rule configuration + live low-stock view
   Two sections behind a Segmented switch:
     • configs   — CRUD alert rules (POST upserts on alert_type)
     • low_stock — live read-only view of items below reorder
   Uses design primitives (PageHeader, Card, Segmented, DataTable,
   Modal, Field, Input, Select, Switch, Button, Badge, IconAction,
   Kpi, StateFill). Plain HTML + design-shell classes. No Vuetify.
   ============================================================ */
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import { stockApi } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Kpi from '@/components/design/Kpi.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Segmented from '@/components/design/Segmented.vue'
import Select from '@/components/design/Select.vue'
import Switch from '@/components/design/Switch.vue'

const { t } = useI18n({ useScope: 'global' })
const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()

// ============================================================
// Tab state
// ============================================================
type Tab = 'configs' | 'low_stock'
const activeTab = ref<Tab>('configs')

// ============================================================
// Enum values
// ============================================================
const ALERT_TYPES = ['LOW_STOCK', 'EXPIRING', 'NEGATIVE', 'OVERSTOCK']

const ALERT_TYPE_TONE: Record<string, 'primary' | 'info' | 'neutral' | 'success' | 'warning' | 'error'> = {
  LOW_STOCK: 'warning',
  EXPIRING: 'info',
  NEGATIVE: 'error',
  OVERSTOCK: 'primary',
}

// ============================================================
// Alert rule (configs) state
// ============================================================
const alerts = ref<any[]>([])
const loadingAlerts = ref(false)
const totalAlerts = ref(0)
const pageAlerts = ref(1)
const perPageAlerts = ref(10)

const alertTypeFilter = ref<string>('')
const activeOnly = ref(false)
const searchAlerts = ref('')

// ============================================================
// Low-stock state
// ============================================================
const lowStock = ref<any[]>([])
const loadingLow = ref(false)
const totalLow = ref(0)
const pageLow = ref(1)
const perPageLow = ref(10)

const locationFilter = ref<number | ''>('')
const searchLow = ref('')

const locationsList = ref<any[]>([])

// ============================================================
// Modal state — create / edit alert rule
// ============================================================
const dialogOpen = ref(false)
const dialogLoading = ref(false)
const editing = ref<any>(null)

const form = ref({
  alert_type: 'LOW_STOCK',
  notify_in_app: true,
  notify_email: false,
  notify_telegram: true,
  threshold_value: null as number | null,
  is_active: true,
})

const errors = ref<Record<string, string>>({})

// Toggle-off confirm
const toggleConfirm = ref<{ rule: any; newValue: boolean } | null>(null)
const togglingId = ref<number | null>(null)
const editingId = ref<number | null>(null)

// Adjust-stock modal (row action on low-stock items)
const adjustDialog = ref(false)
const adjustLoading = ref(false)
const adjustRow = ref<any>(null)
const adjustForm = ref({
  quantity: 0,
  movement_type: 'ADJUSTMENT',
  notes: '',
})

const MOVEMENT_TYPES = ['ADJUSTMENT', 'WASTE', 'COUNT', 'RETURN', 'PURCHASE', 'SALE']

// ============================================================
// Formatters
// ============================================================
function fmtQty(v: any): string {
  if (v === null || v === undefined || v === '')
    return '—'
  const n = Number(v)
  if (Number.isNaN(n))
    return '—'

  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

// ============================================================
// API
// ============================================================
async function loadAlerts() {
  loadingAlerts.value = true
  try {
    const params: any = { page: pageAlerts.value, per_page: perPageAlerts.value }

    if (alertTypeFilter.value)
      params.alert_type = alertTypeFilter.value
    if (activeOnly.value)
      params.is_active = true
    if (searchAlerts.value)
      params.search = searchAlerts.value

    const res = await stockApi.get('/alerts/', { params })
    const d = res.data?.data ?? res.data

    alerts.value = d?.alerts ?? d?.results ?? d?.items ?? (Array.isArray(d) ? d : [])
    totalAlerts.value = d?.count ?? d?.pagination?.total_items ?? d?.pagination?.total ?? alerts.value.length
  }
  catch {
    notify(t('Failed to load alert rules'), 'error')
  }
  finally {
    loadingAlerts.value = false
  }
}

async function loadLowStock() {
  loadingLow.value = true
  try {
    const params: any = { page: pageLow.value, per_page: perPageLow.value }

    if (locationFilter.value)
      params.location_id = locationFilter.value
    if (searchLow.value)
      params.search = searchLow.value

    const res = await stockApi.get('/low-stock/', { params })
    const d = res.data?.data ?? res.data

    lowStock.value = d?.alerts ?? d?.items ?? d?.low_stock ?? d?.results ?? (Array.isArray(d) ? d : [])
    totalLow.value = d?.count ?? d?.pagination?.total_items ?? d?.pagination?.total ?? lowStock.value.length
  }
  catch {
    notify(t('Failed to load low-stock items'), 'error')
  }
  finally {
    loadingLow.value = false
  }
}

async function loadLocations() {
  try {
    const res = await stockApi.get('/locations/', { params: { per_page: 200 } })
    const d = res.data?.data ?? res.data

    locationsList.value = d?.locations ?? d?.results ?? (Array.isArray(d) ? d : [])
  }
  catch { /* ignore — filter just stays empty */ }
}

onMounted(() => {
  loadAlerts()
  loadLowStock()
  loadLocations()
})

watch([pageAlerts, perPageAlerts], loadAlerts)
watch([pageLow, perPageLow], loadLowStock)

const debSearchAlerts = useDebounceFn(() => { pageAlerts.value = 1; loadAlerts() }, 400)
const debSearchLow = useDebounceFn(() => { pageLow.value = 1; loadLowStock() }, 400)

watch(searchAlerts, debSearchAlerts)
watch(searchLow, debSearchLow)
watch([alertTypeFilter, activeOnly], () => { pageAlerts.value = 1; loadAlerts() })
watch(locationFilter, () => { pageLow.value = 1; loadLowStock() })

// ============================================================
// Dialog: create / edit alert rule
// ============================================================
function openCreate() {
  editing.value = null
  form.value = {
    alert_type: 'LOW_STOCK',
    notify_in_app: true,
    notify_email: false,
    notify_telegram: true,
    threshold_value: null,
    is_active: true,
  }
  errors.value = {}
  dialogOpen.value = true
}

function openEdit(row: any) {
  if (editingId.value !== null) return
  editingId.value = row.id ?? null
  editing.value = row
  form.value = {
    alert_type: row.alert_type ?? 'LOW_STOCK',
    notify_in_app: !!row.notify_in_app,
    notify_email: !!row.notify_email,
    notify_telegram: !!row.notify_telegram,
    threshold_value: row.threshold_value !== null && row.threshold_value !== undefined
      ? Number(row.threshold_value)
      : null,
    is_active: row.is_active !== false,
  }
  errors.value = {}
  dialogOpen.value = true
}

function closeDialog() {
  if (dialogLoading.value) return
  dialogOpen.value = false
  editingId.value = null
}

async function save() {
  // Validation
  const err: Record<string, string> = {}
  if (!form.value.alert_type)
    err.alert_type = t('Required')

  errors.value = err
  if (Object.keys(err).length > 0) {
    notify(Object.values(err)[0], 'error')

    return
  }

  dialogLoading.value = true
  try {
    const payload: any = {
      alert_type: form.value.alert_type,
      notify_in_app: form.value.notify_in_app,
      notify_email: form.value.notify_email,
      notify_telegram: form.value.notify_telegram,
      is_active: form.value.is_active,
    }

    if (form.value.threshold_value !== null && form.value.threshold_value !== undefined && String(form.value.threshold_value) !== '')
      payload.threshold_value = form.value.threshold_value

    // POST upserts on alert_type (get_or_create on backend)
    await stockApi.post('/alerts/', payload)
    notify(editing.value ? t('Alert rule updated') : t('Alert rule created'))
    dialogOpen.value = false
    editingId.value = null
    await loadAlerts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    dialogLoading.value = false
  }
}

// ============================================================
// Toggle is_active (with confirm when turning OFF)
// ============================================================
function requestToggle(row: any) {
  const newValue = !row.is_active
  if (!newValue) {
    toggleConfirm.value = { rule: row, newValue }

    return
  }
  performToggle(row, newValue)
}

function cancelToggle() {
  toggleConfirm.value = null
}

function confirmToggle() {
  if (!toggleConfirm.value) return
  const { rule, newValue } = toggleConfirm.value
  toggleConfirm.value = null
  performToggle(rule, newValue)
}

async function performToggle(row: any, newValue: boolean) {
  if (togglingId.value !== null) return
  togglingId.value = row.id ?? null
  try {
    await stockApi.post('/alerts/', {
      alert_type: row.alert_type,
      is_active: newValue,
    })
    notify(t('Status updated'))
    await loadAlerts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    togglingId.value = null
  }
}

// ============================================================
// Adjust-stock action (row action on low-stock items)
// ============================================================
function openAdjust(row: any) {
  adjustRow.value = row
  adjustForm.value = {
    quantity: 0,
    movement_type: 'ADJUSTMENT',
    notes: '',
  }
  adjustDialog.value = true
}

function closeAdjust() {
  if (adjustLoading.value) return
  adjustDialog.value = false
  adjustRow.value = null
}

async function doAdjust() {
  if (!adjustRow.value) return
  if (!adjustForm.value.quantity) {
    notify(t('Quantity must not be zero'), 'error')

    return
  }

  adjustLoading.value = true
  try {
    const stock_item_id = adjustRow.value.stock_item_id ?? adjustRow.value.stock_item?.id ?? adjustRow.value.id
    const location_id = adjustRow.value.location_id ?? adjustRow.value.location?.id

    await stockApi.post('/adjust/', {
      stock_item_id,
      location_id,
      quantity: adjustForm.value.quantity,
      movement_type: adjustForm.value.movement_type,
      notes: adjustForm.value.notes,
    })
    notify(t('Stock adjusted'))
    adjustDialog.value = false
    adjustRow.value = null
    await loadLowStock()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    adjustLoading.value = false
  }
}

// ============================================================
// Filter chips (active filters)
// ============================================================
const activeFiltersConfigs = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (searchAlerts.value)
    out.push({ k: 'q', label: t('Search'), val: searchAlerts.value, clear: () => { searchAlerts.value = '' } })
  if (alertTypeFilter.value)
    out.push({ k: 'type', label: t('stock_alerts.filter.alert_type'), val: t(`stock_alert_type_${alertTypeFilter.value}`), clear: () => { alertTypeFilter.value = '' } })
  if (activeOnly.value)
    out.push({ k: 'active', label: t('stock_alerts.filter.is_active'), val: t('Yes'), clear: () => { activeOnly.value = false } })
  return out
})

const activeFiltersLow = computed(() => {
  const out: { k: string; label: string; val: string; clear: () => void }[] = []
  if (searchLow.value)
    out.push({ k: 'q', label: t('Search'), val: searchLow.value, clear: () => { searchLow.value = '' } })
  if (locationFilter.value) {
    const loc = locationsList.value.find((l: any) => l.id === locationFilter.value)
    out.push({ k: 'loc', label: t('stock_alerts.filter.location'), val: loc?.name ?? String(locationFilter.value), clear: () => { locationFilter.value = '' } })
  }
  return out
})

function clearAlertFilters() {
  searchAlerts.value = ''
  alertTypeFilter.value = ''
  activeOnly.value = false
}

function clearLowFilters() {
  searchLow.value = ''
  locationFilter.value = ''
}

// ============================================================
// Options
// ============================================================
const alertTypeOptions = computed(() => ALERT_TYPES.map(v => ({ value: v, label: t(`stock_alert_type_${v}`) })))
const locationOptions = computed(() => locationsList.value.map((l: any) => ({ value: l.id, label: l.name })))
const tabOptions = computed(() => [
  { value: 'configs', label: t('stock_alerts.tab.configs'), icon: 'bell' },
  { value: 'low_stock', label: t('stock_alerts.tab.low_stock'), icon: 'alert' },
])
const movementOptions = computed(() => MOVEMENT_TYPES.map(v => ({ value: v, label: v })))

// ============================================================
// KPIs
// ============================================================
const kpiActiveRules = computed(() => ({
  label: t('stock_alerts.kpi.active_rules'),
  value: alerts.value.filter((a: any) => a.is_active).length,
  icon: 'bell',
  tone: 'success' as const,
}))

const kpiTotalRules = computed(() => ({
  label: t('stock_alerts.kpi.total_rules'),
  value: totalAlerts.value,
  icon: 'sliders',
  tone: 'primary' as const,
}))

const kpiLowStock = computed(() => ({
  label: t('stock_alerts.kpi.low_stock_count'),
  value: totalLow.value,
  icon: 'alert',
  tone: 'warning' as const,
}))

// ============================================================
// Columns — configs (alert rules)
// ============================================================
const columnsConfigs: DataTableColumn<any>[] = [
  { key: 'alert_type', label: t('stock_alerts.col.alert_type'), sortable: true, width: 180 },
  { key: 'notify_in_app', label: t('stock_alerts.col.notify_in_app'), sortable: false, align: 'center', width: 110 },
  { key: 'notify_email', label: t('stock_alerts.col.notify_email'), sortable: false, align: 'center', width: 110 },
  { key: 'notify_telegram', label: t('stock_alerts.col.notify_telegram'), sortable: false, align: 'center', width: 110 },
  { key: 'threshold_value', label: t('stock_alerts.col.threshold'), sortable: true, align: 'right', width: 130 },
  { key: 'is_active', label: t('stock_alerts.col.status'), sortable: true, width: 120 },
]

// ============================================================
// Columns — low-stock
// ============================================================
const columnsLow: DataTableColumn<any>[] = [
  { key: 'stock_item_name', label: t('stock_alerts.col.item'), sortable: true, sortValue: (r: any) => r.stock_item_name ?? r.stock_item?.name ?? '' },
  { key: 'sku', label: t('stock_alerts.col.sku'), sortable: true, width: 140, sortValue: (r: any) => r.sku ?? r.stock_item?.sku ?? '' },
  { key: 'location_name', label: t('stock_alerts.col.location'), sortable: true, width: 180, sortValue: (r: any) => r.location_name ?? r.location?.name ?? '' },
  { key: 'current_quantity', label: t('stock_alerts.col.current_qty'), sortable: true, align: 'right', width: 120 },
  { key: 'reorder_point', label: t('stock_alerts.col.reorder_point'), sortable: true, align: 'right', width: 140 },
  { key: 'shortage', label: t('stock_alerts.col.shortage'), sortable: true, align: 'right', width: 120 },
]

// ============================================================
// Pagination wiring
// ============================================================
const paginationConfigs = computed(() => ({
  page: pageAlerts.value,
  perPage: perPageAlerts.value,
  total: totalAlerts.value,
  onPage: (n: number) => { pageAlerts.value = n },
  onPerPage: (n: number) => { perPageAlerts.value = n; pageAlerts.value = 1 },
}))

const paginationLow = computed(() => ({
  page: pageLow.value,
  perPage: perPageLow.value,
  total: totalLow.value,
  onPage: (n: number) => { pageLow.value = n },
  onPerPage: (n: number) => { perPageLow.value = n; pageLow.value = 1 },
}))

// ============================================================
// ESC handler — close whichever modal is open
// ============================================================
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (toggleConfirm.value) {
    cancelToggle()
    e.preventDefault()

    return
  }
  if (adjustDialog.value) {
    if (!adjustLoading.value) {
      adjustDialog.value = false
      adjustRow.value = null
      e.preventDefault()
    }

    return
  }
  if (dialogOpen.value) {
    closeDialog()
    e.preventDefault()
  }
}

onMounted(() => { window.addEventListener('keydown', onKeydown) })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKeydown) })

// Shortage helper — handle backends that don't pre-compute it
function shortageOf(row: any): number | null {
  if (row.shortage !== undefined && row.shortage !== null)
    return Number(row.shortage)
  const cur = Number(row.current_quantity ?? row.quantity ?? 0)
  const rp = Number(row.reorder_point ?? 0)
  if (Number.isNaN(cur) || Number.isNaN(rp)) return null
  return Math.max(0, rp - cur)
}
</script>

<template>
  <WorkspacePage class="page">
    <!-- Header -->
    <PageHeader
      :title="t('stock_alerts.title')"
      :subtitle="t('stock_alerts.subtitle')"
    >
      <template #actions>
        <Button
          v-if="activeTab === 'configs'"
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('stock_alerts.action.create') }}
        </Button>
        <Button
          v-else
          variant="secondary"
          icon="refresh"
          :loading="loadingLow"
          @click="loadLowStock"
        >
          {{ t('stock_alerts.action.refresh_low_stock') }}
        </Button>
      </template>
    </PageHeader>

    <!-- KPI strip -->
    <div
      class="grid cols-3"
      style="margin-bottom: var(--sp-5);"
    >
      <Kpi :data="kpiActiveRules" />
      <Kpi :data="kpiTotalRules" />
      <Kpi :data="kpiLowStock" />
    </div>

    <!-- Tab switch -->
    <div style="margin-bottom: var(--sp-4);">
      <Segmented
        v-model="activeTab"
        :options="tabOptions"
      />
    </div>

    <!-- ======================================================
         CONFIGS — alert rules
         ====================================================== -->
    <Card v-if="activeTab === 'configs'">
      <WorkspaceToolbar class="toolbar toolbar--wrap">
        <div class="tb-search">
          <Input
            v-model="searchAlerts"
            icon="search"
            :placeholder="t('stock_alerts.filter.search')"
          />
        </div>
        <div class="tb-select">
          <Select
            v-model="alertTypeFilter"
            icon="filter"
            :placeholder="t('stock_alerts.filter.alert_type')"
            :options="alertTypeOptions"
          />
        </div>
        <div
          class="row"
          style="gap:10px;align-items:center;"
        >
          <Switch
            v-model="activeOnly"
            :aria-label="t('stock_alerts.filter.is_active')"
          />
          <span style="font-size:14px;color:var(--text-secondary);">
            {{ t('stock_alerts.filter.is_active') }}
          </span>
        </div>
      </WorkspaceToolbar>

      <div
        v-if="activeFiltersConfigs.length > 0"
        class="toolbar"
        style="padding-top:0;"
      >
        <div class="chips">
          <span
            class="tertiary"
            style="font-size:13px;margin-right:2px;"
          >{{ t('Filters') }}:</span>
          <span
            v-for="f in activeFiltersConfigs"
            :key="f.k"
            class="chip"
          >
            <span>{{ f.label }}: <b>{{ f.val }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="f.clear()"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>
          <button
            class="chip--clear"
            @click="clearAlertFilters"
          >
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columnsConfigs"
        :rows="alerts"
        row-key="id"
        :loading="loadingAlerts"
        :pagination="paginationConfigs"
        :initial-sort="{ key: 'alert_type', dir: 'asc' }"
      >
        <template #cell.alert_type="{ row }">
          <Badge :tone="ALERT_TYPE_TONE[row.alert_type] || 'neutral'">
            {{ row.alert_type ? t(`stock_alert_type_${row.alert_type}`) : '' }}
          </Badge>
        </template>

        <template #cell.notify_in_app="{ row }">
          <Badge :tone="row.notify_in_app ? 'success' : 'neutral'">
            {{ t(`stock_alert_notify_${row.notify_in_app ? 'ON' : 'OFF'}`) }}
          </Badge>
        </template>

        <template #cell.notify_email="{ row }">
          <Badge :tone="row.notify_email ? 'success' : 'neutral'">
            {{ t(`stock_alert_notify_${row.notify_email ? 'ON' : 'OFF'}`) }}
          </Badge>
        </template>

        <template #cell.notify_telegram="{ row }">
          <Badge :tone="row.notify_telegram ? 'success' : 'neutral'">
            {{ t(`stock_alert_notify_${row.notify_telegram ? 'ON' : 'OFF'}`) }}
          </Badge>
        </template>

        <template #cell.threshold_value="{ row }">
          <span class="mono num-tabular">{{ fmtQty(row.threshold_value) }}</span>
        </template>

        <template #cell.is_active="{ row }">
          <Badge
            :tone="row.is_active ? 'success' : 'neutral'"
            dot
          >
            {{ t(`stock_alert_status_${row.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            :icon="row.is_active ? 'pause' : 'play'"
            tone="warning"
            :title="t('stock_alerts.action.toggle_active')"
            :disabled="togglingId === row.id"
            :class="{ 'is-busy': togglingId === row.id }"
            @click="requestToggle(row)"
          />
          <IconAction
            icon="pencil"
            tone="primary"
            :title="t('stock_alerts.action.edit')"
            :disabled="editingId === row.id"
            @click="openEdit(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="bell"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('stock_alerts.empty.rules') }}
            </div>
            <div style="margin-top:12px;">
              <Button
                variant="primary"
                icon="plus"
                @click="openCreate"
              >
                {{ t('stock_alerts.action.create') }}
              </Button>
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- ======================================================
         LOW STOCK — read-only live view
         ====================================================== -->
    <Card v-else>
      <WorkspaceToolbar class="toolbar toolbar--wrap">
        <div class="tb-search">
          <Input
            v-model="searchLow"
            icon="search"
            :placeholder="t('stock_alerts.filter.search_item')"
          />
        </div>
        <div class="tb-select">
          <Select
            v-model="locationFilter"
            icon="store"
            :placeholder="t('stock_alerts.filter.location')"
            :options="locationOptions"
          />
        </div>
      </WorkspaceToolbar>

      <div
        v-if="activeFiltersLow.length > 0"
        class="toolbar"
        style="padding-top:0;"
      >
        <div class="chips">
          <span
            class="tertiary"
            style="font-size:13px;margin-right:2px;"
          >{{ t('Filters') }}:</span>
          <span
            v-for="f in activeFiltersLow"
            :key="f.k"
            class="chip"
          >
            <span>{{ f.label }}: <b>{{ f.val }}</b></span>
            <button
              type="button"
              :aria-label="t('Remove')"
              class="chip__x"
              @click="f.clear()"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>
          <button
            class="chip--clear"
            @click="clearLowFilters"
          >
            {{ t('Clear all') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <DataTable
        :columns="columnsLow"
        :rows="lowStock"
        row-key="id"
        :loading="loadingLow"
        :pagination="paginationLow"
      >
        <template #cell.stock_item_name="{ row }">
          <span class="cell-strong">{{ row.stock_item_name ?? row.stock_item?.name ?? '—' }}</span>
        </template>

        <template #cell.sku="{ row }">
          <span class="mono cell-muted">{{ row.sku ?? row.stock_item?.sku ?? '—' }}</span>
        </template>

        <template #cell.location_name="{ row }">
          <span>{{ row.location_name ?? row.location?.name ?? '—' }}</span>
        </template>

        <template #cell.current_quantity="{ row }">
          <span class="mono num-tabular">{{ fmtQty(row.current_quantity ?? row.quantity) }}</span>
        </template>

        <template #cell.reorder_point="{ row }">
          <span class="mono num-tabular cell-muted">{{ fmtQty(row.reorder_point) }}</span>
        </template>

        <template #cell.shortage="{ row }">
          <Badge tone="error">
            <span class="mono">{{ fmtQty(shortageOf(row)) }}</span>
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="package"
            tone="primary"
            :title="t('stock_alerts.action.adjust_stock')"
            @click="openAdjust(row)"
          />
        </template>

        <template #empty>
          <div class="statefill">
            <div class="statefill__icon">
              <DesignIcon
                name="checkcircle"
                :size="24"
              />
            </div>
            <div class="statefill__title">
              {{ t('stock_alerts.empty.low_stock') }}
            </div>
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- ======================================================
         Modal — create / edit alert rule
         ====================================================== -->
    <Modal
      :open="dialogOpen"
      :title="editing ? t('stock_alerts.modal.edit_title') : t('stock_alerts.modal.create_title')"
      :subtitle="editing
        ? t('stock_alerts.action.edit')
        : t('stock_alerts.action.create')"
      :width="560"
      @close="closeDialog"
    >
      <form @submit.prevent="save">
        <div class="form-grid">
          <!-- Alert type -->
          <Field
            :label="t('stock_alerts.field.alert_type')"
            class="span-2"
            :error="errors.alert_type"
          >
            <Select
              v-model="form.alert_type"
              :options="alertTypeOptions"
              :disabled="!!editing"
            />
          </Field>

          <!-- Threshold -->
          <Field
            :label="t('stock_alerts.field.threshold')"
            class="span-2"
            :hint="t('stock_alerts.help.threshold')"
          >
            <Input
              v-model.number="form.threshold_value"
              type="number"
              step="0.0001"
              :placeholder="t('stock_alerts.help.threshold')"
            />
          </Field>

          <!-- Notify in-app -->
          <Field :label="t('stock_alerts.field.notify_in_app')">
            <div
              class="row"
              style="gap:10px;align-items:center;height:42px;"
            >
              <Switch v-model="form.notify_in_app" />
              <span style="font-size:14px;color:var(--text-secondary);">
                {{ t(`stock_alert_notify_${form.notify_in_app ? 'ON' : 'OFF'}`) }}
              </span>
            </div>
          </Field>

          <!-- Notify email -->
          <Field :label="t('stock_alerts.field.notify_email')">
            <div
              class="row"
              style="gap:10px;align-items:center;height:42px;"
            >
              <Switch v-model="form.notify_email" />
              <span style="font-size:14px;color:var(--text-secondary);">
                {{ t(`stock_alert_notify_${form.notify_email ? 'ON' : 'OFF'}`) }}
              </span>
            </div>
          </Field>

          <!-- Notify telegram -->
          <Field :label="t('stock_alerts.field.notify_telegram')">
            <div
              class="row"
              style="gap:10px;align-items:center;height:42px;"
            >
              <Switch v-model="form.notify_telegram" />
              <span style="font-size:14px;color:var(--text-secondary);">
                {{ t(`stock_alert_notify_${form.notify_telegram ? 'ON' : 'OFF'}`) }}
              </span>
            </div>
          </Field>

          <!-- Is active -->
          <Field :label="t('stock_alerts.field.is_active')">
            <div
              class="row"
              style="gap:10px;align-items:center;height:42px;"
            >
              <Switch v-model="form.is_active" />
              <span style="font-size:14px;color:var(--text-secondary);">
                {{ t(`stock_alert_status_${form.is_active ? 'ACTIVE' : 'INACTIVE'}`) }}
              </span>
            </div>
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="dialogLoading"
          :disabled="dialogLoading"
          @click="save"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- ======================================================
         Modal — confirm toggle off
         ====================================================== -->
    <Modal
      :open="!!toggleConfirm"
      :title="t('stock_alerts.confirm.toggle_off')"
      :subtitle="t('stock_alerts.action.toggle_active')"
      :width="440"
      @close="cancelToggle"
    >
      <div
        v-if="toggleConfirm"
        class="row"
        style="gap:14px;align-items:flex-start;"
      >
        <div
          class="kpi__icon t-warning"
          style="width:44px;height:44px;flex:0 0 44px;"
        >
          <DesignIcon
            name="alert"
            :size="22"
          />
        </div>
        <div>
          <p style="margin:0;font-weight:600;">
            {{ t(`stock_alert_type_${toggleConfirm.rule.alert_type}`) }}
          </p>
          <p
            class="muted"
            style="margin:6px 0 0;font-size:14px;"
          >
            {{ t('stock_alerts.confirm.toggle_off') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="danger"
          icon="pause"
          @click="confirmToggle"
        >
          {{ t('stock_alerts.action.toggle_active') }}
        </Button>
      </template>
    </Modal>

    <!-- ======================================================
         Modal — adjust stock (row action on low-stock item)
         ====================================================== -->
    <Modal
      :open="adjustDialog"
      :title="t('stock_alerts.action.adjust_stock')"
      :subtitle="adjustRow
        ? ((adjustRow.stock_item_name ?? adjustRow.stock_item?.name ?? '') + ' @ ' + (adjustRow.location_name ?? adjustRow.location?.name ?? ''))
        : ''"
      :width="520"
      @close="closeAdjust"
    >
      <form @submit.prevent="doAdjust">
        <div
          v-if="adjustRow"
          class="muted"
          style="margin-bottom:12px;font-size:13px;"
        >
          {{ t('stock_alerts.col.current_qty') }}:
          <strong class="mono">{{ fmtQty(adjustRow.current_quantity ?? adjustRow.quantity) }}</strong>
          ·
          {{ t('stock_alerts.col.reorder_point') }}:
          <strong class="mono">{{ fmtQty(adjustRow.reorder_point) }}</strong>
        </div>

        <div class="form-grid">
          <Field :label="t('Quantity')">
            <Input
              v-model.number="adjustForm.quantity"
              type="number"
              step="0.01"
              :placeholder="t('stock_alerts.placeholder.adjust_qty')"
            />
          </Field>

          <Field :label="t('Movement type')">
            <Select
              v-model="adjustForm.movement_type"
              :options="movementOptions"
            />
          </Field>

          <Field
            :label="t('Notes')"
            class="span-2"
          >
            <Input
              v-model="adjustForm.notes"
              :placeholder="t('Notes')"
            />
          </Field>
        </div>
      </form>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="adjustLoading"
          :disabled="adjustLoading"
          @click="doAdjust"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- Toast -->
    <VSnackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="3000"
    >
      {{ snackbarMsg }}
    </VSnackbar>
  </WorkspacePage>
</template>

<style scoped>
.iconaction.is-busy {
  cursor: progress;
  opacity: 0.7;
}

.toolbar--wrap {
  flex-wrap: wrap;
  gap: 12px;
}

.tb-search {
  flex: 1;
  max-width: 300px;
  min-width: 200px;
}

.tb-select {
  width: 200px;
}

/* Tablet: keep KPI strip 2-up between phone & desktop */
@media (max-width: 1024px) {
  .grid.cols-3 {
    grid-template-columns: 1fr 1fr;
  }
}

/* Phone: toolbar fields go full-width; KPI collapse handled by canonical design-responsive.css */
@media (max-width: 768px) {
  .tb-search,
  .tb-select {
    flex: 1 1 100%;
    max-width: 100%;
    width: 100%;
    min-width: 0;
  }
}

/* Small phone: tighten min-widths so toolbar + switch row don't overflow */
@media (max-width: 420px) {
  .tb-search {
    min-width: 0;
  }

  .tb-select {
    width: 100%;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
</route>
