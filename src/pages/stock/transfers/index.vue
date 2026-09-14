<script setup lang="ts">
import WorkspacePage from '@/components/design/workspace/WorkspacePage.vue'
import WorkspaceToolbar from '@/components/design/workspace/WorkspaceToolbar.vue'
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   ALPHA POS — Stock Transfers (Workflow)
   EXTENDED page:
   - Row actions for state transitions (request/approve/ship/receive/cancel)
   - Toolbar "Quick transfer" → modal → POST /transfers/quick/
   - Receive modal w/ per-item received quantities
   - Cancel modal w/ reason
   - Detail modal w/ items + lifecycle
   Uses design primitives + design-shell.css. No Vuetify on the page.
   ============================================================ */
import { stockApi as axios } from '@/plugins/axios'
import { TRANSFER_STATUS_COLOR as statusColor } from '@/constants/statusColors'
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
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const { notify, snackbar, snackbarMsg, snackbarColor } = useNotify()
const { translate } = useApiError()
const { formatDate, formatDateShort } = useFormatters()
const { access, hasAnyPermission, isAdministrator } = useUserAccess()
const canRequestTransfers = computed(() => hasAnyPermission(['stock.manage', 'stock.transfer.create']))
const canApproveTransfers = computed(() => hasAnyPermission(['stock.manage']))
const canShipTransfers = computed(() => hasAnyPermission(['stock.manage']))
const canReceiveTransfers = computed(() => hasAnyPermission(['stock.manage']))
const canCancelTransfers = computed(() => hasAnyPermission(['stock.manage']))
const canQuickTransfer = computed(() => hasAnyPermission(['stock.manage']))

// ---------------- state ----------------
const transfers = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')
const page = ref(1)
const itemsPerPage = ref(10)

const statusFilter = ref<string | undefined>(undefined)
const fromLocationFilter = ref<number | undefined>(undefined)
const toLocationFilter = ref<number | undefined>(undefined)
const typeFilter = ref<string | undefined>(undefined)

const locationsList = ref<any[]>([])
const itemsList = ref<any[]>([])
const batchesList = ref<any[]>([])
const metaLoading = ref(false)
const metaError = ref('')
const selectedItemDetail = ref<any | null>(null)
const itemSafetyLoading = ref(false)
const itemSafetyError = ref('')
const batchesLoading = ref(false)
const batchesError = ref('')
let selectionSafetyRequestId = 0

const statuses = ['DRAFT', 'REQUESTED', 'APPROVED', 'IN_TRANSIT', 'RECEIVED', 'CANCELED']
const transferTypes = ['INTERNAL', 'BRANCH_TO_BRANCH']

// Status tone map for design Badge primitive
const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  DRAFT: 'neutral',
  REQUESTED: 'info',
  APPROVED: 'primary',
  IN_TRANSIT: 'warning',
  RECEIVED: 'success',
  CANCELED: 'error',
}

const TYPE_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  INTERNAL: 'neutral',
  BRANCH_TO_BRANCH: 'info',
}

function statusTone(s: string) {
  return STATUS_TONE[s] ?? (statusColor[s] === 'default' ? 'neutral' : (statusColor[s] as any)) ?? 'neutral'
}

// ---------------- modal state ----------------
const confirmDialog = ref<{ kind: 'request' | 'approve' | 'ship'; row: any } | null>(null)
const receiveDialog = ref<{ row: any; loading: boolean } | null>(null)
const cancelDialog = ref<{ row: any; reason: string; loading: boolean } | null>(null)
const detailDialog = ref<{ row: any; loading: boolean; error?: string } | null>(null)
const quickDialog = ref(false)
const transferFormMode = ref<'request' | 'quick'>('request')

// Quick transfer form
const quickForm = ref({
  from_location_id: '' as string,
  to_location_id: '' as string,
  stock_item_id: '' as string,
  quantity: '' as string,
  batch_id: '' as string,
  notes: '',
})

const quickSaving = ref(false)
const quickErrors = ref<Record<string, string>>({})

const actingId = ref<number | null>(null)

// Cache enriched rows (list returns brief shape only). Indexed by id.
const rowDetailCache = ref<Record<number, any>>({})
async function ensureRowDetail(row: any) {
  if (!row?.id)
    return
  if (rowDetailCache.value[row.id])
    return
  try {
    const res = await axios.get(`/transfers/${row.id}/`)
    const detail = res.data?.data?.transfer ?? res.data?.transfer ?? res.data?.data ?? res.data
    if (!detail)
      return
    rowDetailCache.value = { ...rowDetailCache.value, [row.id]: detail }

    // Merge in-place so columns relying on transfer_type/requested_at/etc. populate.
    const idx = transfers.value.findIndex(transferRow => transferRow.id === row.id)
    if (idx !== -1)
      transfers.value[idx] = { ...transfers.value[idx], ...detail }
  }
  catch { /* swallow; keep brief row */ }
}

// ---------------- loaders ----------------
async function loadTransfers() {
  loading.value = true
  loadError.value = ''
  try {
    const params: any = { page: page.value, per_page: itemsPerPage.value }
    if (statusFilter.value)
      params.status = statusFilter.value
    if (fromLocationFilter.value)
      params.from_location_id = fromLocationFilter.value
    if (toLocationFilter.value)
      params.to_location_id = toLocationFilter.value
    if (typeFilter.value)
      params.type = typeFilter.value

    const res = await axios.get('/transfers/', { params })
    const d = res.data?.data ?? res.data

    transfers.value = d?.transfers ?? []
    total.value = d?.pagination?.total ?? transfers.value.length

    // List shape is brief; reset detail cache so re-expand re-fetches.
    rowDetailCache.value = {}
    await Promise.allSettled(transfers.value.map(row => ensureRowDetail(row)))
  }
  catch (error) {
    transfers.value = []
    total.value = 0
    loadError.value = translate(error)
  }
  finally {
    loading.value = false
  }
}

async function loadMeta() {
  metaLoading.value = true
  metaError.value = ''
  try {
    const [locations, items] = await Promise.all([
      loadAllStockRows('/locations/', 'locations'),
      loadAllStockRows('/items/', 'items'),
    ])

    locationsList.value = locations
    itemsList.value = items
  }
  catch (error) {
    locationsList.value = []
    itemsList.value = []
    metaError.value = translate(error)
  }
  finally {
    metaLoading.value = false
  }
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

function unwrapStockResponse(response: any, key?: string): any {
  const data = response?.data?.data ?? response?.data ?? {}

  return key ? (data?.[key] ?? data) : data
}

async function fetchItemDetail(stockItemId: string | number): Promise<any> {
  const response = await axios.get(`/items/${stockItemId}/`)

  return unwrapStockResponse(response, 'item')
}

function batchAvailableQuantity(batch: any): number {
  return Number(batch?.available_quantity ?? (Number(batch?.current_quantity ?? 0) - Number(batch?.reserved_quantity ?? 0)))
}

function isEligibleSourceBatch(batch: any, fromLocationId: string | number, stockItemId: string | number): boolean {
  return String(batch?.location_id) === String(fromLocationId)
    && String(batch?.stock_item_id) === String(stockItemId)
    && batch?.status === 'AVAILABLE'
    && batch?.quality_status === 'PASSED'
    && batch?.is_expired === false
    && batchAvailableQuantity(batch) > 0
}

async function fetchEligibleBatches(fromLocationId: string, stockItemId: string): Promise<any[]> {
  const rows: any[] = []
  const perPage = 100
  for (let currentPage = 1; ; currentPage += 1) {
    const response = await axios.get('/batches/', {
      params: {
        location_id: fromLocationId,
        stock_item_id: stockItemId,
        status: 'AVAILABLE',
        has_stock_only: true,
        page: currentPage,
        per_page: perPage,
      },
    })

    const data = unwrapStockResponse(response)
    const pageRows = data?.batches ?? []

    rows.push(...pageRows.filter((batch: any) => isEligibleSourceBatch(batch, fromLocationId, stockItemId)))

    const batchTotal = Number(data?.pagination?.total_items ?? data?.pagination?.total ?? rows.length)

    if (!pageRows.length || currentPage * perPage >= batchTotal)
      break
  }

  return rows
}

async function loadBatchesFor(fromLocationId: string, stockItemId: string) {
  if (!fromLocationId || !stockItemId) {
    batchesList.value = []
    return
  }

  batchesList.value = await fetchEligibleBatches(fromLocationId, stockItemId)
}

onMounted(() => {
  loadTransfers()
  loadMeta()
})

watch([page, itemsPerPage], loadTransfers)
watch([statusFilter, fromLocationFilter, toLocationFilter, typeFilter], () => {
  page.value = 1
  loadTransfers()
})

// reload batch list when quick form source/item changes
watch(
  () => [quickForm.value.from_location_id, quickForm.value.stock_item_id],
  async ([fl, si]) => {
    const requestId = ++selectionSafetyRequestId

    quickForm.value.batch_id = ''
    selectedItemDetail.value = null
    itemSafetyError.value = ''
    batchesError.value = ''
    batchesList.value = []
    if (!si) {
      itemSafetyLoading.value = false
      batchesLoading.value = false
      return
    }

    itemSafetyLoading.value = true
    try {
      const item = await fetchItemDetail(String(si))
      if (requestId !== selectionSafetyRequestId)
        return
      selectedItemDetail.value = item
      if (item?.track_batches && fl) {
        batchesLoading.value = true
        try {
          await loadBatchesFor(String(fl), String(si))
        }
        catch {
          if (requestId === selectionSafetyRequestId)
            batchesError.value = t('transfer_ext_batch_verification_failed')
        }
        finally {
          if (requestId === selectionSafetyRequestId)
            batchesLoading.value = false
        }
      }
    }
    catch {
      if (requestId === selectionSafetyRequestId)
        itemSafetyError.value = t('transfer_ext_item_verification_failed')
    }
    finally {
      if (requestId === selectionSafetyRequestId)
        itemSafetyLoading.value = false
    }
  },
)

// ---------------- options for selects ----------------
const locationOptions = computed(() =>
  locationsList.value.map((l: any) => ({ value: String(l.id), label: l.name })),
)

function baseUnitShort(item: any): string {
  return String(item?.base_unit_short ?? item?.base_unit?.short_name ?? '')
}

const itemOptions = computed(() =>
  itemsList.value.map((i: any) => ({
    value: String(i.id),
    label: `${i.sku ? `${i.name} (${i.sku})` : i.name}${baseUnitShort(i) ? ` · ${baseUnitShort(i)}` : ''}`,
  })),
)

const selectedBaseUnitShort = computed(() => {
  const item = itemsList.value.find((row: any) => String(row.id) === String(quickForm.value.stock_item_id))

  return baseUnitShort(item)
})

const selectedTracksBatches = computed(() => selectedItemDetail.value?.track_batches === true)

const batchOptions = computed(() =>
  batchesList.value.map((b: any) => ({
    value: String(b.id),
    label: `${b.batch_number ?? `${t('transfer_batch_label')} #${b.id}`} · ${t('transfer_ext_batch_available', { quantity: batchAvailableQuantity(b) })}`,
  })),
)

// ---------------- row-action visibility ----------------
function isOwnedByCurrentUser(row: any): boolean {
  if (isAdministrator.value)
    return true
  const currentUser = access.value.user?.user ?? access.value.user ?? {}
  const currentUserId = currentUser.id ?? currentUser.user_id

  return currentUserId != null
    && row.requested_by_id != null
    && String(currentUserId) === String(row.requested_by_id)
}

function canRequest(r: any) { return canRequestTransfers.value && r.status === 'DRAFT' && isOwnedByCurrentUser(r) }
function canApprove(r: any) { return canApproveTransfers.value && ['DRAFT', 'REQUESTED'].includes(r.status) }
function canShip(r: any) { return canShipTransfers.value && r.status === 'APPROVED' }
function canReceive(r: any) { return canReceiveTransfers.value && r.status === 'IN_TRANSIT' }
function canCancel(r: any) { return canCancelTransfers.value && ['DRAFT', 'REQUESTED', 'APPROVED'].includes(r.status) }

function mayPerform(action: 'request' | 'approve' | 'ship'): boolean {
  if (action === 'request')
    return canRequestTransfers.value
  if (action === 'approve')
    return canApproveTransfers.value
  return canShipTransfers.value
}

function transferSafetyError(key: string, params?: Record<string, unknown>): Error {
  return new Error(t(key, params ?? {}))
}

async function verifyBatchTrackedTransferItem(transfer: any, item: any, quantity: number): Promise<void> {
  const stockItemId = item?.stock_item_id ?? item?.stock_item?.id
  if (!stockItemId)
    throw transferSafetyError('transfer_ext_item_verification_failed')

  const stockItem = await fetchItemDetail(stockItemId)
  if (stockItem?.track_batches !== true)
    return
  if (!item?.batch_id)
    throw transferSafetyError('transfer_ext_batch_required_existing', { item: item?.stock_item?.name ?? stockItem?.name ?? stockItemId })

  const batchResponse = await axios.get(`/batches/${item.batch_id}/`)
  const batch = unwrapStockResponse(batchResponse, 'batch')
  if (!isEligibleSourceBatch(batch, transfer?.from_location_id ?? transfer?.from_location?.id, stockItemId))
    throw transferSafetyError('transfer_ext_batch_no_longer_eligible')
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > batchAvailableQuantity(batch))
    throw transferSafetyError('transfer_ext_batch_insufficient', { available: batchAvailableQuantity(batch) })
}

async function verifyExistingTransferForAction(row: any, action: 'request' | 'approve' | 'ship'): Promise<any> {
  const response = await axios.get(`/transfers/${row.id}/`)
  const transfer = unwrapStockResponse(response, 'transfer')
  const items = Array.isArray(transfer?.items) ? transfer.items : []
  if (!items.length)
    throw transferSafetyError('transfer_ext_item_verification_failed')

  await Promise.all(items.map((item: any) => verifyBatchTrackedTransferItem(
    transfer,
    item,
    Number(action === 'ship'
      ? (item.shipped_qty ?? item.approved_qty ?? item.requested_qty)
      : item.requested_qty),
  )))

  return transfer
}

async function verifyTransferFormSafety(): Promise<void> {
  const stockItemId = quickForm.value.stock_item_id
  const fromLocationId = quickForm.value.from_location_id
  const quantity = Number(quickForm.value.quantity)
  let item: any
  try {
    item = await fetchItemDetail(stockItemId)
  }
  catch {
    throw transferSafetyError('transfer_ext_item_verification_failed')
  }
  if (item?.track_batches !== true)
    return
  if (!quickForm.value.batch_id)
    throw transferSafetyError('transfer_ext_batch_required')

  let batches: any[]
  try {
    batches = await fetchEligibleBatches(fromLocationId, stockItemId)
  }
  catch {
    throw transferSafetyError('transfer_ext_batch_verification_failed')
  }
  const batch = batches.find(row => String(row.id) === quickForm.value.batch_id)
  if (!batch)
    throw transferSafetyError('transfer_ext_batch_no_longer_eligible')
  if (quantity > batchAvailableQuantity(batch))
    throw transferSafetyError('transfer_ext_batch_insufficient', { available: batchAvailableQuantity(batch) })
}

// ---------------- actions ----------------
async function performAction(row: any, action: 'request' | 'approve' | 'ship') {
  if (!mayPerform(action) || actingId.value === row.id)
    return
  actingId.value = row.id
  try {
    await verifyExistingTransferForAction(row, action)
    await axios.post(`/transfers/${row.id}/${action}/`, {})

    const okKey
      = action === 'request'
        ? 'transfer_ext_msg_requested'
        : action === 'approve'
          ? 'transfer_ext_msg_approved'
          : 'transfer_ext_msg_shipped'

    notify(t(okKey))
    await loadTransfers()
  }
  catch (e: any) {
    const errKey
      = action === 'request'
        ? 'transfer_ext_err_request'
        : action === 'approve'
          ? 'transfer_ext_err_approve'
          : 'transfer_ext_err_ship'

    notify(e?.response?.data?.message ?? e?.message ?? t(errKey), 'error')
  }
  finally {
    actingId.value = null
    confirmDialog.value = null
  }
}

async function confirmReceive() {
  if (!canReceiveTransfers.value || !receiveDialog.value)
    return
  const row = receiveDialog.value.row

  receiveDialog.value.loading = true
  try {
    // The deployed server currently supports full receipts safely. Passing an
    // empty map makes that behavior explicit and avoids pretending partial
    // quantities were honored when JSON object keys arrive as strings.
    await axios.post(`/transfers/${row.id}/receive/`, { received_quantities: {} })
    notify(t('transfer_ext_msg_received'))
    receiveDialog.value = null
    await loadTransfers()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('transfer_ext_err_receive'), 'error')
    if (receiveDialog.value)
      receiveDialog.value.loading = false
  }
}

async function confirmCancel() {
  if (!canCancelTransfers.value || !cancelDialog.value)
    return
  const row = cancelDialog.value.row

  cancelDialog.value.loading = true
  try {
    // Recheck the latest state immediately before canceling. The deployed
    // backend does not safely restore batch quantities after shipment, so an
    // IN_TRANSIT transfer must never be canceled from this client.
    const detailResponse = await axios.get(`/transfers/${row.id}/`)

    const latest = detailResponse.data?.data?.transfer
      ?? detailResponse.data?.transfer
      ?? detailResponse.data?.data
      ?? detailResponse.data

    if (!canCancel(latest)) {
      notify(t('transfer_ext_err_cancel_after_ship'), 'error')
      cancelDialog.value = null
      await loadTransfers()

      return
    }
    await axios.post(`/transfers/${row.id}/cancel/`, { reason: cancelDialog.value.reason || '' })
    notify(t('transfer_ext_msg_canceled'))
    cancelDialog.value = null
    await loadTransfers()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('transfer_ext_err_cancel'), 'error')
    if (cancelDialog.value)
      cancelDialog.value.loading = false
  }
}

// ---------------- openers ----------------
function openConfirm(row: any, kind: 'request' | 'approve' | 'ship') {
  if (!mayPerform(kind))
    return

  confirmDialog.value = { kind, row }
}

async function openReceive(row: any) {
  if (!canReceiveTransfers.value)
    return

  // fetch detail to know items
  receiveDialog.value = { row, loading: false }
  try {
    const res = await axios.get(`/transfers/${row.id}/`)
    const detail = res.data?.data?.transfer ?? res.data?.transfer ?? res.data?.data ?? res.data

    receiveDialog.value = { row: detail, loading: false }
  }
  catch {
    notify(t('transfer_ext_err_receive'), 'error')
    receiveDialog.value = null
  }
}

function openCancel(row: any) {
  if (!canCancel(row))
    return

  cancelDialog.value = { row, reason: '', loading: false }
}

async function openDetail(row: any) {
  detailDialog.value = { row, loading: true }
  try {
    const res = await axios.get(`/transfers/${row.id}/`)
    const detail = res.data?.data?.transfer ?? res.data?.transfer ?? res.data?.data ?? res.data

    detailDialog.value = { row: detail, loading: false }
  }
  catch (error) {
    if (detailDialog.value) {
      detailDialog.value.loading = false
      detailDialog.value.error = translate(error)
    }
  }
}

async function openQuick() {
  if (!canQuickTransfer.value)
    return

  if (metaLoading.value)
    return
  if (metaError.value) {
    await loadMeta()
    if (metaError.value)
      return
  }

  transferFormMode.value = 'quick'
  resetTransferForm()
  quickDialog.value = true
}

async function openRequest() {
  if (!canRequestTransfers.value)
    return

  if (metaLoading.value)
    return
  if (metaError.value) {
    await loadMeta()
    if (metaError.value)
      return
  }

  transferFormMode.value = 'request'
  resetTransferForm()
  quickDialog.value = true
}

function resetTransferForm() {
  quickForm.value = {
    from_location_id: '',
    to_location_id: '',
    stock_item_id: '',
    quantity: '',
    batch_id: '',
    notes: '',
  }
  quickErrors.value = {}
  batchesList.value = []
}

function validateQuick(): boolean {
  const errs: Record<string, string> = {}
  if (!quickForm.value.from_location_id)
    errs.from_location_id = t('transfer_ext_validation_required')
  if (!quickForm.value.to_location_id)
    errs.to_location_id = t('transfer_ext_validation_required')
  if (
    quickForm.value.from_location_id
    && quickForm.value.from_location_id === quickForm.value.to_location_id
  )
    errs.to_location_id = t('transfer_ext_validation_same_location')
  if (!quickForm.value.stock_item_id)
    errs.stock_item_id = t('transfer_ext_validation_required')
  else if (itemSafetyLoading.value || itemSafetyError.value)
    errs.stock_item_id = itemSafetyError.value || t('transfer_ext_item_verification_pending')
  const qty = Number(quickForm.value.quantity)
  if (!quickForm.value.quantity || Number.isNaN(qty) || qty <= 0)
    errs.quantity = t('transfer_ext_validation_positive_qty')
  if (selectedTracksBatches.value) {
    if (batchesError.value)
      errs.batch_id = batchesError.value
    else if (batchesLoading.value)
      errs.batch_id = t('transfer_ext_batch_verification_pending')
    else if (!quickForm.value.batch_id)
      errs.batch_id = t('transfer_ext_batch_required')
  }
  quickErrors.value = errs
  return Object.keys(errs).length === 0
}

async function submitQuick() {
  const allowed = transferFormMode.value === 'request' ? canRequestTransfers.value : canQuickTransfer.value
  if (!allowed || !validateQuick())
    return
  quickSaving.value = true
  let createdTransferId: number | null = null
  try {
    await verifyTransferFormSafety()
    const payload: any = {
      from_location_id: Number(quickForm.value.from_location_id),
      to_location_id: Number(quickForm.value.to_location_id),
      stock_item_id: Number(quickForm.value.stock_item_id),
      quantity: Number(quickForm.value.quantity),
    }

    if (quickForm.value.batch_id)
      payload.batch_id = Number(quickForm.value.batch_id)
    if (quickForm.value.notes)
      payload.notes = quickForm.value.notes

    if (transferFormMode.value === 'request') {
      const createPayload: any = {
        from_location_id: payload.from_location_id,
        to_location_id: payload.to_location_id,
        transfer_type: 'INTERNAL',
        notes: payload.notes ?? '',
        items: [{
          stock_item_id: payload.stock_item_id,
          quantity: payload.quantity,
          ...(payload.batch_id ? { batch_id: payload.batch_id } : {}),
        }],
      }

      const response = await axios.post('/transfers/', createPayload)
      const data = response.data?.data ?? response.data
      const transferId = data?.id ?? data?.transfer?.id
      if (!transferId)
        throw new Error(t('transfer_ext_err_create_request'))
      createdTransferId = Number(transferId)
      await axios.post(`/transfers/${createdTransferId}/request/`, {})
      notify(t('transfer_ext_msg_requested'))
    }
    else {
      await axios.post('/transfers/quick/', payload)
      notify(t('transfer_ext_msg_quick_done'))
    }
    quickDialog.value = false
    await loadTransfers()
  }
  catch (e: any) {
    if (transferFormMode.value === 'request' && createdTransferId !== null) {
      // Creating a transfer and submitting it are separate backend operations.
      // Close and refresh after a failed submit so retrying the modal cannot
      // create a duplicate draft; the draft row exposes the safe Request action.
      quickDialog.value = false
      await loadTransfers()

      const createdRow = transfers.value.find(transferRow => transferRow.id === createdTransferId)
      if (createdRow && createdRow.status !== 'DRAFT')
        notify(t('transfer_ext_msg_requested'))
      else
        notify(t('transfer_ext_err_draft_created', { id: createdTransferId }), 'error')
    }
    else {
      notify(e?.response?.data?.message ?? e?.message ?? t(transferFormMode.value === 'request' ? 'transfer_ext_err_create_request' : 'transfer_ext_err_quick'), 'error')
    }
  }
  finally {
    quickSaving.value = false
  }
}

// ---------------- helpers ----------------
function locName(loc: any): string {
  if (loc == null)
    return '—'
  if (typeof loc === 'string')
    return loc
  return loc?.name ?? '—'
}

function shippedQtyOf(item: any): string {
  return String(item.shipped_qty ?? item.approved_qty ?? item.requested_qty ?? '0')
}

// ---------------- DataTable columns ----------------
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'transfer_number', label: t('transfers_col_number') },
  { key: 'from_location', label: t('transfers_col_from') },
  { key: 'to_location', label: t('transfers_col_to') },
  { key: 'transfer_type', label: t('transfers_col_type') },
  { key: 'status', label: t('transfers_col_status') },
  { key: 'requested_at', label: t('transfers_col_requested_at') },
  { key: 'shipped_at', label: t('transfers_col_shipped_at') },
  { key: 'received_at', label: t('transfers_col_received_at') },
  { key: 'created_at', label: t('transfers_col_created_at'), align: 'right' },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

const confirmText = computed(() => {
  if (!confirmDialog.value)
    return ''
  const k = confirmDialog.value.kind
  if (k === 'request')
    return t('transfer_ext_confirm_request')
  if (k === 'approve')
    return t('transfer_ext_confirm_approve')
  return t('transfer_ext_confirm_ship')
})

const confirmTitle = computed(() => {
  if (!confirmDialog.value)
    return ''
  const k = confirmDialog.value.kind
  if (k === 'request')
    return t('transfer_action_request')
  if (k === 'approve')
    return t('transfer_action_approve')
  return t('transfer_action_ship')
})
</script>

<template>
  <WorkspacePage class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('transfers_ext_title')"
      :subtitle="t('transfers_ext_subtitle')"
    >
      <template #actions>
        <Button
          v-if="canRequestTransfers"
          variant="primary"
          icon="plus"
          :loading="metaLoading"
          :disabled="metaLoading"
          @click="openRequest"
        >
          {{ t('transfer_request_title') }}
        </Button>
        <Button
          v-if="canQuickTransfer"
          variant="secondary"
          icon="sparkle"
          :disabled="metaLoading"
          @click="openQuick"
        >
          {{ t('transfer_action_quick') }}
        </Button>
      </template>
    </PageHeader>

    <div v-if="metaError" class="inline-alert" role="alert">
      <DesignIcon name="alert" :size="18" />
      <span><strong>{{ t('Failed to load') }}.</strong> {{ metaError }}</span>
      <Button variant="ghost" size="sm" icon="retry" :loading="metaLoading" @click="loadMeta">{{ t('Retry') }}</Button>
    </div>

    <!-- Filter card -->
    <div class="card">
      <WorkspaceToolbar class="toolbar" style="flex-wrap: wrap;">
        <div class="filter-cell">
          <Select
            :model-value="statusFilter ?? ''"
            :placeholder="t('transfers_filter_status')"
            :options="statuses.map(s => ({ value: s, label: t(`transfer_status_${s}`) }))"
            @update:model-value="(v: string) => statusFilter = v || undefined"
          />
        </div>
        <div class="filter-cell">
          <Select
            :model-value="typeFilter ?? ''"
            :placeholder="t('transfers_filter_type')"
            :options="transferTypes.map(v => ({ value: v, label: t(`transfer_type_${v}`) }))"
            @update:model-value="(v: string) => typeFilter = v || undefined"
          />
        </div>
        <div class="filter-cell filter-cell--wide">
          <Select
            :model-value="fromLocationFilter !== undefined ? String(fromLocationFilter) : ''"
            :placeholder="t('transfers_filter_from_location')"
            :options="locationOptions"
            @update:model-value="(v: string) => fromLocationFilter = v ? Number(v) : undefined"
          />
        </div>
        <div class="filter-cell filter-cell--wide">
          <Select
            :model-value="toLocationFilter !== undefined ? String(toLocationFilter) : ''"
            :placeholder="t('transfers_filter_to_location')"
            :options="locationOptions"
            @update:model-value="(v: string) => toLocationFilter = v ? Number(v) : undefined"
          />
        </div>
        <div class="toolbar-spacer">
          <Button
            variant="ghost"
            size="sm"
            icon="close"
            :disabled="!statusFilter && !typeFilter && fromLocationFilter === undefined && toLocationFilter === undefined"
            @click="() => {
              statusFilter = undefined
              typeFilter = undefined
              fromLocationFilter = undefined
              toLocationFilter = undefined
            }"
          >
            {{ t('transfers_filter_all') }}
          </Button>
        </div>
      </WorkspaceToolbar>

      <div class="card__divider" />

      <!-- DataTable -->
      <StateFill v-if="loadError" icon="alert" :title="t('Failed to load transfers')" :sub="loadError" error>
        <template #action><Button variant="secondary" size="sm" icon="retry" @click="loadTransfers">{{ t('Retry') }}</Button></template>
      </StateFill>

      <DataTable
        v-else
        :columns="columns"
        :rows="transfers"
        row-key="id"
        :loading="loading"
        expandable
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
        :empty-title="t('transfer_ext_empty')"
        empty-icon="box"
        @row-click="(r: any) => ensureRowDetail(r)"
      >
        <template #cell.transfer_number="{ row: r }">
          <span class="cell-strong mono">{{ r.transfer_number }}</span>
        </template>

        <template #cell.from_location="{ row: r }">
          <span class="cell-muted">{{ locName(r.from_location) }}</span>
        </template>

        <template #cell.to_location="{ row: r }">
          <span class="cell-muted">{{ locName(r.to_location) }}</span>
        </template>

        <template #cell.transfer_type="{ row: r }">
          <Badge :tone="TYPE_TONE[r.transfer_type] ?? 'neutral'">
            {{ r.transfer_type ? t(`transfer_type_${r.transfer_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.status="{ row: r }">
          <Badge :tone="statusTone(r.status)" dot>
            {{ r.status ? t(`transfer_status_${r.status}`) : '—' }}
          </Badge>
        </template>

        <template #cell.requested_at="{ row: r }">
          <span class="mono cell-muted nowrap">{{ r.requested_at ? formatDateShort(r.requested_at) : '—' }}</span>
        </template>

        <template #cell.shipped_at="{ row: r }">
          <span class="mono cell-muted nowrap">{{ r.shipped_at ? formatDateShort(r.shipped_at) : '—' }}</span>
        </template>

        <template #cell.received_at="{ row: r }">
          <span class="mono cell-muted nowrap">{{ r.received_at ? formatDateShort(r.received_at) : '—' }}</span>
        </template>

        <template #cell.created_at="{ row: r }">
          <span class="mono cell-muted nowrap">{{ formatDateShort(r.created_at) }}</span>
        </template>

        <!-- Inline row actions -->
        <template #row-actions="{ row: r }">
          <IconAction
            icon="info"
            :title="t('transfer_ext_view_detail')"
            @click="openDetail(r)"
          />
          <IconAction
            v-if="canRequest(r)"
            icon="send"
            tone="primary"
            :title="t('transfer_action_request')"
            :disabled="actingId === r.id"
            @click="openConfirm(r, 'request')"
          />
          <IconAction
            v-if="canApprove(r)"
            icon="check"
            tone="success"
            :title="t('transfer_action_approve')"
            :disabled="actingId === r.id"
            @click="openConfirm(r, 'approve')"
          />
          <IconAction
            v-if="canShip(r)"
            icon="package"
            tone="primary"
            :title="t('transfer_action_ship')"
            :disabled="actingId === r.id"
            @click="openConfirm(r, 'ship')"
          />
          <IconAction
            v-if="canReceive(r)"
            icon="checkcircle"
            tone="success"
            :title="t('transfer_action_receive')"
            :disabled="actingId === r.id"
            @click="openReceive(r)"
          />
          <IconAction
            v-if="canCancel(r)"
            icon="close"
            tone="danger"
            :title="t('transfer_action_cancel')"
            :disabled="actingId === r.id"
            @click="openCancel(r)"
          />
        </template>

        <!-- Expanded row -->
        <template #expanded="{ row: r }">
          <div class="kpi__label" style="margin-bottom: 10px;">
            {{ t('transfer_ext_items_header') }}
          </div>
          <div class="tablewrap">
            <table
              class="dtable"
              style="background: var(--surface); border-radius: 10px; border: 1px solid var(--border); overflow: hidden;"
            >
              <thead>
                <tr>
                  <th>{{ t('transfer_field_stock_item') }}</th>
                  <th class="num">{{ t('transfer_field_requested_qty') }}</th>
                  <th class="num">{{ t('transfer_field_shipped_qty') }}</th>
                  <th class="num">{{ t('transfer_field_received_qty') }}</th>
                  <th>{{ t('transfer_field_unit') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(li, idx) in ((r.items ?? []) as any[])" :key="idx">
                  <td class="cell-strong">
                    {{ li.stock_item?.name ?? '—' }}
                  </td>
                  <td class="num mono">{{ li.requested_qty ?? '—' }}</td>
                  <td class="num mono">{{ li.shipped_qty ?? '—' }}</td>
                  <td class="num mono">{{ li.received_qty ?? '—' }}</td>
                  <td class="cell-muted">{{ li.unit_short ?? '—' }}</td>
                </tr>
                <tr v-if="!(r.items?.length)">
                  <td colspan="5" class="center cell-muted">
                    {{ t('transfer_ext_no_items') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <template #empty>
          <StateFill
            icon="box"
            :title="t('transfer_ext_empty')"
          />
        </template>
      </DataTable>
    </div>

    <!-- ============ CONFIRM modal (request/approve/ship) ============ -->
    <Modal
      :open="!!confirmDialog"
      :title="confirmTitle"
      :width="440"
      @close="confirmDialog = null"
    >
      <p style="margin: 0; color: var(--text-secondary); font-size: 14px;">
        {{ confirmText }}
      </p>
      <div v-if="confirmDialog?.row" style="margin-top: 12px; font-size: 13px;">
        <b class="mono">{{ confirmDialog.row.transfer_number }}</b>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="actingId === confirmDialog?.row?.id"
          @click="confirmDialog && performAction(confirmDialog.row, confirmDialog.kind)"
        >
          {{ t('Confirm') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ RECEIVE modal ============ -->
    <Modal
      v-if="canReceiveTransfers"
      :open="!!receiveDialog"
      :title="t('transfer_action_receive')"
      :subtitle="t('transfer_ext_confirm_receive')"
      :width="640"
      @close="receiveDialog = null"
    >
      <div v-if="receiveDialog?.row?.items?.length">
        <div class="receive-notice" role="note">
          <DesignIcon name="info" :size="18" />
          <span>{{ t('transfer_full_receipt_only') }}</span>
        </div>
        <div
          v-for="it in (receiveDialog.row.items as any[])"
          :key="it.id"
          class="row receive-row"
          style="gap: 12px; align-items: center; margin-bottom: 10px; flex-wrap: wrap;"
        >
          <div style="flex: 1; min-width: 0;">
            <div class="cell-strong">{{ it.stock_item?.name ?? '—' }}</div>
            <div class="cell-muted" style="font-size: 12px;">
              {{ t('transfer_field_shipped_qty') }}:
              <b class="mono">{{ shippedQtyOf(it) }}</b>
              <span v-if="it.unit_short" class="mono"> {{ it.unit_short }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="cell-muted">
        {{ t('transfer_ext_no_items') }}
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="receiveDialog?.loading"
          :disabled="!receiveDialog?.row?.items?.length"
          @click="confirmReceive"
        >
          {{ t('transfer_action_receive') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ CANCEL modal ============ -->
    <Modal
      v-if="canCancelTransfers"
      :open="!!cancelDialog"
      :title="t('transfer_action_cancel')"
      :subtitle="t('transfer_ext_confirm_cancel')"
      :width="480"
      @close="cancelDialog = null"
    >
      <Field :label="t('transfer_field_reason')">
        <Textarea
          v-if="cancelDialog"
          v-model="cancelDialog.reason"
          class="control"
          rows="3"
          style="padding: 8px 12px; resize: vertical; min-height: 80px;"
        />
      </Field>

      <template #footer>
        <Button
          variant="danger"
          :loading="cancelDialog?.loading"
          @click="confirmCancel"
        >
          {{ t('transfer_action_cancel') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ DETAIL modal ============ -->
    <Modal
      :open="!!detailDialog"
      :title="detailDialog?.row?.transfer_number ?? t('transfer_ext_view_detail')"
      :width="720"
      @close="detailDialog = null"
    >
      <StateFill v-if="detailDialog?.loading" icon="loader" :title="t('Loading')" />
      <StateFill v-else-if="detailDialog?.error" icon="alert" :title="t('Failed to load')" :sub="detailDialog.error" error>
        <template #action><Button variant="secondary" size="sm" icon="retry" @click="openDetail(detailDialog.row)">{{ t('Retry') }}</Button></template>
      </StateFill>
      <div v-else-if="detailDialog?.row" style="display: grid; gap: 14px;">
        <!-- Top meta -->
        <div class="grid cols-2" style="gap: 12px;">
          <div>
            <div class="kpi__label">{{ t('transfers_col_from') }}</div>
            <div class="cell-strong">{{ locName(detailDialog.row.from_location) }}</div>
          </div>
          <div>
            <div class="kpi__label">{{ t('transfers_col_to') }}</div>
            <div class="cell-strong">{{ locName(detailDialog.row.to_location) }}</div>
          </div>
          <div>
            <div class="kpi__label">{{ t('transfers_col_type') }}</div>
            <Badge :tone="TYPE_TONE[detailDialog.row.transfer_type] ?? 'neutral'">
              {{ detailDialog.row.transfer_type ? t(`transfer_type_${detailDialog.row.transfer_type}`) : '—' }}
            </Badge>
          </div>
          <div>
            <div class="kpi__label">{{ t('transfers_col_status') }}</div>
            <Badge :tone="statusTone(detailDialog.row.status)" dot>
              {{ detailDialog.row.status ? t(`transfer_status_${detailDialog.row.status}`) : '—' }}
            </Badge>
          </div>
        </div>

        <!-- Lifecycle timeline -->
        <div>
          <div class="kpi__label" style="margin-bottom: 8px;">{{ t('transfers_col_created_at') }}</div>
          <div class="row" style="gap: 18px; flex-wrap: wrap; font-size: 13px;">
            <div>
              <div class="cell-muted">{{ t('transfers_col_requested_at') }}</div>
              <div class="mono">{{ detailDialog.row.requested_at ? formatDate(detailDialog.row.requested_at) : '—' }}</div>
            </div>
            <div>
              <div class="cell-muted">{{ t('transfers_col_approved_at') }}</div>
              <div class="mono">{{ detailDialog.row.approved_at ? formatDate(detailDialog.row.approved_at) : '—' }}</div>
            </div>
            <div>
              <div class="cell-muted">{{ t('transfers_col_shipped_at') }}</div>
              <div class="mono">{{ detailDialog.row.shipped_at ? formatDate(detailDialog.row.shipped_at) : '—' }}</div>
            </div>
            <div>
              <div class="cell-muted">{{ t('transfers_col_received_at') }}</div>
              <div class="mono">{{ detailDialog.row.received_at ? formatDate(detailDialog.row.received_at) : '—' }}</div>
            </div>
          </div>
        </div>

        <!-- Items -->
        <div>
          <div class="kpi__label" style="margin-bottom: 8px;">{{ t('transfer_ext_items_header') }}</div>
          <div class="tablewrap">
            <table class="dtable" style="background: var(--surface); border-radius: 10px; border: 1px solid var(--border); overflow: hidden;">
              <thead>
                <tr>
                  <th>{{ t('transfer_field_stock_item') }}</th>
                  <th class="num">{{ t('transfer_field_requested_qty') }}</th>
                  <th class="num">{{ t('transfer_field_approved_qty') }}</th>
                  <th class="num">{{ t('transfer_field_shipped_qty') }}</th>
                  <th class="num">{{ t('transfer_field_received_qty') }}</th>
                  <th>{{ t('transfer_field_unit') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(li, idx) in ((detailDialog.row.items ?? []) as any[])" :key="idx">
                  <td class="cell-strong">{{ li.stock_item?.name ?? '—' }}</td>
                  <td class="num mono">{{ li.requested_qty ?? '—' }}</td>
                  <td class="num mono">{{ li.approved_qty ?? '—' }}</td>
                  <td class="num mono">{{ li.shipped_qty ?? '—' }}</td>
                  <td class="num mono">{{ li.received_qty ?? '—' }}</td>
                  <td class="cell-muted">{{ li.unit_short ?? '—' }}</td>
                </tr>
                <tr v-if="!(detailDialog.row.items?.length)">
                  <td colspan="6" class="center cell-muted">
                    {{ t('transfer_ext_no_items') }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="detailDialog.row.notes" style="font-size: 13px;">
          <div class="kpi__label">{{ t('transfer_field_notes') }}</div>
          <div>{{ detailDialog.row.notes }}</div>
        </div>
      </div>
    </Modal>

    <!-- ============ TRANSFER REQUEST / QUICK TRANSFER modal ============ -->
    <Modal
      v-if="canRequestTransfers || canQuickTransfer"
      :open="quickDialog"
      :title="t(transferFormMode === 'request' ? 'transfer_request_title' : 'transfer_quick_title')"
      :subtitle="t(transferFormMode === 'request' ? 'transfer_request_subtitle' : 'transfer_quick_subtitle')"
      :width="640"
      @close="quickDialog = false"
    >
      <div style="background: var(--surface-inset); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 14px; color: var(--text-secondary);"
      >
        <DesignIcon name="info" :size="16" style="vertical-align: -3px; margin-right: 6px;" />
        {{ t(transferFormMode === 'request' ? 'transfer_request_help' : 'transfer_ext_quick_help') }}
      </div>

      <div class="grid cols-2" style="gap: 12px;">
        <Field
          :label="t('transfer_field_from_location')"
          :error="quickErrors.from_location_id"
        >
          <Select
            :model-value="quickForm.from_location_id"
            :placeholder="t('transfer_ext_select_location')"
            :options="locationOptions"
            @update:model-value="(v: string) => quickForm.from_location_id = v"
          />
        </Field>

        <Field
          :label="t('transfer_field_to_location')"
          :error="quickErrors.to_location_id"
        >
          <Select
            :model-value="quickForm.to_location_id"
            :placeholder="t('transfer_ext_select_location')"
            :options="locationOptions"
            @update:model-value="(v: string) => quickForm.to_location_id = v"
          />
        </Field>

        <Field
          :label="t('transfer_field_stock_item')"
          :error="quickErrors.stock_item_id"
          style="grid-column: 1 / -1;"
        >
          <Select
            :model-value="quickForm.stock_item_id"
            :placeholder="t('transfer_ext_select_item')"
            :options="itemOptions"
            @update:model-value="(v: string) => quickForm.stock_item_id = v"
          />
        </Field>

        <Field
          :label="t('transfer_field_quantity')"
          :error="quickErrors.quantity"
          :hint="selectedBaseUnitShort ? t('transfer_ext_base_unit_hint', { unit: selectedBaseUnitShort }) : ''"
          style="grid-column: 1 / -1;"
        >
          <Input
            :model-value="quickForm.quantity"
            type="number"
            step="0.0001"
            min="0"
            @update:model-value="(v: string) => quickForm.quantity = v"
          />
        </Field>

        <div
          v-if="itemSafetyError"
          class="inline-alert"
          style="grid-column: 1 / -1; margin-bottom: 0;"
        >
          <DesignIcon name="alert" :size="16" />
          <span>{{ itemSafetyError }}</span>
        </div>

        <Field
          v-if="selectedTracksBatches"
          :label="t('transfer_field_batch')"
          :error="quickErrors.batch_id || batchesError"
          :hint="t('transfer_ext_batch_required_hint')"
          style="grid-column: 1 / -1;"
        >
          <Select
            :model-value="quickForm.batch_id"
            :placeholder="batchesLoading ? t('transfer_ext_batch_verification_pending') : t('transfer_ext_select_batch_required')"
            :options="batchOptions"
            :disabled="!quickForm.from_location_id || !quickForm.stock_item_id || batchesLoading || !!batchesError"
            @update:model-value="(v: string) => quickForm.batch_id = v"
          />
        </Field>

        <Field :label="t('transfer_field_notes')" style="grid-column: 1 / -1;">
          <Textarea
            v-model="quickForm.notes"
            class="control"
            rows="3"
            style="padding: 8px 12px; resize: vertical; min-height: 80px;"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :icon="transferFormMode === 'request' ? 'send' : 'sparkle'"
          :loading="quickSaving"
          @click="submitQuick"
        >
          {{ t(transferFormMode === 'request' ? 'transfer_action_request' : 'transfer_action_quick') }}
        </Button>
      </template>
    </Modal>

    <!-- Lightweight inline toast (kept for compatibility with useNotify) -->
    <div
      v-if="snackbar"
      class="notify-snackbar" :class="[`tone-${snackbarColor}`]"
    >
      {{ snackbarMsg }}
    </div>
  </WorkspacePage>
</template>

<style scoped>
.inline-alert { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid rgb(var(--v-theme-error-border)); border-radius: var(--r-md); color: rgb(var(--v-theme-error-strong)); background: rgb(var(--v-theme-error-weak)); font-size: 13px; }
.inline-alert span { flex: 1; min-width: 0; }
.cell-strong { color: var(--text); font-weight: 600; }
.cell-muted { color: var(--text-secondary); }
.mono { font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
.nowrap { white-space: nowrap; }
.center { text-align: center; }
.num { text-align: right; }
.row { display: flex; align-items: center; }
.grid { display: grid; }
.cols-2 { grid-template-columns: 1fr 1fr; }

/* Toolbar filter cells: stay generous on desktop, drop to full width on mobile */
.filter-cell { width: 200px; min-width: 0; }
.filter-cell--wide { width: 220px; }
.toolbar-spacer { margin-left: auto; }
.receive-notice { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 14px; padding: 10px 12px; border: 1px solid rgb(var(--v-theme-info-border)); border-radius: var(--r-md); color: rgb(var(--v-theme-info-strong)); background: rgb(var(--v-theme-info-weak)); font-size: 13px; }
.tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* Snackbar pinned bottom-right; clears bottom tabbar on phone */
.notify-snackbar {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 18px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  z-index: 9999;
  max-width: calc(100vw - 32px);
}

@media (max-width: 900px) {
  .filter-cell,
  .filter-cell--wide { width: 100%; flex: 1 1 100%; }
  .toolbar-spacer { margin-left: 0; width: 100%; }
  .cols-2 { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  /* Snackbar clears the bottom tabbar */
  .notify-snackbar {
    left: 16px;
    right: 16px;
    bottom: calc(var(--tabbar-h, 64px) + 16px);
    max-width: none;
  }
  /* Receive row stacks fully */
  .receive-row { gap: 8px; }
}
</style>

<style>
/* Global override: force modal sheet conversion on phones (overrides inline
   width style set by Modal primitive). Non-scoped because Modal teleports
   its content to <body>. */
@media (max-width: 768px) {
  .overlay > .modal {
    max-width: 100% !important;
  }
}
</style>

<route lang="yaml">
name: stock-transfers
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.transfer.view
</route>
