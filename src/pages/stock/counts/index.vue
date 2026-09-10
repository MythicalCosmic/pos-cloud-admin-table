<script setup lang="ts">
/* ============================================================
   ALPHA POS — Stock Counts (Workflow)
   Refactored to design primitives + design-shell.css.
   - Toolbar filters wrap on mobile (.filter-cell drops to 100%)
   - DataTable with row-action IconAction buttons
   - Modal-based create, action confirm, and per-item record flow
   - Inline counted/qty/notes inputs preserved (axios + computeds kept)
   ============================================================ */
import { stockApi as axios } from '@/plugins/axios'
import { useStateAction } from '@/composables/useStateAction'
import { COUNT_STATUS_COLOR as statusColor } from '@/constants/statusColors'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import Switch from '@/components/design/Switch.vue'
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const { hasAnyPermission, isAdministrator, currentUserId } = useUserAccess()
const canCreateCounts = computed(() => hasAnyPermission(['stock.count.create']))
const canRecordCounts = computed(() => hasAnyPermission(['stock.count.record']))
const canApproveCounts = computed(() => hasAnyPermission(['stock.adjustment.approve']))
const canCancelCounts = computed(() => hasAnyPermission(['stock.manage']))
const canSetAutoAdjust = computed(() => isAdministrator.value)
const canUseCountCategories = computed(() => isAdministrator.value)

const counts = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const page = ref(1)
const itemsPerPage = ref(10)
const statusFilter = ref<string | undefined>(undefined)
const locationFilter = ref<number | undefined>(undefined)
const typeFilter = ref<string | undefined>(undefined)

const locationsList = ref<any[]>([])
const categoriesList = ref<any[]>([])

const createDialog = ref(false)
const saving = ref(false)

const form = ref({
  location_id: null as number | null,
  count_type: 'FULL',
  category_id: null as number | null,
  include_zero_stock: true,
  auto_adjust: false,
  notes: '',
})

const { snackbar, snackbarMsg, snackbarColor, notify } = useNotify()
const { formatDateShort, formatCurrency } = useFormatters()

const statuses = ['DRAFT', 'IN_PROGRESS', 'PENDING_APPROVAL', 'APPROVED', 'CANCELED']
const countTypes = ['FULL', 'PARTIAL', 'CYCLE', 'SPOT']

// Status tone for design Badge
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  DRAFT: 'neutral',
  IN_PROGRESS: 'info',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  CANCELED: 'error',
}

function statusTone(s: string) {
  return STATUS_TONE[s] ?? (statusColor[s] === 'default' ? 'neutral' : (statusColor[s] as any)) ?? 'neutral'
}

async function loadCounts() {
  loading.value = true
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (statusFilter.value)
      params.status = statusFilter.value
    if (locationFilter.value)
      params.location_id = locationFilter.value
    if (typeFilter.value)
      params.type = typeFilter.value

    const res = await axios.get('/counts/', { params })
    const d = res.data?.data ?? res.data

    counts.value = d?.counts ?? []
    total.value = d.pagination?.total ?? counts.value.length
  }
  catch {
    notify(t('Failed to load stock counts'), 'error')
  }
  finally {
    loading.value = false
  }
}

async function loadLocations() {
  try {
    locationsList.value = await loadAllStockRows('/locations/', 'locations')
  }
  catch { /* ignore */ }
}

async function loadCategories() {
  if (!canUseCountCategories.value) {
    categoriesList.value = []
    return
  }
  try {
    categoriesList.value = await loadAllStockRows('/categories/', 'categories')
  }
  catch { /* ignore */ }
}

onMounted(() => { loadCounts(); loadLocations(); loadCategories() })
watch([page, itemsPerPage], loadCounts)
watch([statusFilter, locationFilter, typeFilter], () => { page.value = 1; loadCounts() })

const locationOptions = computed(() =>
  locationsList.value.map(l => ({ value: String(l.id), label: l.name })),
)

const categoryOptions = computed(() =>
  categoriesList.value.map(c => ({ value: String(c.id), label: c.name })),
)

function openCreate() {
  if (!canCreateCounts.value)
    return

  form.value = {
    location_id: null,
    count_type: 'FULL',
    category_id: null,
    include_zero_stock: true,
    auto_adjust: false,
    notes: '',
  }
  createDialog.value = true
}

async function createCount() {
  if (!canCreateCounts.value)
    return

  if (form.value.location_id == null) {
    notify(t('Select location'), 'error')

    return
  }
  saving.value = true
  try {
    const payload: any = {
      ...form.value,

      // Only an approver may opt into automatic stock posting. Warehouse
      // counters always create a reviewable count with no direct adjustment.
      auto_adjust: canSetAutoAdjust.value ? Boolean(form.value.auto_adjust) : false,
    }

    if (!payload.notes)
      delete payload.notes
    if (payload.category_id == null)
      delete payload.category_id
    await axios.post('/counts/', payload)
    notify(t('Stock count created'))
    createDialog.value = false
    await loadCounts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error creating count'), 'error')
  }
  finally {
    saving.value = false
  }
}

const actionLabels: Record<string, string> = {
  start: 'Start Count',
  complete: 'Submit Review',
  approve: 'Approve Count',
  cancel: 'Cancel Count',
}

async function loadAllStockRows(path: string, key: string): Promise<any[]> {
  const rows: any[] = []
  const perPage = 100
  for (let currentPage = 1; ; currentPage += 1) {
    const response = await axios.get(path, { params: { page: currentPage, per_page: perPage } })
    const data = response.data?.data ?? response.data
    const pageRows = data?.[key] ?? data?.results ?? []

    rows.push(...pageRows)

    const expectedTotal = Number(data?.pagination?.total ?? rows.length)
    if (!pageRows.length || rows.length >= expectedTotal)
      break
  }

  return rows
}

const {
  actionDialog,
  actionItem,
  actionType,
  actioning,
  openAction: openStateAction,
  doAction: doStateAction,
} = useStateAction('/counts/', loadCounts, notify, t, axios)

function isOwnedByCurrentUser(item: any): boolean {
  if (isAdministrator.value)
    return true

  return currentUserId.value != null
    && countOwnerId(item) != null
    && String(currentUserId.value) === String(countOwnerId(item))
}

function isOwnCount(item: any): boolean {
  return currentUserId.value != null
    && countOwnerId(item) != null
    && String(currentUserId.value) === String(countOwnerId(item))
}

function countOwnerId(item: any): string | number | null {
  return item?.counted_by_id ?? item?.counted_by?.id ?? null
}

async function loadCountDetail(item: any, force = false): Promise<any | null> {
  if (!force && countOwnerId(item) != null)
    return item
  try {
    const response = await axios.get(`/counts/${item.id}/`)
    const data = response.data?.data ?? response.data

    return data?.count ?? data
  }
  catch (error: any) {
    notify(error?.response?.data?.message ?? t('Failed to load count'), 'error')

    return null
  }
}

async function openCountAction(item: any, type: 'start' | 'complete' | 'approve') {
  const allowed = type === 'approve' ? canApproveCounts.value : canRecordCounts.value
  if (!allowed)
    return

  // Approval must always be based on exact server state because auto_adjust
  // controls whether stock levels will be posted by this mutation.
  const detail = await loadCountDetail(item, type === 'approve')
  if (!detail)
    return
  if (type === 'approve' && detail.status !== 'PENDING_APPROVAL') {
    notify(t('count_state_changed'), 'error')
    await loadCounts()

    return
  }
  if (type !== 'approve' && !isOwnedByCurrentUser(detail)) {
    notify(t('count_not_assigned'), 'error')
    return
  }
  if (type === 'approve' && isOwnCount(detail)) {
    notify(t('count_self_approval_forbidden'), 'error')
    return
  }

  openStateAction(detail, type)
}

async function performCountApproval() {
  actioning.value = true
  try {
    const latestCount = await loadCountDetail(actionItem.value, true)
    if (!latestCount)
      return
    if (latestCount.status !== 'PENDING_APPROVAL') {
      notify(t('count_state_changed'), 'error')
      actionDialog.value = false
      await loadCounts()

      return
    }
    if (isOwnCount(latestCount)) {
      notify(t('count_self_approval_forbidden'), 'error')
      actionDialog.value = false

      return
    }

    actionItem.value = latestCount
    await axios.post(`/counts/${latestCount.id}/approve/`, {
      apply_adjustments: Boolean(latestCount.auto_adjust),
    })
    notify(t('Updated'))
    actionDialog.value = false
    await loadCounts()
  }
  catch (error: any) {
    notify(error?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    actioning.value = false
  }
}

async function performCountAction() {
  if (actioning.value)
    return

  if (actionType.value === 'approve') {
    if (canApproveCounts.value)
      await performCountApproval()

    return
  }

  if (!canRecordCounts.value)
    return
  if (!isOwnedByCurrentUser(actionItem.value)) {
    notify(t('count_not_assigned'), 'error')
    return
  }

  await doStateAction()
}

function canStart(item: any) {
  return canRecordCounts.value && isOwnedByCurrentUser(item) && item.status === 'DRAFT'
}
function canComplete(item: any) {
  return canRecordCounts.value && isOwnedByCurrentUser(item) && item.status === 'IN_PROGRESS'
}
function canApprove(item: any) {
  return canApproveCounts.value && !isOwnCount(item) && item.status === 'PENDING_APPROVAL'
}
function canCancel(item: any) {
  return canCancelCounts.value
    && !['APPROVED', 'CANCELED'].includes(item.status)
}

// -------- Count detail + record_count UI --------
const detailDialog = ref(false)
const detailCount = ref<any>(null)
const detailLoading = ref(false)
const detailItems = ref<any[]>([])
const detailSummary = ref<any>(null)
const varianceCodes = ref<any[]>([])
const itemFilter = ref<'all' | 'pending' | 'counted' | 'variance'>('all')
const recordingItemId = ref<number | null>(null)

async function openDetail(count: any) {
  detailCount.value = count
  detailItems.value = []
  detailSummary.value = null
  itemFilter.value = 'all'
  detailDialog.value = true
  detailLoading.value = true
  try {
    const [dRes, vRes] = await Promise.all([
      axios.get(`/counts/${count.id}/`),
      axios.get('/variance-codes/'),
    ])

    const dd = dRes.data?.data ?? dRes.data
    const vd = vRes.data?.data ?? vRes.data

    detailCount.value = dd?.count ?? dd
    detailItems.value = (dd?.count?.items ?? dd?.items ?? []).map((i: any) => ({
      ...i,
      _input: i.counted_quantity ?? null,
      _reason_code_id: i.reason_code?.id ?? null,
      _notes: i.notes ?? '',
    }))
    detailSummary.value = dd?.count?.summary ?? dd?.summary ?? null
    varianceCodes.value = vd?.codes ?? vd?.items ?? []
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to load count'), 'error')
  }
  finally {
    detailLoading.value = false
  }
}

const filteredItems = computed(() => {
  if (itemFilter.value === 'pending')
    return detailItems.value.filter((i: any) => i.counted_quantity == null)
  if (itemFilter.value === 'counted')
    return detailItems.value.filter((i: any) => i.counted_quantity != null)
  if (itemFilter.value === 'variance')
    return detailItems.value.filter((i: any) => i.counted_quantity != null && Number(i.variance ?? 0) !== 0)

  return detailItems.value
})

const isCountEditable = computed(
  () => canRecordCounts.value
    && isOwnedByCurrentUser(detailCount.value)
    && (detailCount.value?.status === 'DRAFT' || detailCount.value?.status === 'IN_PROGRESS'),
)

async function recordItem(item: any) {
  if (!isCountEditable.value || !detailCount.value)
    return
  const countedQuantity = Number(item._input)
  if (item._input == null || item._input === '' || !Number.isFinite(countedQuantity)) {
    notify(t('Enter a counted quantity'), 'error')

    return
  }
  if (countedQuantity < 0) {
    notify(t('Counted quantity cannot be negative'), 'error')

    return
  }
  recordingItemId.value = item.id
  try {
    const payload: any = {
      item_id: item.id,
      counted_quantity: countedQuantity,
    }

    if (item._reason_code_id)
      payload.reason_code_id = item._reason_code_id
    if (item._notes)
      payload.notes = item._notes
    const res = await axios.post(`/counts/${detailCount.value.id}/record/`, payload)
    const d = res.data?.data ?? res.data
    const updated = d?.item ?? d

    if (updated) {
      const idx = detailItems.value.findIndex((i: any) => i.id === item.id)
      if (idx !== -1) {
        detailItems.value[idx] = {
          ...updated,
          _input: updated.counted_quantity,
          _reason_code_id: updated.reason_code?.id ?? null,
          _notes: updated.notes ?? '',
        }
      }
    }
    notify(t('Count recorded'))

    // refresh top-level list to update items_counted
    await loadCounts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    recordingItemId.value = null
  }
}

function varianceTone(v: number): 'success' | 'warning' | 'error' {
  if (v === 0)
    return 'success'
  if (v < 0)
    return 'error'
  return 'warning'
}

// Live summary derived from the in-memory items so the KPI strip + progress bar
// update instantly as each line is recorded (the server-side summary snapshot
// would otherwise stay stale until the modal is reopened).
const liveSummary = computed(() => {
  const items = detailItems.value
  const lineTotal = items.length
  const counted = items.filter((i: any) => i.counted_quantity != null).length

  const withVariance = items.filter(
    (i: any) => i.counted_quantity != null && Number(i.variance ?? 0) !== 0,
  ).length

  const varianceCost = items.reduce(
    (sum: number, i: any) => sum + (i.counted_quantity != null ? Number(i.variance_cost ?? 0) : 0),
    0,
  )

  return { total: lineTotal, counted, pending: lineTotal - counted, withVariance, varianceCost }
})

const progressPct = computed(() => {
  const s = liveSummary.value
  return s.total ? Math.round((s.counted / s.total) * 100) : 0
})

// All lines recorded — used to surface an inline "Complete" affordance in the
// detail footer (the backend rejects completion while any item is uncounted).
const allCounted = computed(() => liveSummary.value.total > 0 && liveSummary.value.pending === 0)

// -------- Cancel with reason (backend accepts an optional `reason`) --------
const cancelDialog = ref(false)
const cancelItem = ref<any>(null)
const cancelReason = ref('')
const cancelling = ref(false)

function openCancel(item: any) {
  if (!canCancelCounts.value)
    return

  cancelItem.value = item
  cancelReason.value = ''
  cancelDialog.value = true
}

async function doCancel() {
  if (!canCancelCounts.value || !cancelItem.value || cancelling.value)
    return
  cancelling.value = true
  try {
    const latestCount = await loadCountDetail(cancelItem.value, true)
    if (!latestCount)
      return
    if (['APPROVED', 'CANCELED'].includes(latestCount.status)) {
      notify(t('count_state_changed'), 'error')
      cancelDialog.value = false
      await loadCounts()

      return
    }

    const payload: any = {}
    if (cancelReason.value.trim())
      payload.reason = cancelReason.value.trim()
    await axios.post(`/counts/${latestCount.id}/cancel/`, payload)
    notify(t('Stock count cancelled'))
    cancelDialog.value = false
    if (detailDialog.value && detailCount.value?.id === cancelItem.value.id)
      detailDialog.value = false
    await loadCounts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    cancelling.value = false
  }
}

// Complete the count directly from the detail view once every line is recorded.
const completing = ref(false)
async function completeFromDetail() {
  if (!isCountEditable.value || !detailCount.value)
    return
  completing.value = true
  try {
    await axios.post(`/counts/${detailCount.value.id}/complete/`, {})
    notify(t('Submitted'))
    detailDialog.value = false
    await loadCounts()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Error'), 'error')
  }
  finally {
    completing.value = false
  }
}

// ---------------- DataTable columns ----------------
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'count_number', label: t('Count #') },
  { key: 'location_name', label: t('Location') },
  { key: 'count_type', label: t('Type') },
  { key: 'status', label: t('Status') },
  { key: 'created_at', label: t('Date'), align: 'right' },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const itemFilterOptions = computed(() => [
  { value: 'all', label: t('All') },
  { value: 'pending', label: t('Pending') },
  { value: 'counted', label: t('Counted') },
  { value: 'variance', label: t('Variance') },
])
</script>

<template>
  <div class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('Stock Counts')"
      :subtitle="t('stock_counts_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canCreateCounts"
          variant="primary"
          icon="plus"
          @click="openCreate"
        >
          {{ t('New Count') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Filter card -->
    <div class="card">
      <div class="toolbar">
        <div class="filter-cell">
          <Select
            :model-value="statusFilter ?? ''"
            :placeholder="t('All Statuses')"
            :options="statuses.map(s => ({ value: s, label: t(`count_status_${s}`) }))"
            @update:model-value="(v: string) => statusFilter = v || undefined"
          />
        </div>
        <div class="filter-cell">
          <Select
            :model-value="locationFilter !== undefined ? String(locationFilter) : ''"
            :placeholder="t('All Locations')"
            :options="locationOptions"
            @update:model-value="(v: string) => locationFilter = v ? Number(v) : undefined"
          />
        </div>
        <div class="filter-cell">
          <Select
            :model-value="typeFilter ?? ''"
            :placeholder="t('All Types')"
            :options="countTypes.map(v => ({ value: v, label: t(`count_type_${v}`) }))"
            @update:model-value="(v: string) => typeFilter = v || undefined"
          />
        </div>
        <div class="toolbar-spacer">
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            :disabled="!statusFilter && !typeFilter && locationFilter === undefined"
            @click="() => {
              statusFilter = undefined
              typeFilter = undefined
              locationFilter = undefined
            }"
          >
            {{ t('Clear filters') }}
          </Button>
        </div>
      </div>

      <div class="card__divider" />

      <!-- DataTable -->
      <DataTable
        :columns="columns"
        :rows="counts"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
        :empty-title="t('stock_counts_empty_title')"
        :empty-sub="t('stock_counts_empty_sub')"
        empty-icon="inbox"
      >
        <template #cell.count_number="{ row: r }">
          <span class="cell-strong mono">{{ r.count_number }}</span>
        </template>

        <template #cell.location_name="{ row: r }">
          <span class="cell-muted">{{ r.location_name ?? r.location?.name ?? '—' }}</span>
        </template>

        <template #cell.count_type="{ row: r }">
          <Badge tone="info">
            {{ r.count_type ? t(`count_type_${r.count_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.status="{ row: r }">
          <Badge
            :tone="statusTone(r.status)"
            dot
          >
            {{ r.status ? t(`count_status_${r.status}`) : '—' }}
          </Badge>
        </template>

        <template #cell.created_at="{ row: r }">
          <span class="mono cell-muted nowrap">{{ formatDateShort(r.created_at) }}</span>
        </template>

        <!-- Inline row actions -->
        <template #row-actions="{ row: r }">
          <IconAction
            icon="menu"
            :title="t('Open / record')"
            @click="openDetail(r)"
          />
          <IconAction
            v-if="canStart(r)"
            icon="play"
            tone="warning"
            :title="t('Start')"
            @click="openCountAction(r, 'start')"
          />
          <IconAction
            v-if="canComplete(r)"
            icon="check"
            tone="primary"
            :title="t('Submit Review')"
            @click="openCountAction(r, 'complete')"
          />
          <IconAction
            v-if="canApprove(r)"
            icon="checkcircle"
            tone="success"
            :title="t('Approve')"
            @click="openCountAction(r, 'approve')"
          />
          <IconAction
            v-if="canCancel(r)"
            icon="close"
            tone="danger"
            :title="t('Cancel')"
            @click="openCancel(r)"
          />
        </template>
      </DataTable>
    </div>

    <!-- ============ CREATE modal ============ -->
    <Modal
      :open="createDialog"
      :title="t('New Stock Count')"
      :subtitle="t('stock_counts_create_subtitle')"
      :width="440"
      @close="createDialog = false"
    >
      <div class="form-grid">
        <Field :label="t('Location')">
          <Select
            :model-value="form.location_id !== null ? String(form.location_id) : ''"
            :placeholder="t('Select location')"
            :options="locationOptions"
            @update:model-value="(v: string) => form.location_id = v ? Number(v) : null"
          />
        </Field>

        <Field :label="t('Count Type')">
          <Select
            :model-value="form.count_type"
            :options="countTypes.map(c => ({ value: c, label: t(`count_type_${c}`) }))"
            @update:model-value="(v: string) => form.count_type = v"
          />
        </Field>

        <Field
          v-if="canUseCountCategories"
          :label="t('Category (optional)')"
          :hint="t('count_category_hint')"
        >
          <Select
            :model-value="form.category_id !== null ? String(form.category_id) : ''"
            :placeholder="t('All categories')"
            :options="categoryOptions"
            @update:model-value="(v: string) => form.category_id = v ? Number(v) : null"
          />
        </Field>

        <div class="opt-row">
          <label class="opt-toggle">
            <Switch
              :model-value="form.include_zero_stock"
              @update:model-value="(v: boolean) => form.include_zero_stock = v"
            />
            <span class="opt-text">
              <span class="opt-title">{{ t('Include zero-stock items') }}</span>
              <span class="opt-sub">{{ t('count_include_zero_hint') }}</span>
            </span>
          </label>
          <label
            v-if="canSetAutoAdjust"
            class="opt-toggle"
          >
            <Switch
              :model-value="form.auto_adjust"
              @update:model-value="(v: boolean) => form.auto_adjust = v"
            />
            <span class="opt-text">
              <span class="opt-title">{{ t('Auto-adjust on approval') }}</span>
              <span class="opt-sub">{{ t('count_auto_adjust_hint') }}</span>
            </span>
          </label>
        </div>

        <Field :label="t('Notes')">
          <Input
            :model-value="form.notes"
            @update:model-value="(v: string) => form.notes = v"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="saving"
          @click="createCount"
        >
          {{ t('Create') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ ACTION CONFIRM modal ============ -->
    <Modal
      :open="actionDialog"
      :title="t(actionLabels[actionType] ?? actionType)"
      :width="440"
      @close="actionDialog = false"
    >
      <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
        {{ t('Confirm action for count') }}
        <strong class="mono">{{ actionItem?.count_number }}</strong>?
      </p>

      <div
        v-if="actionType === 'approve'"
        class="approval-impact"
        :class="actionItem?.auto_adjust ? 'approval-impact--changes' : 'approval-impact--no-change'"
        role="status"
      >
        <strong>{{ t(actionItem?.auto_adjust ? 'count_approval_changes_stock_title' : 'count_approval_no_stock_change_title') }}</strong>
        <span>{{ t(actionItem?.auto_adjust ? 'count_approval_changes_stock_body' : 'count_approval_no_stock_change_body') }}</span>
      </div>

      <template #footer>
        <Button
          :variant="actionType === 'cancel' ? 'danger' : 'primary'"
          :loading="actioning"
          @click="performCountAction"
        >
          {{ t('Confirm') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ DETAIL + RECORD modal ============ -->
    <Modal
      :open="detailDialog"
      :title="detailCount?.count_number ?? t('Count')"
      :subtitle="detailCount ? `${detailCount.location?.name ?? detailCount.location_name ?? ''} · ${detailCount.count_type ? t(`count_type_${detailCount.count_type}`) : ''}` : ''"
      :width="1100"
      @close="detailDialog = false"
    >
      <!-- status pill + notes -->
      <div
        v-if="detailCount?.status"
        class="detail-head"
      >
        <Badge
          :tone="statusTone(detailCount.status)"
          dot
        >
          {{ t(`count_status_${detailCount.status}`) }}
        </Badge>
        <span
          v-if="detailCount?.notes"
          class="detail-notes"
          :title="detailCount.notes"
        >
          {{ detailCount.notes }}
        </span>
      </div>

      <!-- progress bar -->
      <div
        v-if="liveSummary.total"
        class="count-progress"
      >
        <div class="count-progress__meta">
          <span class="cell-muted">{{ t('Count progress') }}</span>
          <span class="mono cell-strong">{{ liveSummary.counted }} / {{ liveSummary.total }} · {{ progressPct }}%</span>
        </div>
        <div class="count-progress__track">
          <div
            class="count-progress__fill"
            :class="{ 'is-done': progressPct === 100 }"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
      </div>

      <!-- summary strip -->
      <div
        v-if="liveSummary.total"
        class="grid summary-grid"
        style="margin-bottom: 16px;"
      >
        <div class="summary-cell">
          <div class="kpi__label">
            {{ t('Total items') }}
          </div>
          <div class="summary-val mono">
            {{ liveSummary.total }}
          </div>
        </div>
        <div class="summary-cell">
          <div
            class="kpi__label"
            style="color: rgb(var(--v-theme-success-strong));"
          >
            {{ t('Counted') }}
          </div>
          <div class="summary-val mono">
            {{ liveSummary.counted }}
          </div>
        </div>
        <div class="summary-cell">
          <div
            class="kpi__label"
            style="color: rgb(var(--v-theme-warning-strong));"
          >
            {{ t('Pending') }}
          </div>
          <div class="summary-val mono">
            {{ liveSummary.pending }}
          </div>
        </div>
        <div class="summary-cell">
          <div
            class="kpi__label"
            style="color: rgb(var(--v-theme-error-strong));"
          >
            {{ t('With variance') }}
          </div>
          <div class="summary-val mono">
            {{ liveSummary.withVariance }}
          </div>
        </div>
        <div class="summary-cell">
          <div class="kpi__label">
            {{ t('Variance cost') }}
          </div>
          <div
            class="summary-val mono"
            :style="{ color: liveSummary.varianceCost < 0 ? 'rgb(var(--v-theme-error-strong))' : (liveSummary.varianceCost > 0 ? 'rgb(var(--v-theme-warning-strong))' : undefined) }"
          >
            {{ liveSummary.varianceCost > 0 ? '+' : '' }}{{ formatCurrency(liveSummary.varianceCost) }}
          </div>
        </div>
      </div>

      <!-- filter -->
      <div class="item-filter-wrap">
        <Select
          :model-value="itemFilter"
          :options="itemFilterOptions"
          @update:model-value="(v: string) => itemFilter = v as any"
        />
      </div>

      <div
        v-if="detailLoading"
        class="cell-muted"
        style="margin-bottom: 8px;"
      >
        {{ t('Loading') }}…
      </div>

      <!-- items table -->
      <div class="tablewrap">
        <table class="dtable detail-items-table">
          <thead>
            <tr>
              <th>{{ t('Item') }}</th>
              <th class="num">
                {{ t('System qty') }}
              </th>
              <th
                class="num"
                style="min-width: 160px;"
              >
                {{ t('Counted qty') }}
              </th>
              <th class="num">
                {{ t('Variance') }}
              </th>
              <th style="min-width: 180px;">
                {{ t('Reason') }}
              </th>
              <th>{{ t('Notes') }}</th>
              <th class="num" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="i in filteredItems"
              :key="i.id"
            >
              <td class="cell-strong">
                {{ i.stock_item?.name ?? '—' }}
              </td>
              <td class="num mono">
                {{ i.system_quantity }} {{ i.stock_item?.unit ?? '' }}
              </td>
              <td class="num">
                <Input
                  :model-value="i._input ?? ''"
                  type="number"
                  min="0"
                  step="0.01"
                  :disabled="!isCountEditable"
                  @update:model-value="(v: string) => i._input = v === '' ? null : Number(v)"
                />
              </td>
              <td class="num">
                <div
                  v-if="i.counted_quantity != null"
                  class="variance-cell"
                >
                  <Badge :tone="varianceTone(Number(i.variance ?? 0))">
                    <span class="mono">{{ i.variance ?? 0 }} ({{ i.variance_percentage ?? 0 }}%)</span>
                  </Badge>
                  <span
                    v-if="Number(i.variance_cost ?? 0) !== 0"
                    class="variance-cost mono"
                    :class="Number(i.variance_cost) < 0 ? 'is-neg' : 'is-pos'"
                  >
                    {{ Number(i.variance_cost) > 0 ? '+' : '' }}{{ formatCurrency(i.variance_cost) }}
                  </span>
                </div>
                <span
                  v-else
                  class="cell-muted"
                >—</span>
              </td>
              <td>
                <Select
                  :model-value="i._reason_code_id !== null ? String(i._reason_code_id) : ''"
                  :placeholder="t('Reason')"
                  :options="varianceCodes.map((c: any) => ({ value: String(c.id), label: `${c.code} — ${c.name}` }))"
                  :disabled="!isCountEditable"
                  @update:model-value="(v: string) => i._reason_code_id = v ? Number(v) : null"
                />
              </td>
              <td>
                <Input
                  :model-value="i._notes"
                  :disabled="!isCountEditable"
                  @update:model-value="(v: string) => i._notes = v"
                />
              </td>
              <td class="num">
                <IconAction
                  icon="checkcircle"
                  tone="primary"
                  :title="t('Record')"
                  :disabled="!isCountEditable || recordingItemId === i.id"
                  @click="recordItem(i)"
                />
              </td>
            </tr>
            <tr v-if="!filteredItems.length && !detailLoading">
              <td
                colspan="7"
                class="center cell-muted"
                style="padding: 24px 12px;"
              >
                {{ t('No items') }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <template #footer>
        <Button
          variant="ghost"
          @click="detailDialog = false"
        >
          {{ t('Close') }}
        </Button>
        <Button
          v-if="isCountEditable && detailCount?.status === 'IN_PROGRESS'"
          variant="primary"
          icon="check"
          :loading="completing"
          :disabled="!allCounted"
          :title="!allCounted ? t('count_complete_disabled_hint') : ''"
          @click="completeFromDetail"
        >
          {{ t('Submit Review') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ CANCEL modal (with optional reason) ============ -->
    <Modal
      :open="cancelDialog"
      :title="t('Cancel Count')"
      :width="440"
      @close="cancelDialog = false"
    >
      <p style="margin: 0 0 12px; color: var(--text-secondary); font-size: 14px;">
        {{ t('Confirm action for count') }}
        <strong class="mono">{{ cancelItem?.count_number }}</strong>?
      </p>
      <Field :label="t('Reason (optional)')">
        <Input
          :model-value="cancelReason"
          :placeholder="t('count_cancel_reason_ph')"
          @update:model-value="(v: string) => cancelReason = v"
        />
      </Field>

      <template #footer>
        <Button
          variant="ghost"
          @click="cancelDialog = false"
        >
          {{ t('Back') }}
        </Button>
        <Button
          variant="danger"
          :loading="cancelling"
          @click="doCancel"
        >
          {{ t('Cancel Count') }}
        </Button>
      </template>
    </Modal>

    <!-- Lightweight inline toast (kept for compatibility with useNotify) -->
    <div
      v-if="snackbar"
      class="notify-snackbar"
      :class="[`tone-${snackbarColor}`]"
      style="position: fixed; bottom: 24px; right: 24px; padding: 12px 18px; border-radius: 8px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-md); z-index: 9999;"
    >
      {{ snackbarMsg }}
    </div>
  </div>
</template>

<style scoped>
.cell-strong { color: var(--text); font-weight: 600; }
.cell-muted { color: var(--text-secondary); }
.mono { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
.nowrap { white-space: nowrap; }
.center { text-align: center; }
.num { text-align: right; }
.grid { display: grid; gap: 12px; }

.approval-impact {
  display: grid;
  gap: 4px;
  margin-top: 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-subtle, var(--surface));
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.45;
}
.approval-impact strong { color: var(--text); }
.approval-impact--changes { border-color: rgba(var(--v-theme-warning), 0.4); }
.approval-impact--no-change { border-color: rgba(var(--v-theme-info), 0.35); }

/* Toolbar filter cells: stay generous on desktop, drop to full width on mobile */
.filter-cell { width: 220px; min-width: 0; }
.toolbar-spacer { margin-left: auto; }

/* Summary strip: 5 cols on desktop, 2 on tablet, 1 on phone */
.summary-grid { grid-template-columns: repeat(5, 1fr); }
.summary-cell { padding: 4px 0; }
.summary-val { font-size: 22px; font-weight: 700; color: var(--text); }

/* Detail head: status pill + inline notes */
.detail-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.detail-notes {
  color: var(--text-secondary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 60%;
}

/* Count progress bar */
.count-progress { margin-bottom: 16px; }
.count-progress__meta {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  margin-bottom: 6px;
}
.count-progress__track {
  height: 8px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}
.count-progress__fill {
  height: 100%;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  transition: width 0.3s ease;
}
.count-progress__fill.is-done { background: rgb(var(--v-theme-success-strong)); }

/* Per-item variance cost line under the badge */
.variance-cell { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.variance-cost { font-size: 11px; line-height: 1; }
.variance-cost.is-neg { color: rgb(var(--v-theme-error-strong)); }
.variance-cost.is-pos { color: rgb(var(--v-theme-warning-strong)); }

/* Create modal: option toggles (include zero-stock / auto-adjust) */
.opt-row { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
.opt-toggle { display: flex; align-items: flex-start; gap: 12px; cursor: pointer; }
.opt-text { display: flex; flex-direction: column; gap: 1px; }
.opt-title { color: var(--text); font-size: 13px; font-weight: 600; }
.opt-sub { color: var(--text-secondary); font-size: 12px; line-height: 1.3; }

/* Create/detail modal form grid */
.form-grid { display: grid; gap: 12px; grid-template-columns: 1fr; }

/* Detail items table horizontal-scrolls so 7 cols don't break layout */
.tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.detail-items-table {
  background: var(--surface);
  border-radius: 10px;
  border: 1px solid var(--border);
  overflow: hidden;
  min-width: 720px;
}

/* Detail filter wrapper — capped on desktop, full-width on phone */
.item-filter-wrap { margin-bottom: 12px; max-width: 240px; }

/* Tablet: collapse 4-col summary to 2-up at canonical 1024 to avoid cramping in 900–1024 range */
@media (max-width: 1024px) {
  .summary-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 900px) {
  .filter-cell { width: 100%; flex: 1 1 100%; }
  .toolbar-spacer { margin-left: 0; width: 100%; }
}

@media (max-width: 768px) {
  .item-filter-wrap { max-width: 100%; }
  .summary-val { font-size: 20px; }
}

@media (max-width: 600px) {
  .summary-grid { grid-template-columns: 1fr; }
  .summary-val { font-size: 18px; }
}
</style>

<route lang="yaml">
name: stock-counts
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.count.view
</route>
