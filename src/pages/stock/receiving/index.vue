<script setup lang="ts">
/* ============================================================
   ALPHA POS — Goods Receiving page
   Design-system primitives (no Vuetify on the page).
   Two-step flow:
     1) List of receivings (filter / search / status / PO / dates).
     2) Drill into a draft receiving → add per-line items → Complete.
   ============================================================ */
import { stockApi } from '@/plugins/axios'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import DataTable, { type DataTableColumn } from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import IconAction from '@/components/design/IconAction.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Textarea from '@/components/design/Textarea.vue'
import { useUserAccess } from '@/composables/useUserAccess'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { translate } = useApiError()
const { formatCurrency, formatDate } = useFormatters()
const route = useRoute()
const { hasPermission, currentUserId, isAdministrator } = useUserAccess()

const canCreateReceiving = computed(() => hasPermission('stock.receiving.create'))
const canUpdateDraft = computed(() => hasPermission('stock.receiving.update_draft'))
const canCompleteReceiving = computed(() => hasPermission('stock.receiving.complete'))
const canApproveOverReceipt = computed(() => hasPermission('stock.receiving.approve_over'))

// ---------- state ----------
const receivings = ref<any[]>([])
const total = ref(0)
const loading = ref(false)
const loadError = ref('')

const page = ref(1)
const itemsPerPage = ref(10)

const search = ref('')
const statusFilter = ref<string | undefined>(undefined)
const poFilter = ref<string | undefined>(undefined)
const dateFrom = ref('')
const dateTo = ref('')

// lookups
const poOptions = ref<{ value: string; label: string; raw: any }[]>([])
const locationOptions = ref<{ value: string; label: string }[]>([])
const lookupLoading = ref(false)
const lookupError = ref('')

// per-row loading
const actingOnId = ref<number | string | null>(null)

// modals
const createOpen = ref(false)
const viewOpen = ref(false)
const addItemOpen = ref(false)
const confirmCompleteOpen = ref(false)
const approveOverOpen = ref(false)
const correctionOpen = ref(false)
const returnToViewAfterItem = ref(false)
const returnToViewAfterComplete = ref(false)
const returnToViewAfterApproval = ref(false)
const returnToViewAfterCorrection = ref(false)
const saving = ref(false)
const approvalSaving = ref(false)
const correctionSaving = ref(false)
const completionBalance = ref<{ receivingId: number | string; before: number; after: number } | null>(null)
const approvalReason = ref('')
const correctionReason = ref('')
const approvalError = ref('')
const correctionError = ref('')
const postedApprovalIds = ref<Set<string>>(new Set())

const correctionReceipt = ref<{
  receivingId: number | string
  correctionId: number | string
  status: string
} | null>(null)

// selection (for drill flow)
const activeReceiving = ref<any | null>(null)
const activePO = ref<any | null>(null)

// ---------- enums ----------
const rcvStatuses = [
  { value: 'DRAFT', tone: 'warning' as const },
  { value: 'COMPLETE', tone: 'success' as const },
]

const qualityStatuses = [
  { value: 'PASSED', tone: 'success' as const },
  { value: 'FAILED', tone: 'error' as const },
  { value: 'PENDING', tone: 'warning' as const },
]

const STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  DRAFT: 'warning',
  COMPLETE: 'success',
  COMPLETED: 'success',
  CONFIRMED: 'info',
  PARTIAL: 'warning',
  RECEIVED: 'success',
  PASSED: 'success',
  FAILED: 'error',
  PENDING: 'warning',
}

function tone(v?: string) {
  if (!v)
    return 'neutral'
  return STATUS_TONE[v] ?? 'neutral'
}

function isDraft(receiving: any): boolean {
  return receiving?.status === 'DRAFT'
}

function isCompleted(receiving: any): boolean {
  return receiving?.status === 'COMPLETED' || receiving?.status === 'COMPLETE'
}

// Never infer approval from a successful POST. The receiving must be refreshed,
// and the server must expose both the approving actor and timestamp before this
// client can permit a quantity above the PO remainder.
function hasVerifiedOverReceiptApproval(receiving: any): boolean {
  return receiving?.over_receipt_approved_by_id != null
    && Boolean(receiving?.over_receipt_approved_at)
}

function allowedByRecord(receiving: any, action: string, fallback: boolean): boolean {
  const actions = receiving?.allowed_actions
  if (!Array.isArray(actions))
    return fallback

  return actions.map(String).includes(action)
}

function isOwnedByCurrentUser(receiving: any): boolean {
  if (isAdministrator.value)
    return true

  return currentUserId.value != null
    && receiving?.received_by_id != null
    && String(currentUserId.value) === String(receiving.received_by_id)
}

function mayEdit(receiving: any): boolean {
  return isDraft(receiving)
    && isOwnedByCurrentUser(receiving)
    && allowedByRecord(receiving, 'update_draft', canUpdateDraft.value)
}

function mayComplete(receiving: any): boolean {
  return isDraft(receiving)
    && isOwnedByCurrentUser(receiving)
    && allowedByRecord(receiving, 'complete', canCompleteReceiving.value)
}

function mayApproveOverReceipt(receiving: any): boolean {
  if (
    !isDraft(receiving)
    || !canApproveOverReceipt.value
    || hasVerifiedOverReceiptApproval(receiving)
    || postedApprovalIds.value.has(String(receiving?.id))
  )
    return false

  // The deployed endpoint rejects self-approval. A missing owner is not enough
  // evidence to safely advertise the action.
  return currentUserId.value != null
    && receiving?.received_by_id != null
    && String(currentUserId.value) !== String(receiving.received_by_id)
}

function mayRequestCorrection(receiving: any): boolean {
  return isCompleted(receiving)
    && canCreateReceiving.value
    && String(correctionReceipt.value?.receivingId ?? '') !== String(receiving?.id)
}

// ---------- forms ----------
const createForm = ref({
  purchase_order_id: '' as string,
  location_id: '' as string,
  notes: '',
})

const itemForm = ref({
  po_item_id: '' as string,
  quantity_received: '' as string,
  unit_cost: '' as string,
  batch_number: '',
  expiry_date: '',
  quality_status: 'PASSED',
  notes: '',
})

// ---------- load ----------
// The deployed backend intentionally scopes receiving lists to their purchase
// order. Load the relevant POs, then use each PO's canonical receiving route.
function normalizeReceiving(receiving: any, context: any = {}) {
  const po = receiving?.purchase_order ?? context.purchase_order ?? {}
  const location = receiving?.location ?? context.location ?? {}

  return {
    ...receiving,
    purchase_order_id: receiving?.purchase_order_id ?? po.id ?? context.purchase_order_id,
    purchase_order_number: receiving?.purchase_order_number ?? po.order_number ?? context.purchase_order_number,
    location_name: receiving?.location_name ?? location.name ?? context.location_name,
    items_count: receiving?.items_count ?? receiving?.items?.length ?? 0,
  }
}

async function loadPurchaseOrdersByStatus(status: string): Promise<any[]> {
  const orders: any[] = []
  const perPage = 100
  for (let currentPage = 1; ; currentPage += 1) {
    const response = await stockApi.get('/purchase-orders/', {
      params: { status, page: currentPage, per_page: perPage },
    })

    const data = response.data?.data ?? response.data
    const pageOrders = data?.orders ?? []

    orders.push(...pageOrders)

    const expectedTotal = Number(data?.pagination?.total ?? orders.length)
    if (!pageOrders.length || orders.length >= expectedTotal)
      break
  }

  return orders
}

async function loadAllStockRows(path: string, key: string, params: Record<string, unknown> = {}): Promise<any[]> {
  const rows: any[] = []
  const perPage = 100
  for (let currentPage = 1; ; currentPage += 1) {
    const response = await stockApi.get(path, { params: { ...params, page: currentPage, per_page: perPage } })
    const data = response.data?.data ?? response.data
    const pageRows = data?.[key] ?? data?.results ?? []

    rows.push(...pageRows)

    const expectedTotal = Number(data?.pagination?.total ?? rows.length)
    if (!pageRows.length || rows.length >= expectedTotal)
      break
  }

  return rows
}

async function loadReceivingsFromPurchaseOrders() {
  const briefPos = (await Promise.all(
    ['CONFIRMED', 'PARTIAL', 'RECEIVED'].map(loadPurchaseOrdersByStatus),
  )).flat()

  const uniquePos = Array.from(new Map(briefPos.map(po => [String(po.id), po])).values())
  const receivingResponses = await Promise.all(uniquePos.map(po => stockApi.get(`/purchase-order/${po.id}/receiving/`)))
  let all: any[] = []
  receivingResponses.forEach((response, index) => {
    const data = response.data?.data ?? response.data
    const po = uniquePos[index]

    all.push(...(data?.receivings ?? []).map((receiving: any) => normalizeReceiving(receiving, {
      purchase_order_id: po.id,
      purchase_order_number: po.order_number,
      location_name: receiving.location_name,
    })))
  })

  const query = search.value.trim().toLowerCase()
  if (query)
    all = all.filter(receiving => `${receiving.receiving_number ?? ''} ${receiving.purchase_order_number ?? ''}`.toLowerCase().includes(query))
  if (statusFilter.value)
    all = all.filter(receiving => receiving.status === statusFilter.value || (statusFilter.value === 'COMPLETE' && receiving.status === 'COMPLETED'))
  if (poFilter.value)
    all = all.filter(receiving => String(receiving.purchase_order_id) === String(poFilter.value))
  if (dateFrom.value)
    all = all.filter(receiving => receiving.received_date >= dateFrom.value)
  if (dateTo.value)
    all = all.filter(receiving => receiving.received_date <= dateTo.value)
  total.value = all.length

  const start = (page.value - 1) * itemsPerPage.value

  receivings.value = all.slice(start, start + itemsPerPage.value)
}

async function loadReceivings() {
  loading.value = true
  loadError.value = ''
  try {
    await loadReceivingsFromPurchaseOrders()
  }
  catch (error) {
    receivings.value = []
    total.value = 0
    loadError.value = translate(error)
  }
  finally {
    loading.value = false
  }
}

async function loadLookups() {
  lookupLoading.value = true
  lookupError.value = ''
  try {
    // BE filter is exact-match on `status` (not CSV). Issue two requests and merge.
    const [confirmedOrders, partialOrders, locList] = await Promise.all([
      loadPurchaseOrdersByStatus('CONFIRMED'),
      loadPurchaseOrdersByStatus('PARTIAL'),
      loadAllStockRows('/locations/', 'locations', { is_active: true }),
    ])

    // BE canonical: data.orders
    const poList: any[] = [...confirmedOrders, ...partialOrders]

    poOptions.value = poList.map(p => ({
      value: String(p.id),
      label: p.order_number ?? `PO-${p.id}`,
      raw: p,
    }))

    locationOptions.value = locList.map(l => ({
      value: String(l.id),
      label: l.name ?? `#${l.id}`,
    }))
  }
  catch (error) {
    poOptions.value = []
    locationOptions.value = []
    lookupError.value = translate(error)
  }
  finally {
    lookupLoading.value = false
  }
}

onMounted(async () => {
  poFilter.value = route.query.po ? String(route.query.po) : undefined
  await Promise.all([loadReceivings(), loadLookups()])
  if (route.query.po && canCreateReceiving.value && !lookupError.value) {
    createForm.value.purchase_order_id = String(route.query.po)
    createOpen.value = true
  }
})

watch([page, itemsPerPage], loadReceivings)
watch([statusFilter, poFilter, dateFrom, dateTo], () => {
  page.value = 1
  loadReceivings()
})

const debouncedSearch = useDebounceFn(() => {
  page.value = 1
  loadReceivings()
}, 400)

watch(search, () => debouncedSearch())

// ---------- create ----------
async function openCreate() {
  if (lookupLoading.value)
    return
  if (lookupError.value) {
    await loadLookups()
    if (lookupError.value)
      return
  }

  createForm.value = {
    purchase_order_id: '',
    location_id: '',
    notes: '',
  }
  createOpen.value = true
}

// Auto-fill delivery location when PO is picked.
// PO list returns serialize_brief which has neither `delivery_location_id` nor a nested object,
// so fetch the PO detail (which exposes `delivery_location_id` on the full serialize).
watch(() => createForm.value.purchase_order_id, async id => {
  if (!id) {
    createForm.value.location_id = ''
    return
  }
  try {
    const r = await stockApi.get(`/purchase-orders/${id}/`)
    const det = r.data?.data ?? r.data
    const po = det?.order
    const locId = po?.delivery_location_id
    if (locId)
      createForm.value.location_id = String(locId)
  }
  catch { /* leave location blank */ }
})

async function createReceiving() {
  if (!createForm.value.purchase_order_id) {
    notify(t('Select Purchase Order'), 'error')
    return
  }
  saving.value = true
  try {
    const payload: any = {}
    if (createForm.value.location_id)
      payload.location_id = Number(createForm.value.location_id)
    if (createForm.value.notes)
      payload.notes = createForm.value.notes

    // PO id is a path param per spec (BE route is singular: /purchase-order/<id>/receiving/)
    const res = await stockApi.post(`/purchase-order/${createForm.value.purchase_order_id}/receiving/`, payload)
    const d = res.data?.data ?? res.data

    notify(t('Receiving created'))
    createOpen.value = false
    await loadReceivings()

    // Open the drill view on the freshly created receiving
    const created = d?.receiving ?? d
    if (created && created.id)
      await openView(created)
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to create receiving'), 'error')
  }
  finally {
    saving.value = false
  }
}

// ---------- view / drill ----------
async function openView(rcv: any) {
  activePO.value = null
  activeReceiving.value = normalizeReceiving(rcv)
  viewOpen.value = true

  try {
    const response = await stockApi.get(`/receiving/${rcv.id}/items/`)
    const data = response.data?.data ?? response.data
    const detail = data?.receiving ?? data
    if (detail?.id)
      activeReceiving.value = normalizeReceiving(detail, rcv)
  }
  catch (error: any) {
    notify(error?.response?.data?.message ?? t('Failed to load receiving'), 'error')
    return
  }

  // serialize_brief (the shape that comes through as a list row) has no `purchase_order_id`
  // and no nested `purchase_order` — we attach `purchase_order_id` ourselves in loadReceivings.
  const poId = activeReceiving.value?.purchase_order_id
  if (poId) {
    try {
      const r = await stockApi.get(`/purchase-orders/${poId}/`)
      const pd = r.data?.data ?? r.data

      // BE canonical: data.order
      activePO.value = pd?.order ?? null

      // Keep the full canonical detail when available; the legacy PO row is brief.
      const fresh = (activePO.value?.receivings ?? []).find((x: any) => x.id === rcv.id)
      if (fresh && !(activeReceiving.value?.items?.length)) {
        activeReceiving.value = {
          ...activeReceiving.value,
          ...fresh,
          purchase_order_id: activePO.value.id,
          purchase_order_number: activePO.value.order_number,
          location_name: typeof activePO.value.delivery_location === 'string' ? activePO.value.delivery_location : null,
        }
      }
    }
    catch { activePO.value = null }
  }
}

function closeView() {
  viewOpen.value = false
  activeReceiving.value = null
  activePO.value = null
  completionBalance.value = null
}

async function openViewAndAddItem(rcv: any) {
  await openView(rcv)
  if (activePO.value && activeReceiving.value?.id === rcv.id && mayEdit(activeReceiving.value))
    openAddItem()
}

// PO line items still awaiting receipt (drives Add Item dropdown).
// BE canonical: PO full serialize uses `items`. `line_items` is not a BE field.
// PO line items only have `quantity_ordered` (BE returns it as a string).
const pendingPOItems = computed<any[]>(() => {
  const po: any = activePO.value
  if (!po)
    return []
  const lines: any[] = po.items ?? []

  if (hasVerifiedOverReceiptApproval(activeReceiving.value))
    return lines

  return lines.filter(li => {
    const ordered = Number(li.quantity_ordered ?? 0)
    const received = Number(li.quantity_received ?? 0)
    return ordered - received > 0
  })
})

// ---------- add item ----------
const editingItem = ref<any | null>(null)
const selectedStockItemDetail = ref<any | null>(null)

function openAddItem() {
  returnToViewAfterItem.value = viewOpen.value
  viewOpen.value = false
  editingItem.value = null
  itemForm.value = {
    po_item_id: '',
    quantity_received: '',
    unit_cost: '',
    batch_number: '',
    expiry_date: '',
    quality_status: 'PASSED',
    notes: '',
  }
  addItemOpen.value = true
}

function openEditItem(item: any) {
  returnToViewAfterItem.value = viewOpen.value
  viewOpen.value = false
  editingItem.value = item
  itemForm.value = {
    po_item_id: String(item.po_item_id ?? ''),
    quantity_received: String(item.quantity_received ?? ''),
    unit_cost: String(item.unit_cost_uzs ?? item.unit_cost ?? ''),
    batch_number: item.batch_number ?? '',
    expiry_date: item.expiry_date ?? '',
    quality_status: item.quality_status ?? 'PASSED',
    notes: item.notes ?? '',
  }
  addItemOpen.value = true
}

function closeItemDialog() {
  addItemOpen.value = false
  if (returnToViewAfterItem.value && activeReceiving.value)
    viewOpen.value = true
  returnToViewAfterItem.value = false
}

// Auto-fill unit_cost from the selected PO line
watch(() => itemForm.value.po_item_id, id => {
  if (!id)
    return
  const line = pendingPOItems.value.find(l => String(l.id) === String(id))
  if (line && !itemForm.value.unit_cost) {
    const price = line.unit_price_uzs ?? line.unit_price ?? line.price
    if (price != null)
      itemForm.value.unit_cost = String(price)
  }
})

const selectedPOLine = computed(() => {
  const id = itemForm.value.po_item_id
  if (!id)
    return null
  return pendingPOItems.value.find(l => String(l.id) === String(id)) ?? null
})

const remainingQuantity = computed(() => {
  const l: any = selectedPOLine.value
  if (!l)
    return undefined

  const otherDraftQuantity = (activeReceiving.value?.items ?? [])
    .filter((item: any) => String(item.po_item_id) === String(l.id) && String(item.id) !== String(editingItem.value?.id))
    .reduce((sum: number, item: any) => sum + Number(item.quantity_received ?? 0), 0)

  // BE precomputes `quantity_pending` (ordered - received) on PurchaseOrderItemService.serialize.
  if (l.quantity_pending != null)
    return Math.max(0, Number(l.quantity_pending) - otherDraftQuantity)
  const ordered = Number(l.quantity_ordered ?? 0)
  const received = Number(l.quantity_received ?? 0)
  return Math.max(0, ordered - received - otherDraftQuantity)
})

const maxReceivable = computed(() => (
  hasVerifiedOverReceiptApproval(activeReceiving.value)
    ? undefined
    : remainingQuantity.value
))

watch(selectedPOLine, async line => {
  selectedStockItemDetail.value = null

  const itemId = line?.stock_item_id ?? line?.stock_item?.id
  if (!itemId)
    return
  try {
    const response = await stockApi.get(`/items/${itemId}/`)
    const data = response.data?.data ?? response.data
    const currentId = selectedPOLine.value?.stock_item_id ?? selectedPOLine.value?.stock_item?.id
    if (String(itemId) === String(currentId))
      selectedStockItemDetail.value = data?.item ?? data
  }
  catch { /* backend validation remains authoritative */ }
})

const selectedStockItem = computed(() => ({
  ...(selectedPOLine.value?.stock_item ?? selectedPOLine.value ?? {}),
  ...(selectedStockItemDetail.value ?? {}),
}))

const requiresBatch = computed(() => Boolean(
  selectedStockItem.value?.is_batch_tracked
  ?? selectedStockItem.value?.track_batches
  ?? selectedStockItem.value?.requires_batch,
))

const requiresExpiry = computed(() => Boolean(
  selectedStockItem.value?.is_expiry_tracked
  ?? selectedStockItem.value?.track_expiry
  ?? selectedStockItem.value?.requires_expiry,
))

const expiryDateServerBlocked = computed(() => {
  if (editingItem.value)
    return String(itemForm.value.expiry_date || '') !== String(editingItem.value.expiry_date || '')

  return requiresExpiry.value || Boolean(itemForm.value.expiry_date)
})

async function submitAddItem() {
  const rcv = activeReceiving.value
  if (!rcv)
    return
  if (!itemForm.value.po_item_id) {
    notify(t('Select PO Item'), 'error')
    return
  }
  const qty = Number(itemForm.value.quantity_received)
  if (!qty || qty <= 0) {
    notify(t('Quantity Received'), 'error')
    return
  }
  if (maxReceivable.value != null && qty > maxReceivable.value) {
    notify(t('Received quantity exceeds the remaining purchase-order quantity'), 'error')
    return
  }
  if (requiresBatch.value && !itemForm.value.batch_number.trim()) {
    notify(t('Batch number is required for this item'), 'error')
    return
  }
  if (requiresExpiry.value && !itemForm.value.expiry_date) {
    notify(t('Expiry date is required for this item'), 'error')
    return
  }
  if (expiryDateServerBlocked.value) {
    notify(t('receiving_expiry_server_blocked'), 'error')
    return
  }
  const quantityDiffers = remainingQuantity.value != null && qty !== remainingQuantity.value
  if ((itemForm.value.quality_status === 'FAILED' || quantityDiffers) && !itemForm.value.notes.trim()) {
    notify(t('Explain failed quality or a quantity difference'), 'error')
    return
  }
  saving.value = true
  try {
    const payload: any = {
      po_item_id: Number(itemForm.value.po_item_id),
      quantity_received: qty,
    }

    if (itemForm.value.unit_cost !== '')
      payload.unit_cost = Number(itemForm.value.unit_cost)
    if (itemForm.value.batch_number)
      payload.batch_number = itemForm.value.batch_number
    if (itemForm.value.expiry_date && !editingItem.value)
      payload.expiry_date = itemForm.value.expiry_date
    if (itemForm.value.quality_status)
      payload.quality_status = itemForm.value.quality_status
    if (itemForm.value.notes)
      payload.notes = itemForm.value.notes

    if (editingItem.value) {
      delete payload.po_item_id
      await stockApi.patch(`/receiving-items/${editingItem.value.id}/`, payload)
    }
    else {
      await stockApi.post(`/receiving/${rcv.id}/items/`, payload)
    }
    notify(t(editingItem.value ? 'Item updated' : 'Item added'))
    addItemOpen.value = false
    returnToViewAfterItem.value = false

    // refresh the drill view + the list (for items_count)
    await openView(rcv)
    await loadReceivings()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to add item'), 'error')
  }
  finally {
    saving.value = false
  }
}

// ---------- complete ----------
function askComplete(rcv: any) {
  activeReceiving.value = rcv
  returnToViewAfterComplete.value = viewOpen.value
  viewOpen.value = false
  confirmCompleteOpen.value = true
}

function closeCompleteDialog() {
  confirmCompleteOpen.value = false
  if (returnToViewAfterComplete.value && activeReceiving.value)
    viewOpen.value = true
  returnToViewAfterComplete.value = false
}

async function doComplete() {
  const rcv = activeReceiving.value
  if (!rcv)
    return
  if (actingOnId.value === rcv.id)
    return
  actingOnId.value = rcv.id
  try {
    const response = await stockApi.post(`/receiving/${rcv.id}/complete/`)
    const data = response.data?.data ?? response.data
    const before = Number(data?.supplier_balance_before_uzs)
    const after = Number(data?.supplier_balance_after_uzs)

    completionBalance.value = (Number.isFinite(before) && Number.isFinite(after))
      ? { receivingId: rcv.id, before, after }
      : null
    if (data?.receiving)
      activeReceiving.value = normalizeReceiving(data.receiving, rcv)
    notify(t('Receiving completed'))
    confirmCompleteOpen.value = false
    if (returnToViewAfterComplete.value)
      await openView(rcv)
    returnToViewAfterComplete.value = false
    await loadReceivings()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('Failed to complete receiving'), 'error')
  }
  finally {
    actingOnId.value = null
  }
}

// ---------- over-receipt approval ----------
function askApproveOverReceipt(receiving: any) {
  if (!mayApproveOverReceipt(receiving))
    return

  activeReceiving.value = receiving
  approvalReason.value = ''
  approvalError.value = ''
  returnToViewAfterApproval.value = viewOpen.value
  viewOpen.value = false
  approveOverOpen.value = true
}

function closeApproveOverDialog() {
  if (approvalSaving.value)
    return

  approveOverOpen.value = false
  if (returnToViewAfterApproval.value && activeReceiving.value)
    viewOpen.value = true
  returnToViewAfterApproval.value = false
}

function restoreViewAfterApproval() {
  approveOverOpen.value = false
  if (returnToViewAfterApproval.value)
    viewOpen.value = true
  returnToViewAfterApproval.value = false
}

async function refreshApprovedReceiving(receiving: any) {
  const response = await stockApi.get(`/receiving/${receiving.id}/items/`)
  const data = response.data?.data ?? response.data
  const detail = data?.receiving ?? data

  activeReceiving.value = normalizeReceiving(detail, receiving)
  restoreViewAfterApproval()

  const verified = hasVerifiedOverReceiptApproval(activeReceiving.value)

  notify(t(verified ? 'receiving_over_approval_confirmed' : 'receiving_over_approval_not_verifiable'), verified ? 'success' : 'warning')
  await loadReceivings()
}

async function approveOverReceipt() {
  const receiving = activeReceiving.value
  const reason = approvalReason.value.trim()
  if (!receiving || approvalSaving.value)
    return
  if (!mayApproveOverReceipt(receiving)) {
    approvalError.value = t('receiving_over_approval_unavailable')
    return
  }
  if (!reason) {
    approvalError.value = t('receiving_over_approval_reason_required')
    return
  }

  approvalSaving.value = true
  approvalError.value = ''
  try {
    await stockApi.post(`/receiving/${receiving.id}/approve-over-receipt/`, { reason })
    postedApprovalIds.value = new Set([...postedApprovalIds.value, String(receiving.id)])
  }
  catch (error: any) {
    approvalError.value = error?.response?.data?.message ?? translate(error)
    approvalSaving.value = false
    return
  }

  try {
    // The completion service trusts the persisted approval. Refresh and require
    // explicit server evidence before lifting any client-side quantity limit.
    await refreshApprovedReceiving(receiving)
  }
  catch {
    // Do not retry a non-idempotent approval merely because its verification
    // read failed. Keep overage blocked and make the uncertainty explicit.
    restoreViewAfterApproval()
    notify(t('receiving_over_approval_refresh_failed'), 'warning')
  }
  finally {
    approvalSaving.value = false
  }
}

// ---------- completed receiving correction request ----------
function askCorrection(receiving: any) {
  if (!mayRequestCorrection(receiving))
    return

  activeReceiving.value = receiving
  correctionReason.value = ''
  correctionError.value = ''
  returnToViewAfterCorrection.value = viewOpen.value
  viewOpen.value = false
  correctionOpen.value = true
}

function closeCorrectionDialog() {
  if (correctionSaving.value)
    return

  correctionOpen.value = false
  if (returnToViewAfterCorrection.value && activeReceiving.value)
    viewOpen.value = true
  returnToViewAfterCorrection.value = false
}

async function requestCorrection() {
  const receiving = activeReceiving.value
  const reason = correctionReason.value.trim()
  if (!receiving || correctionSaving.value)
    return
  if (!mayRequestCorrection(receiving)) {
    correctionError.value = t('receiving_correction_unavailable')
    return
  }
  if (!reason) {
    correctionError.value = t('receiving_correction_reason_required')
    return
  }

  correctionSaving.value = true
  correctionError.value = ''
  try {
    const response = await stockApi.post(`/receiving/${receiving.id}/corrections/`, { reason })
    const data = response.data?.data ?? response.data
    const correctionId = data?.correction_id
    const status = String(data?.status ?? 'PENDING')

    if (correctionId == null)
      throw new Error(t('receiving_correction_invalid_response'))

    correctionReceipt.value = {
      receivingId: receiving.id,
      correctionId,
      status,
    }
    correctionOpen.value = false
    if (returnToViewAfterCorrection.value)
      viewOpen.value = true
    returnToViewAfterCorrection.value = false
    notify(t('receiving_correction_requested'))

    try {
      await loadReceivings()
    }
    catch { /* the acknowledged correction remains valid */ }
  }
  catch (error: any) {
    correctionError.value = error?.response?.data?.message ?? error?.message ?? translate(error)
  }
  finally {
    correctionSaving.value = false
  }
}

// ---------- DataTable wiring ----------
const columns = computed<DataTableColumn<any>[]>(() => [
  { key: 'receiving_number', label: t('Receiving #') },
  { key: 'purchase_order_number', label: t('PO #') },
  { key: 'location_name', label: t('Location') },
  { key: 'received_date', label: t('Received Date') },
  { key: 'items_count', label: t('Receiving Items'), align: 'right' },
  { key: 'status', label: t('Status') },
])

const dtPagination = computed(() => ({
  page: page.value,
  perPage: itemsPerPage.value,
  total: total.value,
  onPage: (p: number) => { page.value = p },
  onPerPage: (n: number) => { itemsPerPage.value = n; page.value = 1 },
}))

function rcvNumber(r: any) {
  return r.receiving_number ?? r.number ?? `R-${r.id}`
}
function poNumber(r: any) {
  return r.purchase_order_number ?? r.purchase_order?.order_number ?? (r.purchase_order_id ? `PO-${r.purchase_order_id}` : '—')
}
function locName(r: any) {
  return r.location_name ?? r.location?.name ?? '—'
}
function itemsCount(r: any) {
  return r.items_count ?? r.items?.length ?? 0
}

const hasFilters = computed(() => !!(search.value || statusFilter.value || poFilter.value || dateFrom.value || dateTo.value))
function clearAll() {
  search.value = ''
  statusFilter.value = undefined
  poFilter.value = undefined
  dateFrom.value = ''
  dateTo.value = ''
}
</script>

<template>
  <div class="page">
    <PageHeader
      :title="t('Goods Receiving')"
      :subtitle="t('Record and verify goods received against purchase orders')"
    >
      <template #actions>
        <Button
          v-if="canCreateReceiving"
          variant="primary"
          icon="plus"
          :loading="lookupLoading"
          :disabled="lookupLoading"
          @click="openCreate"
        >
          {{ t('New Receiving') }}
        </Button>
      </template>
    </PageHeader>

    <div
      v-if="lookupError"
      class="inline-alert"
      role="alert"
    >
      <DesignIcon
        name="alert"
        :size="18"
      />
      <span><strong>{{ t('Failed to load') }}.</strong> {{ lookupError }}</span>
      <Button
        variant="ghost"
        size="sm"
        icon="retry"
        :loading="lookupLoading"
        @click="loadLookups"
      >
        {{ t('Retry') }}
      </Button>
    </div>

    <div class="card">
      <!-- Toolbar -->
      <div class="toolbar toolbar--wrap">
        <div class="grow tb-search">
          <Input
            v-model="search"
            icon="search"
            :placeholder="t('Search')"
            :aria-label="t('Search')"
          />
        </div>

        <div class="tb-status">
          <Select
            :model-value="statusFilter ?? ''"
            :placeholder="t('Filter by status')"
            :options="rcvStatuses.map(s => ({ value: s.value, label: t(`rcv_status_${s.value}`) }))"
            @update:model-value="(v: string) => statusFilter = v ? v : undefined"
          />
        </div>

        <div class="tb-po">
          <Select
            :model-value="poFilter ?? ''"
            :placeholder="t('Filter by PO')"
            :options="poOptions"
            @update:model-value="(v: string) => poFilter = v ? v : undefined"
          />
        </div>

        <div class="row tb-dates">
          <Input
            v-model="dateFrom"
            class="control--sm tb-date"
            type="date"
            :aria-label="t('Date From')"
          />
          <span
            class="tertiary"
            :aria-label="t('to')"
          >{{ t('range_arrow') }}</span>
          <Input
            v-model="dateTo"
            class="control--sm tb-date"
            type="date"
            :aria-label="t('Date To')"
          />
        </div>
      </div>

      <!-- Active filter chips -->
      <div
        v-if="hasFilters"
        class="toolbar"
        style="padding-top: 0;"
      >
        <div class="chips">
          <span
            v-if="search"
            class="chip"
          >
            <span>{{ t('Search') }}: <b>{{ search }}</b></span>
            <button
              type="button"
              class="chip__x"
              :aria-label="t('Clear filter')"
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
            <span>{{ t('Status') }}: <b>{{ t(`rcv_status_${statusFilter}`) }}</b></span>
            <button
              type="button"
              class="chip__x"
              :aria-label="t('Clear filter')"
              @click="statusFilter = undefined"
            >
              <DesignIcon
                name="close"
                :size="13"
              />
            </button>
          </span>
          <span
            v-if="poFilter"
            class="chip"
          >
            <span>{{ t('PO #') }}: <b>{{ poOptions.find(o => o.value === poFilter)?.label ?? poFilter }}</b></span>
            <button
              type="button"
              class="chip__x"
              :aria-label="t('Clear filter')"
              @click="poFilter = undefined"
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
              class="chip__x"
              :aria-label="t('Clear filter')"
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
              class="chip__x"
              :aria-label="t('Clear filter')"
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
            {{ t('Clear filters') }}
          </button>
        </div>
      </div>

      <div class="card__divider" />

      <!-- DataTable -->
      <StateFill
        v-if="loadError"
        icon="alert"
        :title="t('Failed to load receivings')"
        :sub="loadError"
        error
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="loadReceivings"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>

      <DataTable
        v-else
        :columns="columns"
        :rows="receivings"
        row-key="id"
        :loading="loading"
        :pagination="dtPagination"
        :per-page-options="[10, 25, 50, 100]"
      >
        <template #cell.receiving_number="{ row }">
          <span class="cell-strong mono">{{ rcvNumber(row) }}</span>
        </template>

        <template #cell.purchase_order_number="{ row }">
          <span class="mono cell-muted">{{ poNumber(row) }}</span>
        </template>

        <template #cell.location_name="{ row }">
          <span class="cell-muted">{{ locName(row) }}</span>
        </template>

        <template #cell.received_date="{ row }">
          <span class="mono cell-muted nowrap">{{ row.received_date ? formatDate(row.received_date) : '—' }}</span>
        </template>

        <template #cell.items_count="{ row }">
          <span class="mono cell-muted">{{ itemsCount(row) }}</span>
        </template>

        <template #cell.status="{ row }">
          <Badge
            :tone="tone(row.status) as any"
            dot
          >
            {{ row.status ? t(`rcv_status_${row.status}`) : '—' }}
          </Badge>
        </template>

        <template #row-actions="{ row }">
          <IconAction
            icon="eye"
            :title="t('View')"
            @click="openView(row)"
          />
          <IconAction
            v-if="mayEdit(row)"
            icon="plus"
            tone="primary"
            :title="t('Add Item')"
            @click="openViewAndAddItem(row)"
          />
          <IconAction
            v-if="mayComplete(row) && itemsCount(row) > 0"
            icon="check"
            tone="success"
            :title="t('Complete')"
            :disabled="actingOnId === row.id"
            @click="askComplete(row)"
          />
        </template>

        <template #empty>
          <StateFill
            icon="receipt"
            :title="t('No receivings')"
            :sub="t('Record and verify goods received against purchase orders')"
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

    <!-- ============== CREATE MODAL ============== -->
    <Modal
      :open="createOpen"
      :width="540"
      :title="t('Create Receiving')"
      :subtitle="t('Purchase Order')"
      @close="createOpen = false"
    >
      <div
        class="grid cols-1"
        style="gap: var(--sp-3);"
      >
        <Field :label="t('Purchase Order')">
          <Select
            v-model="createForm.purchase_order_id"
            :placeholder="t('Select Purchase Order')"
            :options="poOptions"
          />
        </Field>

        <Field :label="t('Location')">
          <Select
            v-model="createForm.location_id"
            :placeholder="t('Location')"
            :options="locationOptions"
          />
        </Field>

        <Field :label="t('Notes')">
          <Textarea
            v-model="createForm.notes"
            :rows="3"
            maxlength="500"
            :placeholder="t('Notes')"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="saving"
          :disabled="saving || !createForm.purchase_order_id"
          @click="createReceiving"
        >
          {{ t('Create Receiving') }}
        </Button>
      </template>
    </Modal>

    <!-- ============== VIEW / DRILL MODAL ============== -->
    <Modal
      :open="viewOpen"
      :width="900"
      :title="activeReceiving ? `${t('Receiving #')} ${rcvNumber(activeReceiving)}` : t('Receiving #')"
      :subtitle="activeReceiving ? `${t('PO #')} ${poNumber(activeReceiving)}` : ''"
      @close="closeView"
    >
      <div v-if="activeReceiving">
        <div
          v-if="completionBalance && activeReceiving.id === completionBalance.receivingId"
          class="balance-update"
          role="status"
        >
          <DesignIcon
            name="checkcircle"
            :size="18"
          />
          <span>{{ t('Supplier balance updated') }}</span>
          <strong class="mono">{{ formatCurrency(completionBalance.before) }} → {{ formatCurrency(completionBalance.after) }} UZS</strong>
        </div>
        <div
          v-if="correctionReceipt && activeReceiving.id === correctionReceipt.receivingId"
          class="correction-update"
          role="status"
        >
          <DesignIcon
            name="checkcircle"
            :size="18"
          />
          <span>{{ t('receiving_correction_pending_notice') }}</span>
          <strong class="mono">#{{ correctionReceipt.correctionId }} · {{ t(`receiving_correction_status_${correctionReceipt.status}`) }}</strong>
        </div>
        <!-- Meta strip -->
        <div
          class="grid cols-3 rcv-meta"
          style="gap: var(--sp-3); margin-bottom: var(--sp-4);"
        >
          <div>
            <div class="kpi__label">
              {{ t('Status') }}
            </div>
            <Badge
              :tone="tone(activeReceiving.status) as any"
              dot
            >
              {{ activeReceiving.status ? t(`rcv_status_${activeReceiving.status}`) : '—' }}
            </Badge>
          </div>
          <div>
            <div class="kpi__label">
              {{ t('Location') }}
            </div>
            <div class="cell-strong">
              {{ locName(activeReceiving) }}
            </div>
          </div>
          <div>
            <div class="kpi__label">
              {{ t('Received Date') }}
            </div>
            <div class="mono">
              {{ activeReceiving.received_date ? formatDate(activeReceiving.received_date) : '—' }}
            </div>
          </div>
          <div v-if="activeReceiving.received_by_name || activeReceiving.received_by?.name">
            <div class="kpi__label">
              {{ t('Received By') }}
            </div>
            <div>
              {{ activeReceiving.received_by_name ?? activeReceiving.received_by?.name }}
            </div>
          </div>
          <div v-if="activePO">
            <div class="kpi__label">
              {{ t('Purchase Order') }}
            </div>
            <Badge :tone="tone(activePO.status) as any">
              {{ activePO.status ? t(`po_status_${activePO.status}`) : '—' }}
            </Badge>
          </div>
          <div
            v-if="activeReceiving.notes"
            style="grid-column: span 3;"
          >
            <div class="kpi__label">
              {{ t('Notes') }}
            </div>
            <div class="cell-muted">
              {{ activeReceiving.notes }}
            </div>
          </div>
        </div>

        <!-- Items list -->
        <div
          class="row"
          style="justify-content: space-between; align-items: center; margin-bottom: 10px;"
        >
          <div class="kpi__label">
            {{ t('Receiving Items') }}
          </div>
          <Button
            v-if="mayEdit(activeReceiving)"
            variant="secondary"
            size="sm"
            icon="plus"
            @click="openAddItem"
          >
            {{ t('Add Item') }}
          </Button>
        </div>

        <div class="tablewrap">
          <table class="dtable rcv-items-table">
            <thead>
              <tr>
                <th>{{ t('Stock Item') }}</th>
                <th class="num">
                  {{ t('Quantity Received') }}
                </th>
                <th class="num">
                  {{ t('Unit Cost') }}
                </th>
                <th>{{ t('Batch Number') }}</th>
                <th>{{ t('Expiry Date') }}</th>
                <th>{{ t('Quality Status') }}</th>
                <th
                  v-if="mayEdit(activeReceiving)"
                  class="num"
                >
                  {{ t('Actions') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(li, i) in ((activeReceiving.items ?? []) as any[])"
                :key="i"
              >
                <td class="cell-strong">
                  {{ li.stock_item_name ?? li.stock_item?.name ?? li.po_item?.stock_item_name ?? '—' }}
                </td>
                <td class="num mono">
                  {{ li.quantity_received ?? '—' }}
                  <span
                    v-if="li.unit ?? li.unit_name"
                    class="cell-muted"
                  >{{ li.unit ?? li.unit_name }}</span>
                </td>
                <td class="num mono cell-muted">
                  {{ li.unit_cost != null ? formatCurrency(li.unit_cost) : '—' }}
                </td>
                <td class="mono cell-muted">
                  {{ li.batch_number || '—' }}
                </td>
                <td class="mono cell-muted nowrap">
                  {{ li.expiry_date ? formatDate(li.expiry_date) : '—' }}
                </td>
                <td>
                  <Badge :tone="tone(li.quality_status) as any">
                    {{ li.quality_status ? t(`quality_status_${li.quality_status}`) : '—' }}
                  </Badge>
                </td>
                <td
                  v-if="mayEdit(activeReceiving)"
                  class="num"
                >
                  <IconAction
                    icon="edit"
                    :title="t('Edit Item')"
                    @click="openEditItem(li)"
                  />
                </td>
              </tr>
              <tr v-if="!(activeReceiving.items?.length)">
                <td
                  :colspan="mayEdit(activeReceiving) ? 7 : 6"
                  class="center cell-muted"
                >
                  {{ t('No items') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <template #footer>
        <Button
          v-if="activeReceiving && mayApproveOverReceipt(activeReceiving)"
          variant="secondary"
          :disabled="approvalSaving"
          @click="askApproveOverReceipt(activeReceiving)"
        >
          {{ t('receiving_approve_over_action') }}
        </Button>
        <Button
          v-if="activeReceiving && mayRequestCorrection(activeReceiving)"
          variant="secondary"
          :disabled="correctionSaving"
          @click="askCorrection(activeReceiving)"
        >
          {{ t('receiving_request_correction_action') }}
        </Button>
        <Button
          v-if="activeReceiving && mayComplete(activeReceiving) && (activeReceiving.items?.length ?? 0) > 0"
          variant="primary"
          :loading="actingOnId === activeReceiving.id"
          :disabled="actingOnId === activeReceiving.id"
          @click="askComplete(activeReceiving)"
        >
          {{ t('Complete Receiving') }}
        </Button>
      </template>
    </Modal>

    <!-- ============== OVER-RECEIPT APPROVAL MODAL ============== -->
    <Modal
      :open="approveOverOpen"
      :width="500"
      :title="t('receiving_over_approval_title')"
      :subtitle="activeReceiving ? `${rcvNumber(activeReceiving)} · ${poNumber(activeReceiving)}` : ''"
      :close-on-backdrop="!approvalSaving"
      :close-on-esc="!approvalSaving"
      @close="closeApproveOverDialog"
    >
      <div
        class="grid cols-1"
        style="gap: var(--sp-3);"
      >
        <div
          class="inline-alert inline-alert--warning"
          role="note"
        >
          <DesignIcon
            name="info"
            :size="18"
          />
          <span>{{ t('receiving_over_approval_explanation') }}</span>
        </div>
        <Field
          :label="t('receiving_approval_reason')"
          :error="approvalError"
          :hint="t('receiving_over_approval_reason_hint')"
        >
          <Textarea
            v-model="approvalReason"
            autofocus
            :rows="3"
            maxlength="1000"
            :placeholder="t('receiving_over_approval_reason_placeholder')"
            @update:model-value="approvalError = ''"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="approvalSaving"
          :disabled="approvalSaving || !approvalReason.trim()"
          @click="approveOverReceipt"
        >
          {{ t('receiving_confirm_over_approval') }}
        </Button>
      </template>
    </Modal>

    <!-- ============== COMPLETED RECEIVING CORRECTION MODAL ============== -->
    <Modal
      :open="correctionOpen"
      :width="500"
      :title="t('receiving_correction_title')"
      :subtitle="activeReceiving ? `${rcvNumber(activeReceiving)} · ${poNumber(activeReceiving)}` : ''"
      :close-on-backdrop="!correctionSaving"
      :close-on-esc="!correctionSaving"
      @close="closeCorrectionDialog"
    >
      <div
        class="grid cols-1"
        style="gap: var(--sp-3);"
      >
        <div
          class="inline-alert inline-alert--warning"
          role="note"
        >
          <DesignIcon
            name="info"
            :size="18"
          />
          <span>{{ t('receiving_correction_explanation') }}</span>
        </div>
        <Field
          :label="t('receiving_correction_reason')"
          :error="correctionError"
          :hint="t('receiving_correction_reason_hint')"
        >
          <Textarea
            v-model="correctionReason"
            autofocus
            :rows="3"
            maxlength="1000"
            :placeholder="t('receiving_correction_reason_placeholder')"
            @update:model-value="correctionError = ''"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="correctionSaving"
          :disabled="correctionSaving || !correctionReason.trim()"
          @click="requestCorrection"
        >
          {{ t('receiving_submit_correction') }}
        </Button>
      </template>
    </Modal>

    <!-- ============== ADD ITEM MODAL ============== -->
    <Modal
      :open="addItemOpen"
      :width="560"
      :title="t(editingItem ? 'Edit Item' : 'Add Item')"
      :subtitle="t('PO Item')"
      @close="closeItemDialog"
    >
      <div
        class="grid cols-2 rcv-form"
        style="gap: var(--sp-3);"
      >
        <div
          v-if="expiryDateServerBlocked"
          class="inline-alert"
          style="grid-column: 1 / -1; margin-bottom: 0;"
          role="alert"
        >
          <DesignIcon
            name="alert"
            :size="18"
          />
          <span>{{ t('receiving_expiry_server_blocked') }}</span>
        </div>
        <Field
          :label="t('PO Item')"
          style="grid-column: span 2;"
        >
          <Select
            v-model="itemForm.po_item_id"
            :placeholder="t('Select PO Item')"
            :options="pendingPOItems.map(l => ({
              value: String(l.id),
              label: `${l.stock_item_name ?? l.stock_item?.name ?? `#${l.id}`} · ${t('Ordered')}: ${l.quantity_ordered ?? 0} / ${t('Received')}: ${l.quantity_received ?? 0}`,
            }))"
          />
        </Field>

        <Field
          :label="t('Quantity Received')"
          :hint="maxReceivable != null ? `${t('Pending Quantity')}: ${maxReceivable}` : undefined"
        >
          <Input
            v-model="itemForm.quantity_received"
            type="number"
            step="0.0001"
            :min="0.0001"
            :max="maxReceivable"
            :placeholder="t('Quantity Received')"
          />
        </Field>

        <Field :label="t('Unit Cost')">
          <MoneyInput
            :model-value="Number(itemForm.unit_cost) || 0"
            :placeholder="t('Unit Cost')"
            @update:model-value="value => itemForm.unit_cost = value ? String(value) : ''"
          />
        </Field>

        <Field :label="t('Batch Number')">
          <Input
            v-model="itemForm.batch_number"
            maxlength="100"
            :placeholder="t('Batch Number')"
          />
        </Field>

        <Field :label="t('Expiry Date')">
          <Input
            v-model="itemForm.expiry_date"
            type="date"
            :aria-label="t('Expiry Date')"
          />
        </Field>

        <Field
          :label="t('Quality Status')"
          style="grid-column: span 2;"
        >
          <Select
            v-model="itemForm.quality_status"
            :options="qualityStatuses.map(q => ({ value: q.value, label: t(`quality_status_${q.value}`) }))"
          />
        </Field>

        <Field
          :label="t('Notes')"
          style="grid-column: span 2;"
        >
          <Textarea
            v-model="itemForm.notes"
            :rows="2"
            maxlength="500"
            :placeholder="t('Notes')"
          />
        </Field>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="saving"
          :disabled="saving || !itemForm.po_item_id || !itemForm.quantity_received || expiryDateServerBlocked"
          @click="submitAddItem"
        >
          {{ t('Save') }}
        </Button>
      </template>
    </Modal>

    <!-- ============== CONFIRM COMPLETE MODAL ============== -->
    <Modal
      :open="confirmCompleteOpen"
      :width="440"
      :title="t('Complete Receiving')"
      :subtitle="t('Confirm complete receiving?')"
      @close="closeCompleteDialog"
    >
      <div
        v-if="activeReceiving"
        class="row rcv-confirm-row"
        style="gap: 14px; align-items: flex-start;"
      >
        <div
          class="kpi__icon t-success"
          style="width: 44px; height: 44px; flex: 0 0 44px;"
        >
          <DesignIcon
            name="check"
            :size="22"
          />
        </div>
        <div>
          <p style="margin: 0; font-weight: 600;">
            {{ rcvNumber(activeReceiving) }} · {{ poNumber(activeReceiving) }}
          </p>
          <p
            class="muted"
            style="margin: 6px 0 0; font-size: 14px;"
          >
            {{ t('Confirm complete receiving?') }}
          </p>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          :loading="actingOnId !== null"
          :disabled="actingOnId !== null"
          @click="doComplete"
        >
          {{ t('Complete') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.inline-alert {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: var(--sp-4);
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-error-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-error-strong));
  background: rgb(var(--v-theme-error-weak));
  font-size: 13px;
}
.inline-alert span { flex: 1; min-width: 0; }
.inline-alert--warning {
  border-color: rgb(var(--v-theme-warning-border));
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
}
.row {
  display: flex;
  align-items: center;
}

/* Toolbar wraps cleanly on narrow viewports */
.toolbar--wrap {
  flex-wrap: wrap;
  gap: 8px;
  row-gap: 10px;
}
.tb-search { max-width: 280px; }
.tb-status { width: 200px; }
.tb-po { width: 220px; }
.tb-dates { gap: 8px; margin-left: auto; }
.tb-date { width: 160px; }

/* Receiving items table — let .tablewrap handle horizontal scroll on phone */
.rcv-items-table {
  background: var(--surface);
  border-radius: 10px;
  border: 1px solid var(--border);
}

.balance-update {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: var(--sp-4);
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-success-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-success-strong));
  background: rgb(var(--v-theme-success-weak));
}

.correction-update {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: var(--sp-4);
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-warning-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
  font-size: 13px;
}

.correction-update span { flex: 1; min-width: 0; }

.balance-update strong {
  margin-left: auto;
  color: rgb(var(--v-theme-on-surface));
}

/* Tablet (<=1024px): collapse inline grids per canonical breakpoint */
@media (max-width: 1024px) {
  .rcv-meta {
    grid-template-columns: 1fr 1fr !important;
  }
  .rcv-form {
    grid-template-columns: 1fr !important;
  }
  .rcv-form > [style*="grid-column"] {
    grid-column: auto !important;
  }
}

/* Phone (<=768px): canonical breakpoint — collapse toolbar, single-col grids,
   modals → near full viewport, table scrolls horizontally via .tablewrap. */
@media (max-width: 768px) {
  .tb-search,
  .tb-status,
  .tb-po,
  .tb-dates,
  .tb-date {
    max-width: none;
    width: 100%;
  }
  .tb-dates {
    margin-left: 0;
    flex-wrap: wrap;
  }
  .tb-date { flex: 1 1 140px; }

  .rcv-meta {
    grid-template-columns: 1fr !important;
  }
  .rcv-meta > [style*="grid-column"] {
    grid-column: auto !important;
  }
  .rcv-form {
    grid-template-columns: 1fr !important;
  }
  .rcv-form > [style*="grid-column"] {
    grid-column: auto !important;
  }

  /* Confirm modal body row should wrap on tiny widths. */
  .rcv-confirm-row {
    flex-wrap: wrap;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.purchase.view
</route>
