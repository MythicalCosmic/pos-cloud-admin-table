<script setup lang="ts">
import Textarea from '@/components/design/Textarea.vue'
/* ============================================================
   Stock Adjustments — design primitive port
   Form-first: pick stock item + location + movement type + qty,
   optional unit + required reason, submit.
   Below: variance codes table with create / edit / seed defaults.
   All strings go through t(). Status / movement values render
   via t(`prefix_${VALUE}`).
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
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'
import { fmtDateTime } from '@/components/design/utils/format'
import { useUserAccess } from '@/composables/useUserAccess'
import {
  type StockLevelSnapshot,
  availableStockQuantity,
  fetchStockLevelSnapshot,
} from '@/utils/stockLevels'

const { t } = useI18n({ useScope: 'global' })
const { notify } = useNotify()
const { hasPermission } = useUserAccess()
const canAdjustStock = computed(() =>
  hasPermission('stock.adjustment.approve')
  && hasPermission('stock.catalog.view')
  && (hasPermission('stock.level.view') || hasPermission('stock.inventory_control.view')),
)
const canViewAdjustmentHistory = computed(() => hasPermission('stock.batch.view'))
const canViewVarianceCodes = computed(() => hasPermission('stock.count.view'))
const canManageVarianceCodes = computed(() => hasPermission('stock.manage'))
const canViewStockLevels = computed(() => hasPermission('stock.level.view'))

/* ---------------- lookups ---------------- */
interface StockItemLookupOption {
  value: string
  label: string
  baseUnit?: string
}

const stockItems = ref<StockItemLookupOption[]>([])
const locations = ref<{ value: string, label: string }[]>([])

async function loadLookup<T = any>(
  url: string,
  collectionKeys: string[],
  valueField: string,
  labelField: string,
): Promise<{ value: string, label: string }[]> {
  try {
    const res = await stockApi.get(url, { params: { per_page: 100 } })
    const d = res.data?.data ?? res.data
    let list: T[] = []
    for (const k of collectionKeys) {
      if (Array.isArray(d?.[k])) { list = d[k]; break }
    }
    if (!list.length && Array.isArray(d)) list = d as T[]
    return list.map((x: any) => ({
      value: String(x[valueField]),
      label: String(x[labelField] ?? x[valueField] ?? ''),
    }))
  }
  catch {
    return []
  }
}

async function loadStockItemLookup(): Promise<StockItemLookupOption[]> {
  try {
    const items: any[] = []
    let page = 1
    let totalPages = 1

    do {
      const res = await stockApi.get('/items/', { params: { page, per_page: 100 } })
      const data = res.data?.data ?? res.data ?? {}
      const rows = data?.items ?? data?.stock_items ?? []

      if (Array.isArray(rows))
        items.push(...rows)
      totalPages = Math.max(1, Number(data?.pagination?.total_pages ?? 1) || 1)
      page += 1
    } while (page <= totalPages)

    return [...new Map(items.map(item => [String(item.id), item])).values()].map(item => ({
      value: String(item.id),
      label: String(item.name ?? item.id ?? ''),
      baseUnit: String(item.base_unit_short ?? item.base_unit?.short_name ?? item.base_unit?.name ?? ''),
    }))
  }
  catch {
    return []
  }
}

async function loadLookups() {
  const [si, locs] = await Promise.all([
    loadStockItemLookup(),
    loadLookup('/locations/', ['locations'], 'id', 'name'),
  ])
  stockItems.value = si
  locations.value = locs
}

/* ---------------- adjustment form ---------------- */
const MOVEMENT_TYPES_ADJUSTABLE = [
  { value: 'ADJUSTMENT_PLUS', direction: 'in' },
  { value: 'ADJUSTMENT_MINUS', direction: 'out' },
  { value: 'WASTE', direction: 'out' },
  { value: 'SPOILAGE', direction: 'out' },
]

const MAX_ADJUSTMENT_QUANTITY = 99_999_999_999
const ADJUSTMENT_QUANTITY_PATTERN = /^\d+(?:\.\d{1,4})?$/
const allowedAdjustmentTypes = new Set(MOVEMENT_TYPES_ADJUSTABLE.map(type => type.value))
const outgoingAdjustmentTypes = new Set(['ADJUSTMENT_MINUS', 'WASTE', 'SPOILAGE'])

function normalizedAdjustmentQuantity(value: string): string | null {
  const normalized = value.trim()
  if (!ADJUSTMENT_QUANTITY_PATTERN.test(normalized))
    return null

  const quantity = Number(normalized)
  const isValid = Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_ADJUSTMENT_QUANTITY

  return isValid ? normalized : null
}

const movementOptions = computed(() =>
  MOVEMENT_TYPES_ADJUSTABLE.map(m => ({
    value: m.value,
    label: t(`movement_${m.value}`),
  })),
)

interface AdjustForm {
  stock_item_id: string
  location_id: string
  movement_type: string
  quantity: string
  unit_id: string
  reason: string
}

function emptyAdjust(): AdjustForm {
  return {
    stock_item_id: '',
    location_id: '',
    movement_type: 'ADJUSTMENT_PLUS',
    quantity: '',
    unit_id: '',
    reason: '',
  }
}

const adjust = ref<AdjustForm>(emptyAdjust())
const submitting = ref(false)
const adjustErrors = ref<Record<string, string>>({})
const selectedItemTracksBatches = ref(false)
const selectedItemDetail = ref<any>(null)
const itemTrackingLoading = ref(false)
const itemTrackingError = ref('')
const selectedLevel = ref<StockLevelSnapshot | null>(null)
const availabilityLoading = ref(false)
const availabilityError = ref('')
let itemTrackingRequestId = 0
let availabilityRequestId = 0

const isOutgoingAdjustment = computed(() => outgoingAdjustmentTypes.has(adjust.value.movement_type))
const selectedAvailableQuantity = computed(() => availableStockQuantity(selectedLevel.value))
const unitOptions = computed(() => {
  const selected = selectedItemDetail.value
  if (!selected)
    return []

  const options: { value: string, label: string }[] = []
  if (selected.base_unit_id) {
    options.push({
      value: String(selected.base_unit_id),
      label: `${selected.base_unit?.short_name ?? selected.base_unit?.name ?? selected.base_unit_id} · ${t('stock_adjust_base_unit')}`,
    })
  }
  for (const alternative of selected.alternative_units ?? []) {
    if (!alternative?.unit_id || String(alternative.unit_id) === String(selected.base_unit_id))
      continue
    options.push({
      value: String(alternative.unit_id),
      label: `${alternative.short_name ?? alternative.unit_name ?? alternative.unit_id} · ×${alternative.conversion_to_base}`,
    })
  }

  return options
})

async function fetchStockItemDetail(itemId: string | number): Promise<any> {
  const response = await stockApi.get(`/items/${itemId}/`)
  const data = response.data?.data ?? response.data ?? {}

  return data.item ?? data
}

watch(() => adjust.value.stock_item_id, async itemId => {
  const requestId = ++itemTrackingRequestId

  selectedItemTracksBatches.value = false
  selectedItemDetail.value = null
  adjust.value.unit_id = ''
  itemTrackingError.value = ''
  if (!itemId) {
    itemTrackingLoading.value = false
    return
  }
  itemTrackingLoading.value = true
  try {
    const item = await fetchStockItemDetail(itemId)
    if (requestId !== itemTrackingRequestId)
      return
    selectedItemDetail.value = item
    selectedItemTracksBatches.value = item?.track_batches === true
    adjust.value.unit_id = item?.base_unit_id ? String(item.base_unit_id) : ''
  }
  catch {
    if (requestId === itemTrackingRequestId)
      itemTrackingError.value = t('stock_adjust_item_verification_failed')
  }
  finally {
    if (requestId === itemTrackingRequestId)
      itemTrackingLoading.value = false
  }
})

async function loadAvailableStock() {
  const requestId = ++availabilityRequestId

  selectedLevel.value = null
  availabilityError.value = ''
  if (!isOutgoingAdjustment.value || !adjust.value.stock_item_id || !adjust.value.location_id) {
    availabilityLoading.value = false
    return
  }
  if (!canViewStockLevels.value) {
    availabilityLoading.value = false
    availabilityError.value = t('stock_adjust_level_view_required')
    return
  }

  availabilityLoading.value = true
  try {
    const level = await fetchStockLevelSnapshot(stockApi, adjust.value.stock_item_id, adjust.value.location_id)
    if (requestId === availabilityRequestId)
      selectedLevel.value = level
  }
  catch {
    if (requestId === availabilityRequestId)
      availabilityError.value = t('stock_adjust_availability_check_failed')
  }
  finally {
    if (requestId === availabilityRequestId)
      availabilityLoading.value = false
  }
}

watch(
  [() => adjust.value.stock_item_id, () => adjust.value.location_id, () => adjust.value.movement_type],
  loadAvailableStock,
)

watch(isOutgoingAdjustment, outgoing => {
  if (outgoing)
    adjust.value.unit_id = selectedItemDetail.value?.base_unit_id
      ? String(selectedItemDetail.value.base_unit_id)
      : ''
})

function validateAdjust(): boolean {
  const e: Record<string, string> = {}
  if (!canAdjustStock.value) {
    notify(t('err_no_permission'), 'error')
    return false
  }
  if (!adjust.value.stock_item_id) e.stock_item_id = t('required_field')
  else if (itemTrackingLoading.value) e.stock_item_id = t('stock_adjust_item_verification_pending')
  else if (itemTrackingError.value) e.stock_item_id = itemTrackingError.value
  else if (selectedItemTracksBatches.value) e.stock_item_id = t('stock_adjust_batch_tracked_blocked')
  if (!adjust.value.location_id) e.location_id = t('required_field')
  if (!allowedAdjustmentTypes.has(adjust.value.movement_type)) e.movement_type = t('required_field')
  if (!normalizedAdjustmentQuantity(adjust.value.quantity))
    e.quantity = t('stock_adjust_quantity_invalid')
  else if (isOutgoingAdjustment.value) {
    if (availabilityLoading.value) e.quantity = t('stock_adjust_availability_check_pending')
    else if (availabilityError.value) e.quantity = availabilityError.value
    else if (Number(adjust.value.quantity) > selectedAvailableQuantity.value)
      e.quantity = t('stock_adjust_exceeds_available', { quantity: fmtQty(selectedAvailableQuantity.value) })
  }
  if (!adjust.value.reason.trim())
    e.reason = t('required_field')
  adjustErrors.value = e
  return Object.keys(e).length === 0
}

async function submitAdjustment() {
  if (submitting.value) return
  if (!validateAdjust()) return

  const quantity = normalizedAdjustmentQuantity(adjust.value.quantity)
  if (!quantity)
    return
  const command = {
    stockItemId: adjust.value.stock_item_id,
    locationId: adjust.value.location_id,
    movementType: adjust.value.movement_type,
    quantity,
    unitId: adjust.value.unit_id,
    reason: adjust.value.reason.trim(),
  }
  submitting.value = true
  try {
    let latestItem: any
    try {
      latestItem = await fetchStockItemDetail(command.stockItemId)
    }
    catch {
      throw new Error(t('stock_adjust_item_verification_failed'))
    }
    if (latestItem?.track_batches === true)
      throw new Error(t('stock_adjust_batch_tracked_blocked'))

    if (outgoingAdjustmentTypes.has(command.movementType)) {
      if (!canViewStockLevels.value)
        throw new Error(t('stock_adjust_level_view_required'))
      let latestLevel: StockLevelSnapshot
      try {
        latestLevel = await fetchStockLevelSnapshot(
          stockApi,
          command.stockItemId,
          command.locationId,
        )
      }
      catch {
        throw new Error(t('stock_adjust_availability_check_failed'))
      }
      const latestAvailable = availableStockQuantity(latestLevel)
      if (Number(command.quantity) > latestAvailable)
        throw new Error(t('stock_adjust_exceeds_available', { quantity: fmtQty(latestAvailable) }))
    }

    const payload: Record<string, number | string> = {
      stock_item_id: Number(command.stockItemId),
      location_id: Number(command.locationId),
      movement_type: command.movementType,
      quantity: command.quantity,
      reason: command.reason,
    }

    if (command.unitId
      && String(command.unitId) !== String(latestItem?.base_unit_id ?? '')) {
      payload.unit_id = Number(command.unitId)
    }

    await stockApi.post('/adjust/', payload)
    notify(t('adjustment_success'))
    adjust.value = emptyAdjust()
    await loadHistory()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? e?.message ?? t('adjustment_failed'), 'error')
  }
  finally {
    submitting.value = false
  }
}

/* ---------------- past adjustments history ---------------- */
const history = ref<any[]>([])
const allHistory = ref<any[]>([])
const historyTotal = ref(0)
const historyLoading = ref(false)
const historyLoadError = ref(false)
const historyTruncated = ref(false)
const historyPage = ref(1)
const historyPerPage = ref(10)
let historyRequestId = 0
const reverseOpen = ref(false)
const reversing = ref(false)
const reverseTarget = ref<any>(null)
const reverseReason = ref('')
const reverseError = ref('')
const locallyReversedIds = ref<Set<string>>(new Set())

const MOVEMENT_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'> = {
  ADJUSTMENT_PLUS: 'success',
  ADJUSTMENT_MINUS: 'error',
  WASTE: 'error',
  SPOILAGE: 'error',
}

async function loadHistory() {
  const requestId = ++historyRequestId
  if (!canViewAdjustmentHistory.value) {
    allHistory.value = []
    history.value = []
    historyTotal.value = 0
    historyTruncated.value = false
    historyLoadError.value = false
    return
  }

  historyLoading.value = true
  historyLoadError.value = false
  try {
    const loadMovementHistory = async (movementType: string) => {
      const res = await stockApi.get('/transactions/', {
        params: { page: 1, per_page: 100, type: movementType },
      })
      const data = res.data?.data ?? res.data ?? {}
      const rows = data?.transactions ?? data?.items ?? []
      const total = Number(data?.pagination?.total ?? rows.length) || rows.length

      return { rows, total }
    }

    const pages = await Promise.all(MOVEMENT_TYPES_ADJUSTABLE.map(type => loadMovementHistory(type.value)))
    if (requestId !== historyRequestId)
      return
    const unique = new Map<string, any>()

    for (const row of pages.flatMap(result => result.rows))
      unique.set(String(row.id ?? row.uuid ?? `${row.created_at}:${row.transaction_number}`), row)

    historyTruncated.value = pages.some(result => result.total > result.rows.length)
    allHistory.value = [...unique.values()].sort((a, b) =>
      new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    )
    historyTotal.value = allHistory.value.length
    historyLoadError.value = false
    applyHistoryPage()
  }
  catch {
    if (requestId === historyRequestId) {
      allHistory.value = []
      history.value = []
      historyTotal.value = 0
      historyTruncated.value = false
      historyLoadError.value = true
    }
  }
  finally {
    if (requestId === historyRequestId)
      historyLoading.value = false
  }
}

function applyHistoryPage() {
  const totalPages = Math.max(1, Math.ceil(allHistory.value.length / historyPerPage.value))
  if (historyPage.value > totalPages)
    historyPage.value = totalPages
  const start = (historyPage.value - 1) * historyPerPage.value

  history.value = allHistory.value.slice(start, start + historyPerPage.value)
}

const reversedOriginalIds = computed(() => {
  const ids = new Set(locallyReversedIds.value)

  for (const row of allHistory.value) {
    if (row.reference_type === 'StockAdjustmentReversal' && row.reference_id !== null && row.reference_id !== undefined)
      ids.add(String(row.reference_id))
  }

  return ids
})

function isReversal(row: any): boolean {
  return row?.reference_type === 'StockAdjustmentReversal'
}

function isDirectAdjustment(row: any): boolean {
  return row?.reference_type === 'StockAdjustment' || row?.reference_type === 'StockWaste'
}

function isReversed(row: any): boolean {
  return reversedOriginalIds.value.has(String(row?.id))
}

function stockItemBaseUnit(row: any): string {
  return stockItems.value.find(item => item.value === String(row?.stock_item_id))?.baseUnit ?? ''
}

function transactionUnit(row: any): string {
  const unit = row?.unit_short ?? row?.unit?.short_name ?? row?.unit?.name ?? row?.unit

  return unit ? String(unit) : stockItemBaseUnit(row)
}

function hasAlternativeUnitEvidence(row: any): boolean {
  const quantity = Number(row?.quantity)
  const baseQuantity = Number(row?.base_quantity)
  if (!Number.isFinite(quantity) || !Number.isFinite(baseQuantity))
    return true
  if (Math.abs(quantity - baseQuantity) > 0.0000001)
    return true

  const unit = transactionUnit(row).trim().toLocaleLowerCase()
  const baseUnit = stockItemBaseUnit(row).trim().toLocaleLowerCase()

  if (!unit || !baseUnit)
    return true

  return unit !== baseUnit
}

function showsBaseQuantity(row: any): boolean {
  return row?.base_quantity !== null
    && row?.base_quantity !== undefined
    && hasAlternativeUnitEvidence(row)
}

function canReverse(row: any): boolean {
  return canAdjustStock.value
    && Boolean(row?.id)
    && isDirectAdjustment(row)
    && !row.batch_id
    && row.movement_type !== 'ADJUSTMENT_PLUS'
    && !hasAlternativeUnitEvidence(row)
    && !isReversed(row)
}

function reverseNeedsBackendGuard(row: any): boolean {
  return canAdjustStock.value
    && isDirectAdjustment(row)
    && (
      Boolean(row.batch_id)
      || row.movement_type === 'ADJUSTMENT_PLUS'
      || hasAlternativeUnitEvidence(row)
    )
    && !isReversed(row)
}

function openReverse(row: any) {
  if (!canReverse(row))
    return
  reverseTarget.value = row
  reverseReason.value = ''
  reverseError.value = ''
  reverseOpen.value = true
}

function closeReverse() {
  if (reversing.value)
    return
  reverseOpen.value = false
  reverseTarget.value = null
  reverseReason.value = ''
  reverseError.value = ''
}

async function reverseAdjustment() {
  if (!reverseTarget.value?.id || reversing.value)
    return
  const reason = reverseReason.value.trim()
  if (!reason) {
    reverseError.value = t('required_field')
    return
  }

  reversing.value = true
  reverseError.value = ''
  try {
    const originalId = String(reverseTarget.value.id)

    await stockApi.post(`/adjust/${reverseTarget.value.id}/reverse/`, { reason })
    locallyReversedIds.value = new Set([...locallyReversedIds.value, originalId])
    notify(t('stock_adjust_reverse_success'))
    reverseOpen.value = false
    reverseTarget.value = null
    reverseReason.value = ''
    await loadHistory()
  }
  catch (error: any) {
    const code = error?.response?.data?.code
    if (code === 'STOCK_ADJUSTMENT_ALREADY_REVERSED') {
      locallyReversedIds.value = new Set([
        ...locallyReversedIds.value,
        String(reverseTarget.value.id),
      ])
      reverseOpen.value = false
      notify(t('stock_adjust_already_reversed'), 'error')
      await loadHistory()
    }
    else {
      notify(error?.response?.data?.message ?? t('stock_adjust_reverse_failed'), 'error')
    }
  }
  finally {
    reversing.value = false
  }
}

const historyColumns = computed<DataTableColumn<any>[]>(() => [
  { key: 'created_at', label: t('date_time_col'), sortable: false },
  { key: 'movement_type', label: t('movement_type') },
  { key: 'item', label: t('stock_item') },
  { key: 'location', label: t('location') },
  { key: 'batch_id', label: t('batch') },
  { key: 'quantity', label: t('quantity'), align: 'right' },
  { key: 'notes', label: t('notes') },
  ...(canAdjustStock.value
    ? [{ key: 'actions', label: t('actions'), align: 'right' as const, sortable: false }]
    : []),
])

const historyPagination = computed(() => ({
  page: historyPage.value,
  perPage: historyPerPage.value,
  total: historyTotal.value,
  onPage: (p: number) => { historyPage.value = p },
  onPerPage: (n: number) => { historyPerPage.value = n; historyPage.value = 1 },
}))

function fmtDate(iso: string | undefined) {
  if (!iso) return '—'
  return fmtDateTime(iso)
}

function fmtQty(v: any) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  if (Number.isNaN(n)) return String(v)
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '')
}

/* ---------------- variance codes ---------------- */
const codes = ref<any[]>([])
const codesLoading = ref(false)
const codesActive = ref<string>('true')
const codesSearch = ref('')
const seeding = ref(false)

const codeModal = ref(false)
const codeMode = ref<'create' | 'edit'>('create')
const codeSaving = ref(false)
const codeSelected = ref<any>(null)
const codeForm = ref({
  code: '',
  name: '',
  description: '',
  requires_approval: false,
  is_active: true,
})
const codeErrors = ref<Record<string, string>>({})

const confirmSeed = ref(false)

async function loadCodes() {
  if (!canViewVarianceCodes.value) {
    codes.value = []
    return
  }

  codesLoading.value = true
  try {
    // The backend interprets `active=false` as all codes. Request that full
    // set for both All and Inactive, then apply inactive-only locally.
    const params = { active: codesActive.value === 'true' }
    const res = await stockApi.get('/variance-codes/', { params })
    const d = res.data?.data ?? res.data
    codes.value = d?.codes ?? d?.variance_codes ?? []
  }
  catch {
    codes.value = []
  }
  finally {
    codesLoading.value = false
  }
}

const filteredCodes = computed(() => {
  const q = codesSearch.value.trim().toLowerCase()
  const byStatus = codesActive.value === 'false'
    ? codes.value.filter((code: any) => code.is_active === false)
    : codes.value

  if (!q) return byStatus
  return byStatus.filter((c: any) =>
    [c.code, c.name, c.description]
      .filter(Boolean)
      .some((s: string) => String(s).toLowerCase().includes(q)),
  )
})

function openCodeCreate() {
  if (!canManageVarianceCodes.value) {
    notify(t('err_no_permission'), 'error')
    return
  }

  codeMode.value = 'create'
  codeSelected.value = null
  codeForm.value = {
    code: '',
    name: '',
    description: '',
    requires_approval: false,
    is_active: true,
  }
  codeErrors.value = {}
  codeModal.value = true
}

function openCodeEdit(item: any) {
  if (!canManageVarianceCodes.value) {
    notify(t('err_no_permission'), 'error')
    return
  }

  codeMode.value = 'edit'
  codeSelected.value = item
  codeForm.value = {
    code: item.code ?? '',
    name: item.name ?? '',
    description: item.description ?? '',
    requires_approval: !!item.requires_approval,
    is_active: !!item.is_active,
  }
  codeErrors.value = {}
  codeModal.value = true
}

function validateCode(): boolean {
  const e: Record<string, string> = {}
  if (codeMode.value === 'create' && !codeForm.value.code.trim()) e.code = t('required_field')
  if (!codeForm.value.name.trim()) e.name = t('required_field')
  codeErrors.value = e
  return Object.keys(e).length === 0
}

async function saveCode() {
  if (!canManageVarianceCodes.value) {
    notify(t('err_no_permission'), 'error')
    return
  }
  if (codeSaving.value) return
  if (!validateCode()) return
  codeSaving.value = true
  try {
    if (codeMode.value === 'create') {
      await stockApi.post('/variance-codes/', {
        code: codeForm.value.code.trim().toUpperCase().slice(0, 20),
        name: codeForm.value.name.trim().slice(0, 100),
        description: codeForm.value.description,
        requires_approval: codeForm.value.requires_approval,
      })
      notify(t('variance_code_created'))
    }
    else {
      await stockApi.put(`/variance-codes/${codeSelected.value.id}/`, {
        name: codeForm.value.name.trim().slice(0, 100),
        description: codeForm.value.description,
        requires_approval: codeForm.value.requires_approval,
        is_active: codeForm.value.is_active,
      })
      notify(t('variance_code_updated'))
    }
    codeModal.value = false
    await loadCodes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('adjustment_failed'), 'error')
  }
  finally {
    codeSaving.value = false
  }
}

async function seedDefaults() {
  if (!canManageVarianceCodes.value) {
    notify(t('err_no_permission'), 'error')
    return
  }
  if (seeding.value) return
  seeding.value = true
  confirmSeed.value = false
  try {
    await stockApi.post('/variance-codes/seed/')
    notify(t('seed_success'))
    await loadCodes()
  }
  catch (e: any) {
    notify(e?.response?.data?.message ?? t('adjustment_failed'), 'error')
  }
  finally {
    seeding.value = false
  }
}

const codeColumns = computed<DataTableColumn<any>[]>(() => [
  { key: 'code', label: t('code'), sortable: false },
  { key: 'name', label: t('name'), sortable: false },
  { key: 'description', label: t('description'), sortable: false },
  { key: 'requires_approval', label: t('requires_approval'), sortable: false },
  { key: 'is_active', label: t('status'), sortable: false },
  { key: 'actions', label: t('actions'), sortable: false, align: 'right' },
])

watch(codesActive, () => loadCodes())

onMounted(() => {
  if (canAdjustStock.value)
    loadLookups()
  if (canViewAdjustmentHistory.value)
    loadHistory()
  if (canViewVarianceCodes.value)
    loadCodes()
})

watch([historyPage, historyPerPage], applyHistoryPage)
</script>

<template>
  <div class="page">
    <!-- Page header -->
    <PageHeader
      :title="t('stock_adjust_title')"
      :subtitle="t('stock_adjust_subtitle')"
    />

    <!-- ============ ADJUSTMENT FORM CARD ============ -->
    <div v-if="canAdjustStock" class="card" style="margin-bottom: var(--sp-5);">
      <div class="toolbar wrap" style="border-bottom: 1px solid var(--border);">
        <div>
          <div class="kpi__label" style="font-weight: var(--fw-semibold); color: var(--text);">
            {{ t('new_adjustment') }}
          </div>
        </div>
      </div>

      <form
        class="adjust-form"
        novalidate
        @submit.prevent="submitAdjustment"
      >
        <!-- Stock item -->
        <div style="grid-column: span 6;">
          <Field :label="t('stock_item')" :error="adjustErrors.stock_item_id">
            <Select
              v-model="adjust.stock_item_id"
              :options="stockItems"
              :placeholder="t('select_stock_item')"
              :error="!!adjustErrors.stock_item_id"
              :disabled="submitting"
            />
          </Field>
        </div>

        <div
          v-if="selectedItemTracksBatches || itemTrackingError"
          class="inline-alert"
          style="grid-column: span 12;"
        >
          <DesignIcon name="alert" :size="16" />
          <span>{{ itemTrackingError || t('stock_adjust_batch_tracked_blocked') }}</span>
        </div>

        <!-- Location -->
        <div style="grid-column: span 6;">
          <Field :label="t('location')" :error="adjustErrors.location_id">
            <Select
              v-model="adjust.location_id"
              :options="locations"
              :placeholder="t('select_location')"
              :error="!!adjustErrors.location_id"
              :disabled="submitting"
            />
          </Field>
        </div>

        <!-- Movement type -->
        <div style="grid-column: span 6;">
          <Field :label="t('movement_type')" :error="adjustErrors.movement_type">
            <Select
              v-model="adjust.movement_type"
              :options="movementOptions"
              :placeholder="t('select_movement_type')"
              :error="!!adjustErrors.movement_type"
              :disabled="submitting"
            />
          </Field>
        </div>

        <!-- Quantity + Unit -->
        <div style="grid-column: span 3;">
          <Field
            :label="t('quantity')"
            :error="adjustErrors.quantity || (isOutgoingAdjustment ? availabilityError : '')"
          >
            <Input
              v-model="adjust.quantity"
              type="number"
              step="0.0001"
              min="0.0001"
              :max="MAX_ADJUSTMENT_QUANTITY"
              placeholder="0"
              :error="!!adjustErrors.quantity || (isOutgoingAdjustment && !!availabilityError)"
              :disabled="submitting"
            />
            <div
              v-if="isOutgoingAdjustment && adjust.stock_item_id && adjust.location_id && !availabilityLoading && !availabilityError"
              class="cell-muted stock-available-hint"
            >
              {{ t('stock_adjust_available_hint', { quantity: fmtQty(selectedAvailableQuantity) }) }}
            </div>
          </Field>
        </div>
        <div style="grid-column: span 3;">
          <Field :label="t('unit')">
            <Select
              v-model="adjust.unit_id"
              :options="unitOptions"
              :placeholder="isOutgoingAdjustment ? t('stock_adjust_base_unit') : t('unit')"
              :disabled="submitting || isOutgoingAdjustment"
            />
          </Field>
        </div>

        <!-- Reason (full width) -->
        <div style="grid-column: span 12;">
          <Field :label="t('Reason')" :error="adjustErrors.reason">
            <Textarea
              v-model="adjust.reason"
              rows="3"
              :placeholder="t('Reason')"
              maxlength="1000"
              :disabled="submitting"
              :aria-invalid="adjustErrors.reason ? 'true' : undefined"
              style="resize: vertical;"
            />
          </Field>
        </div>

        <!-- Submit -->
        <div class="adjust-form__submit" style="grid-column: span 12;">
          <Button
            type="button"
            variant="ghost"
            :disabled="submitting"
            @click="adjust = emptyAdjust(); adjustErrors = {}"
          >
            {{ t('Reset') }}
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon="check"
            :loading="submitting"
            :disabled="submitting || itemTrackingLoading || availabilityLoading || !!itemTrackingError || selectedItemTracksBatches"
          >
            {{ t('submit_adjustment') }}
          </Button>
        </div>
      </form>
    </div>
    <StateFill
      v-else
      class="card"
      style="margin-bottom: var(--sp-5);"
      icon="lock"
      :title="t('err_no_permission')"
    />

    <!-- ============ HISTORY CARD ============ -->
    <div class="card" style="margin-bottom: var(--sp-5);">
      <div class="toolbar wrap">
        <div>
          <div class="kpi__label" style="color: var(--text); font-weight: var(--fw-semibold);">
            {{ t('recent_adjustments') }}
          </div>
          <div v-if="historyTruncated" class="page__subtitle" style="margin-top: 2px;">
            {{ t('stock_adjust_history_recent_limit') }}
          </div>
        </div>
      </div>
      <div class="card__divider" />

      <StateFill
        v-if="!canViewAdjustmentHistory"
        icon="lock"
        :title="t('err_no_permission')"
      />
      <StateFill
        v-else-if="historyLoadError && !historyLoading"
        icon="alert"
        :title="t('Failed to load transactions')"
        error
      >
        <Button variant="secondary" icon="refresh" @click="loadHistory">
          {{ t('Retry') }}
        </Button>
      </StateFill>
      <DataTable
        v-else
        :columns="historyColumns"
        :rows="history"
        row-key="id"
        :loading="historyLoading"
        :pagination="historyPagination"
        :per-page-options="[10, 25, 50]"
      >
        <template #cell.created_at="{ row }">
          <span class="mono cell-muted nowrap">{{ fmtDate(row.created_at) }}</span>
        </template>

        <template #cell.movement_type="{ row }">
          <Badge :tone="(MOVEMENT_TONE[row.movement_type] ?? 'neutral') as any" dot>
            {{ row.movement_type ? t(`movement_${row.movement_type}`) : '—' }}
          </Badge>
        </template>

        <template #cell.item="{ row }">
          <span class="cell-strong">{{ row.stock_item_name ?? '—' }}</span>
        </template>

        <template #cell.location="{ row }">
          <span class="cell-muted">{{ row.location_name ?? '—' }}</span>
        </template>

        <template #cell.batch_id="{ row }">
          <span class="mono cell-muted">{{ row.batch_id ? `#${row.batch_id}` : '—' }}</span>
        </template>

        <template #cell.quantity="{ row }">
          <div class="history-quantity mono">
            <span class="cell-strong">
              {{ fmtQty(row.quantity) }}<span v-if="transactionUnit(row)">&nbsp;{{ transactionUnit(row) }}</span>
            </span>
            <span v-if="showsBaseQuantity(row)" class="cell-muted">
              &asymp;&nbsp;{{ fmtQty(row.base_quantity) }}&nbsp;{{ stockItemBaseUnit(row) || t('stock_adjust_base_unit') }}
            </span>
          </div>
        </template>

        <template #cell.notes="{ row }">
          <span class="cell-muted">{{ row.notes || '—' }}</span>
        </template>

        <template #cell.actions="{ row }">
          <div class="row history-action">
            <Badge v-if="isReversal(row)" tone="info">
              {{ t('stock_adjust_reversal') }}
            </Badge>
            <Badge v-else-if="isReversed(row)" tone="neutral">
              {{ t('stock_adjust_reversed') }}
            </Badge>
            <IconAction
              v-else-if="canReverse(row)"
              icon="refresh"
              tone="warning"
              :title="t('stock_adjust_reverse')"
              @click.stop="openReverse(row)"
            />
            <IconAction
              v-else-if="reverseNeedsBackendGuard(row)"
              icon="lock"
              :title="t('stock_adjust_reverse_backend_guard_required')"
              disabled
            />
          </div>
        </template>

        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('no_data')"
          />
        </template>
      </DataTable>
    </div>

    <!-- ============ VARIANCE CODES CARD ============ -->
    <div class="card">
      <div class="toolbar wrap">
        <div style="flex: 1 1 220px; min-width: 0;">
          <div class="kpi__label" style="color: var(--text); font-weight: var(--fw-semibold);">
            {{ t('variance_codes_title') }}
          </div>
          <div class="page__subtitle" style="margin-top: 2px;">
            {{ t('variance_codes_subtitle') }}
          </div>
        </div>

        <div v-if="canViewVarianceCodes" class="tool-search">
          <Input
            v-model="codesSearch"
            icon="search"
            :placeholder="t('search_placeholder')"
          />
        </div>

        <div v-if="canViewVarianceCodes" class="tool-select">
          <Select
            v-model="codesActive"
            :options="[
              { value: '', label: t('filter_all') },
              { value: 'true', label: t('filter_active_only') },
              { value: 'false', label: t('inactive_status') },
            ]"
            :placeholder="t('status')"
          />
        </div>

        <Button
          v-if="canManageVarianceCodes"
          variant="secondary"
          icon="download"
          :loading="seeding"
          @click="confirmSeed = true"
        >
          {{ t('seed_defaults') }}
        </Button>
        <Button
          v-if="canManageVarianceCodes"
          variant="primary"
          icon="plus"
          @click="openCodeCreate"
        >
          {{ t('new_variance_code') }}
        </Button>
      </div>

      <div class="card__divider" />

      <StateFill
        v-if="!canViewVarianceCodes"
        icon="lock"
        :title="t('err_no_permission')"
      />
      <DataTable
        v-else
        :columns="codeColumns"
        :rows="filteredCodes"
        row-key="id"
        :loading="codesLoading"
      >
        <template #cell.code="{ row }">
          <span class="mono cell-strong">{{ row.code }}</span>
        </template>

        <template #cell.name="{ row }">
          <span class="cell-strong">{{ row.name }}</span>
        </template>

        <template #cell.description="{ row }">
          <span class="cell-muted">{{ row.description || '—' }}</span>
        </template>

        <template #cell.requires_approval="{ row }">
          <Badge :tone="row.requires_approval ? 'warning' : 'neutral'">
            {{ row.requires_approval ? t('yes') : t('no') }}
          </Badge>
        </template>

        <template #cell.is_active="{ row }">
          <Badge :tone="row.is_active ? 'success' : 'neutral'" dot>
            {{ t(row.is_active ? 'status_active' : 'status_inactive') }}
          </Badge>
        </template>

        <template #cell.actions="{ row }">
          <div class="row" style="gap: 4px; justify-content: flex-end;">
            <IconAction
              v-if="canManageVarianceCodes"
              icon="edit"
              :title="t('edit')"
              @click.stop="openCodeEdit(row)"
            />
          </div>
        </template>

        <template #empty>
          <StateFill
            icon="inbox"
            :title="t('no_data')"
          />
        </template>
      </DataTable>
    </div>

    <!-- ============ REVERSE ADJUSTMENT MODAL ============ -->
    <Modal
      v-if="canAdjustStock"
      :open="reverseOpen"
      :width="500"
      :title="t('stock_adjust_reverse_title')"
      :subtitle="reverseTarget ? `${reverseTarget.transaction_number || `#${reverseTarget.id}`} · ${reverseTarget.stock_item_name || ''}` : ''"
      :close-on-backdrop="!reversing"
      :close-on-esc="!reversing"
      @close="closeReverse"
    >
      <div class="reverse-summary">
        <DesignIcon name="info" :size="18" />
        <span>{{ t('stock_adjust_reverse_explanation') }}</span>
      </div>
      <Field :label="t('Reason')" :error="reverseError">
        <Textarea
          v-model="reverseReason"
          rows="3"
          maxlength="1000"
          :placeholder="t('stock_adjust_reverse_reason_placeholder')"
          :aria-invalid="reverseError ? 'true' : undefined"
          style="resize: vertical;"
        />
      </Field>

      <template #footer>
        <Button
          variant="danger"
          icon="refresh"
          :loading="reversing"
          :disabled="reversing"
          @click="reverseAdjustment"
        >
          {{ t('stock_adjust_reverse') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ CREATE / EDIT VARIANCE CODE MODAL ============ -->
    <Modal
      v-if="canManageVarianceCodes"
      :open="codeModal"
      :width="520"
      :title="codeMode === 'create' ? t('new_variance_code') : t('edit')"
      @close="codeModal = false"
    >
      <div style="display: grid; gap: var(--sp-3);">
        <Field :label="t('code')" :error="codeErrors.code">
          <Input
            v-model="codeForm.code"
            maxlength="20"
            :disabled="codeMode === 'edit'"
            :error="!!codeErrors.code"
            @update:model-value="(v) => codeForm.code = String(v).toUpperCase()"
          />
        </Field>

        <Field :label="t('name')" :error="codeErrors.name">
          <Input
            v-model="codeForm.name"
            maxlength="100"
            :error="!!codeErrors.name"
          />
        </Field>

        <Field :label="t('description')">
          <Textarea
            v-model="codeForm.description"
            rows="3"
            style="resize: vertical;"
          />
        </Field>

        <label class="row" style="gap: 10px; cursor: pointer; padding: 4px 0;">
          <Switch v-model="codeForm.requires_approval" />
          <span style="font-size: 14px;">{{ t('requires_approval') }}</span>
        </label>

        <label v-if="codeMode === 'edit'" class="row" style="gap: 10px; cursor: pointer; padding: 4px 0;">
          <Switch v-model="codeForm.is_active" />
          <span style="font-size: 14px;">{{ t('active_status') }}</span>
        </label>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="codeSaving"
          :disabled="codeSaving"
          @click="saveCode"
        >
          {{ t('save') }}
        </Button>
      </template>
    </Modal>

    <!-- ============ SEED CONFIRM MODAL ============ -->
    <Modal
      v-if="canManageVarianceCodes"
      :open="confirmSeed"
      :width="440"
      :title="t('seed_defaults')"
      @close="confirmSeed = false"
    >
      <div class="row" style="gap: 14px; align-items: flex-start;">
        <div class="kpi__icon t-info" style="width: 44px; height: 44px; flex: 0 0 44px;">
          <DesignIcon name="info" :size="22" />
        </div>
        <p style="margin: 0;">
          {{ t('seed_defaults_confirm') }}
        </p>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="download"
          :loading="seeding"
          :disabled="seeding"
          @click="seedDefaults"
        >
          {{ t('yes') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
}

.toolbar.wrap {
  flex-wrap: wrap;
  gap: 12px;
}

.tool-search {
  width: 220px;
  max-width: 100%;
}

.tool-select {
  width: 180px;
  max-width: 100%;
}

.inline-alert {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border: 1px solid rgb(var(--v-theme-error-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-error-strong));
  background: rgb(var(--v-theme-error-weak));
  font-size: 13px;
}

.adjust-form {
  padding: var(--sp-5);
  display: grid;
  gap: var(--sp-4);
  grid-template-columns: repeat(12, 1fr);
}

.adjust-form__submit {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}

.stock-available-hint {
  margin-block-start: 6px;
  font-size: 12px;
}

.history-quantity {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
}

.history-quantity .cell-muted {
  font-size: 11px;
}

.history-action {
  justify-content: flex-end;
  min-width: 76px;
}

.reverse-summary {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-block-end: var(--sp-4);
  padding: 12px;
  border: 1px solid rgb(var(--v-theme-warning-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
  font-size: 13px;
}

.reverse-summary svg {
  flex: 0 0 auto;
  margin-block-start: 1px;
}

@media (max-width: 1024px) {
  .adjust-form {
    grid-template-columns: 1fr;
  }

  .adjust-form > div[style*="grid-column"] {
    grid-column: span 1 !important;
  }
}

@media (max-width: 768px) {
  .tool-search,
  .tool-select {
    width: 100%;
    flex: 1 1 100%;
  }

  .adjust-form__submit {
    justify-content: stretch;
  }

  .adjust-form__submit > * {
    flex: 1 1 auto;
  }
}
</style>

<route lang="yaml">
meta:
  action: manage
  subject: all
  allPermissions:
    - stock.adjustment.approve
    - stock.catalog.view
  anyPermission:
    - stock.level.view
    - stock.inventory_control.view
</route>
