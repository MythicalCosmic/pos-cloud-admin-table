<script setup lang="ts">
import type { DataTableColumn } from '@/components/design/DataTable.vue'
import type { PurchaseInvoiceDetail, PurchaseInvoiceReceiveRequest } from '@/types/purchaseInvoice'
import Badge from '@/components/design/Badge.vue'
import Button from '@/components/design/Button.vue'
import Card from '@/components/design/Card.vue'
import DataTable from '@/components/design/DataTable.vue'
import DesignIcon from '@/components/design/DesignIcon.vue'
import Field from '@/components/design/Field.vue'
import Input from '@/components/design/Input.vue'
import Modal from '@/components/design/Modal.vue'
import MoneyInput from '@/components/design/MoneyInput.vue'
import PageHeader from '@/components/design/PageHeader.vue'
import Select from '@/components/design/Select.vue'
import StateFill from '@/components/design/StateFill.vue'
import Switch from '@/components/design/Switch.vue'
import Textarea from '@/components/design/Textarea.vue'
import { useApiError } from '@/composables/useApiError'
import { useUserAccess } from '@/composables/useUserAccess'
import { stockApi } from '@/plugins/axios'
import {
  fetchPurchaseInvoice,
  fetchPurchaseInvoices,
  fetchSupplierReceivableItems,
  normalizePurchaseInvoiceApiError,
  receivePurchaseInvoice,
} from '@/services/purchaseInvoiceApi'
import { supplierItemHasKnownPrice } from '@/utils/supplierItemPrice'

type HistoryState = 'ready' | 'not-ready' | 'error'
type CatalogMode = 'none' | 'receivable' | 'preview'
type BadgeTone = 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral'

interface SelectOption {
  value: string
  label: string
}

interface SupplierRow {
  id: number | string
  name: string
  currency?: string
}

interface LocationRow {
  id: number | string
  name: string
}

interface ReceivableProduct {
  id: string
  supplierItemId: number | string
  stockItemId: number | string
  name: string
  sku: string
  supplierSku: string
  unitId: number | string
  unitName: string
  quantityDecimals: number
  suggestedPrice: number | null
  trackBatches: boolean
  trackExpiry: boolean
  raw: any
}

interface InvoiceLine extends ReceivableProduct {
  quantity: string
  unitPrice: number | null
  batchNumber: string
  expiryDate: string
  isFree: boolean
  freeReason: string
  notes: string
  priceChangeConfirmed: boolean
  priceChangeReason: string
}

interface NormalizedPrice {
  known: boolean
  value: number | null
}

interface InvoiceForm {
  supplierId: string
  locationId: string
  invoiceDate: string
  supplierInvoiceNumber: string
  notes: string
}

const { t } = useI18n({ useScope: 'global' })
const { formatCurrency, formatDate, formatDateShort } = useFormatters()
const { notify } = useNotify()
const { translate } = useApiError()
const { hasPermission } = useUserAccess()
const route = useRoute()

const canCreate = computed(() => hasPermission('stock.purchase_invoice.receive'))

// Match the direct-invoice backend's decimal storage limits.
const MAX_QUANTITY_UNITS = 999999999999999n
const MAX_QUANTITY = '99999999999.9999'
const MAX_LINE_VALUE = 99999999999
const MAX_INVOICE_VALUE = 9999999999999

function tashkentToday(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const value = Object.fromEntries(parts.map(part => [part.type, part.value]))

  return `${value.year}-${value.month}-${value.day}`
}

function dayAfter(isoDate: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate))
    return undefined

  const date = new Date(`${isoDate}T00:00:00Z`)

  date.setUTCDate(date.getUTCDate() + 1)

  return date.toISOString().slice(0, 10)
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  return `purchase-invoice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

function responseData(response: any): any {
  return response?.data?.data ?? response?.data ?? {}
}

function responseRows(data: any, keys: string[]): any[] {
  for (const key of keys) {
    if (Array.isArray(data?.[key]))
      return data[key]
  }
  return Array.isArray(data?.results) ? data.results : []
}

function responseTotal(data: any, fallback: number): number {
  const pagination = data?.pagination ?? {}

  const value = pagination.total
    ?? pagination.total_items
    ?? pagination.total_suppliers
    ?? pagination.count
    ?? data?.total
    ?? data?.count

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : fallback
}

function statusOf(error: any): number {
  return Number(error?.response?.status ?? 0)
}

function errorText(error: any, fallback: string): string {
  const data = error?.response?.data
  const fieldErrors = data?.errors
  if (fieldErrors && typeof fieldErrors === 'object') {
    const first = Object.values(fieldErrors).flat().find(Boolean)
    if (first)
      return String(first)
  }

  return translate(error) || fallback
}

// ---------------------------------------------------------------------------
// Invoice history
// ---------------------------------------------------------------------------

const historyRows = ref<any[]>([])
const historyTotal = ref(0)
const historyPage = ref(1)
const historyPerPage = ref(10)
const historySearch = ref('')
const historyLoading = ref(false)
const historyState = ref<HistoryState>('ready')
const historyError = ref('')
let historyRequestId = 0

const historyColumns = computed<DataTableColumn<any>[]>(() => [
  { key: 'invoice_number', label: t('Invoice'), width: 150 },
  { key: 'supplier_name', label: t('Supplier') },
  { key: 'invoice_date', label: t('Date'), width: 140 },
  { key: 'items_count', label: t('Items'), align: 'right', width: 100 },
  { key: 'total_uzs', label: t('Total'), align: 'right', width: 170 },
  { key: 'status', label: t('Status'), width: 130 },
])

const historyPagination = computed(() => ({
  page: historyPage.value,
  perPage: historyPerPage.value,
  total: historyTotal.value,
  onPage: (page: number) => { historyPage.value = page },
  onPerPage: (perPage: number) => {
    historyPerPage.value = perPage
    historyPage.value = 1
  },
}))

const STATUS_TONES: Record<string, BadgeTone> = {
  DRAFT: 'neutral',
  POSTED: 'success',
  COMPLETE: 'success',
  COMPLETED: 'success',
  CANCELED: 'error',
  CANCELLED: 'error',
  REVERSED: 'warning',
}

function invoiceStatusLabel(status: unknown, display?: string): string {
  const normalized = String(status ?? '').toUpperCase()
  if (normalized === 'POSTED')
    return t('purchaseInvoice.statusPosted')
  if (normalized === 'REVERSED')
    return t('purchaseInvoice.statusReversed')

  return display || String(status || '—')
}

function invoiceNumber(row: any): string {
  return row?.invoice_number
    ?? row?.receiving_number
    ?? row?.document_number
    ?? (row?.id != null ? `#${row.id}` : '—')
}

function invoiceSupplier(row: any): string {
  return row?.supplier_name ?? row?.supplier?.name ?? '—'
}

function invoiceDate(row: any): string {
  return row?.invoice_date ?? row?.received_date ?? row?.created_at ?? ''
}

function invoiceItemCount(row: any): number | string {
  return row?.line_count ?? row?.items_count ?? row?.item_count ?? row?.lines?.length ?? row?.items?.length ?? 0
}

function invoiceTotal(row: any): number | string {
  return row?.total_uzs ?? row?.total ?? row?.received_value_uzs ?? 0
}

const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailInvoiceId = ref<number | null>(null)
const detailInvoice = ref<PurchaseInvoiceDetail | null>(null)
let detailRequestId = 0

async function loadInvoiceDetail(invoiceId: number) {
  const requestId = ++detailRequestId

  detailLoading.value = true
  detailError.value = ''
  detailInvoice.value = null

  try {
    const response = await fetchPurchaseInvoice(invoiceId)
    if (requestId !== detailRequestId || !detailOpen.value)
      return

    detailInvoice.value = response.invoice
  }
  catch (error) {
    if (requestId !== detailRequestId || !detailOpen.value)
      return

    const normalizedError = normalizePurchaseInvoiceApiError(error)

    detailError.value = normalizedError.message || errorText(error, t('Failed to load invoice details'))
  }
  finally {
    if (requestId === detailRequestId)
      detailLoading.value = false
  }
}

function openInvoiceDetail(row: any) {
  const invoiceId = Number(row.id)

  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0)
    return

  detailInvoiceId.value = invoiceId
  detailOpen.value = true
  loadInvoiceDetail(invoiceId)
}

function retryInvoiceDetail() {
  if (detailInvoiceId.value !== null)
    loadInvoiceDetail(detailInvoiceId.value)
}

function closeInvoiceDetail() {
  detailOpen.value = false
  detailRequestId += 1
  detailLoading.value = false
}

async function loadHistory() {
  const requestId = ++historyRequestId

  historyLoading.value = true
  historyError.value = ''
  try {
    const data = await fetchPurchaseInvoices({
      page: historyPage.value,
      per_page: historyPerPage.value,
      ...(historySearch.value.trim() ? { search: historySearch.value.trim() } : {}),
    })

    if (requestId !== historyRequestId)
      return

    historyRows.value = data.invoices
    historyTotal.value = data.pagination.total_items
    historyState.value = 'ready'
  }
  catch (error: any) {
    if (requestId !== historyRequestId)
      return

    historyRows.value = []
    historyTotal.value = 0
    if ([404, 405].includes(statusOf(error))) {
      historyState.value = 'not-ready'
      historyError.value = ''
    }
    else {
      historyState.value = 'error'
      historyError.value = errorText(error, t('Failed to load purchase invoices'))
    }
  }
  finally {
    if (requestId === historyRequestId)
      historyLoading.value = false
  }
}

watch([historyPage, historyPerPage], loadHistory)
watch(historySearch, useDebounceFn(() => {
  historyPage.value = 1
  loadHistory()
}, 350))

// ---------------------------------------------------------------------------
// Lookups and supplier catalog
// ---------------------------------------------------------------------------

const suppliers = ref<SupplierRow[]>([])
const locations = ref<LocationRow[]>([])
const lookupsLoading = ref(false)
const lookupError = ref('')

const supplierOptions = computed<SelectOption[]>(() => suppliers.value.map(supplier => ({
  value: String(supplier.id),
  label: supplier.name,
})))

const locationOptions = computed<SelectOption[]>(() => locations.value.map(location => ({
  value: String(location.id),
  label: location.name,
})))

const form = ref<InvoiceForm>({
  supplierId: '',
  locationId: '',
  invoiceDate: tashkentToday(),
  supplierInvoiceNumber: '',
  notes: '',
})

const formErrors = ref<Partial<Record<keyof InvoiceForm, string>>>({})

async function loadAllRows(path: string, keys: string[]): Promise<any[]> {
  const rows: any[] = []
  const perPage = 100
  for (let page = 1; ; page += 1) {
    const response = await stockApi.get(path, { params: { page, per_page: perPage, is_active: true } })
    const data = responseData(response)
    const pageRows = responseRows(data, keys)

    rows.push(...pageRows)

    const total = responseTotal(data, rows.length)
    if (!pageRows.length || rows.length >= total)
      break
  }

  return rows
}

async function loadLookups() {
  lookupsLoading.value = true
  lookupError.value = ''
  try {
    const [supplierRows, locationRows] = await Promise.all([
      loadAllRows('/suppliers/', ['suppliers']),
      loadAllRows('/locations/', ['locations']),
    ])

    suppliers.value = supplierRows
      .filter(row => row?.is_active !== false)
      .map(row => ({ id: row.id, name: row.name ?? `#${row.id}`, currency: row.currency }))
    locations.value = locationRows
      .filter(row => row?.is_active !== false)
      .map(row => ({ id: row.id, name: row.name ?? `#${row.id}` }))
  }
  catch (error) {
    suppliers.value = []
    locations.value = []
    lookupError.value = errorText(error, t('Failed to load suppliers and locations'))
  }
  finally {
    lookupsLoading.value = false
  }
}

const catalogMode = ref<CatalogMode>('none')
const catalogLoading = ref(false)
const catalogError = ref('')
const productSearch = ref('')
const invoiceLines = ref<InvoiceLine[]>([])
const lineErrors = ref<Record<string, string>>({})
let catalogRequestId = 0

function productSourceRows(data: any): any[] {
  return responseRows(data, ['receivable_items', 'items']).length
    ? responseRows(data, ['receivable_items', 'items'])
    : Array.isArray(data?.supplier?.items)
      ? data.supplier.items
      : []
}

function firstPresent(...values: any[]): any {
  return values.find(value => value !== null && value !== undefined)
}

function normalizeSuggestedPrice(supplierItem: any): NormalizedPrice {
  const rawPrice = firstPresent(
    supplierItem?.suggested_unit_price_uzs,
    supplierItem?.price_uzs,
    supplierItem?.unit_price_uzs,
    supplierItem?.price,
  )

  const value = Number(rawPrice)
  const priceIsKnown = firstPresent(supplierItem?.price_is_known, supplierItem?.price_known)

  const known = supplierItemHasKnownPrice({
    ...supplierItem,
    price_is_known: priceIsKnown,
    suggested_unit_price_uzs: rawPrice,
  })

  return {
    known: known && Number.isFinite(value) && value > 0,
    value: Number.isFinite(value) ? Math.round(value) : null,
  }
}

function trackingFlag(supplierItem: any, stockItem: any, key: 'batches' | 'expiry'): boolean {
  if (key === 'batches') {
    return Boolean(firstPresent(
      stockItem?.track_batches,
      stockItem?.is_batch_tracked,
      supplierItem?.track_batches,
      supplierItem?.is_batch_tracked,
    ))
  }

  return Boolean(firstPresent(
    stockItem?.track_expiry,
    stockItem?.is_expiry_tracked,
    supplierItem?.track_expiry,
    supplierItem?.is_expiry_tracked,
  ))
}

function normalizeQuantityDecimals(unit: any): number {
  const rawQuantityDecimals = Number(unit?.decimal_places ?? 4)

  return Number.isInteger(rawQuantityDecimals)
    ? Math.min(4, Math.max(0, rawQuantityDecimals))
    : 4
}

function normalizeProduct(row: any): ReceivableProduct | null {
  const supplierItem = firstPresent(row?.supplier_item, row)
  const stockItem = firstPresent(supplierItem?.stock_item, row?.stock_item, {})
  const supplierItemId = firstPresent(supplierItem?.supplier_item_id, supplierItem?.id)
  const stockItemId = firstPresent(supplierItem?.stock_item_id, stockItem?.id)
  const unit = firstPresent(supplierItem?.purchase_unit, supplierItem?.unit, row?.unit, {})
  const unitId = firstPresent(supplierItem?.unit_id, unit?.id)
  const price = normalizeSuggestedPrice(supplierItem)

  if (supplierItemId == null || stockItemId == null || unitId == null)
    return null

  return {
    id: String(supplierItemId),
    supplierItemId,
    stockItemId,
    name: firstPresent(supplierItem?.stock_item_name, stockItem?.name, supplierItem?.supplier_name, `#${stockItemId}`),
    sku: firstPresent(stockItem?.sku, supplierItem?.stock_item_sku, ''),
    supplierSku: firstPresent(supplierItem?.supplier_sku, ''),
    unitId,
    unitName: firstPresent(supplierItem?.unit_short, supplierItem?.unit_name, unit?.short_name, unit?.name, '—'),
    quantityDecimals: normalizeQuantityDecimals(unit),
    suggestedPrice: price.known ? price.value : null,
    trackBatches: trackingFlag(supplierItem, stockItem, 'batches'),
    trackExpiry: trackingFlag(supplierItem, stockItem, 'expiry'),
    raw: row,
  }
}

function setProducts(rows: any[]) {
  invoiceLines.value = rows
    .map(normalizeProduct)
    .filter((row): row is ReceivableProduct => row !== null)
    .map(row => ({
      ...row,
      quantity: '',
      unitPrice: row.suggestedPrice,
      batchNumber: '',
      expiryDate: '',
      isFree: false,
      freeReason: '',
      notes: '',
      priceChangeConfirmed: false,
      priceChangeReason: '',
    }))
  lineErrors.value = {}
}

function catalogRequestIsCurrent(requestId: number, supplierId: string): boolean {
  return requestId === catalogRequestId && String(form.value.supplierId) === String(supplierId)
}

async function fetchAllProductRows(path: string): Promise<any[]> {
  const rows: any[] = []
  const perPage = 100

  for (let page = 1; ; page += 1) {
    const response = await stockApi.get(path, { params: { page, per_page: perPage } })
    const data = responseData(response)
    const pageRows = productSourceRows(data)

    rows.push(...pageRows)

    const total = responseTotal(data, rows.length)
    if (!pageRows.length || rows.length >= total)
      break
  }

  return rows
}

async function fetchAllReceivableRows(supplierId: string): Promise<any[]> {
  const rows: any[] = []
  const perPage = 100

  for (let page = 1; ; page += 1) {
    const data = await fetchSupplierReceivableItems(Number(supplierId), { page, per_page: perPage })

    rows.push(...data.items)
    if (!data.items.length || !data.pagination.has_next || rows.length >= data.pagination.total_items)
      break
  }

  return rows
}

async function loadPreviewSupplierProducts(supplierId: string, requestId: number) {
  try {
    const rows = await fetchAllProductRows(`/suppliers/${supplierId}/items/`)
    if (!catalogRequestIsCurrent(requestId, supplierId))
      return

    setProducts(rows)
    catalogMode.value = 'preview'
  }
  catch (error) {
    if (catalogRequestIsCurrent(requestId, supplierId))
      catalogError.value = errorText(error, t('Failed to load supplier products'))
  }
}

async function loadSupplierProducts(supplierId = form.value.supplierId) {
  const requestId = ++catalogRequestId

  catalogLoading.value = true
  catalogError.value = ''
  catalogMode.value = 'none'
  productSearch.value = ''
  setProducts([])

  if (!supplierId) {
    catalogLoading.value = false
    return
  }

  try {
    const rows = await fetchAllReceivableRows(supplierId)
    if (!catalogRequestIsCurrent(requestId, supplierId))
      return

    setProducts(rows)
    catalogMode.value = 'receivable'
  }
  catch (primaryError: any) {
    if (!catalogRequestIsCurrent(requestId, supplierId))
      return

    const normalizedError = normalizePurchaseInvoiceApiError(primaryError)
    if (![404, 405].includes(statusOf(primaryError)) || normalizedError.code) {
      catalogError.value = errorText(primaryError, t('Failed to load supplier products'))
      return
    }

    // The existing supplier-items endpoint is intentionally display-only here.
    // It does not prove that the future direct-receiving command accepts a line.
    await loadPreviewSupplierProducts(supplierId, requestId)
  }
  finally {
    if (requestId === catalogRequestId)
      catalogLoading.value = false
  }
}

async function retrySupplierProducts() {
  await loadSupplierProducts()
}

// ---------------------------------------------------------------------------
// Editor and receive command
// ---------------------------------------------------------------------------

const editorOpen = ref(false)
const confirmationOpen = ref(false)
const editorStarted = ref(false)
const saving = ref(false)
const submitError = ref('')
const receiveEndpointNotReady = ref(false)
const idempotencyKey = ref(newIdempotencyKey())
const attemptedPayloadSignature = ref('')
const lastPosted = ref<any | null>(null)
const supplierChangeOpen = ref(false)
const pendingSupplierId = ref('')

function resetEditor() {
  catalogRequestId += 1
  form.value = {
    supplierId: '',
    locationId: locations.value.length === 1 ? String(locations.value[0].id) : '',
    invoiceDate: tashkentToday(),
    supplierInvoiceNumber: '',
    notes: '',
  }
  catalogMode.value = 'none'
  catalogError.value = ''
  catalogLoading.value = false
  productSearch.value = ''
  invoiceLines.value = []
  lineErrors.value = {}
  formErrors.value = {}
  submitError.value = ''
  receiveEndpointNotReady.value = false
  idempotencyKey.value = newIdempotencyKey()
  attemptedPayloadSignature.value = ''
}

function openEditor() {
  if (!canCreate.value)
    return

  if (!editorStarted.value) {
    resetEditor()
    editorStarted.value = true
  }
  editorOpen.value = true
}

function closeEditor() {
  if (!saving.value)
    editorOpen.value = false
}

function quantityNumber(line: InvoiceLine): number {
  const raw = String(line.quantity ?? '').trim()
  if (!raw)
    return 0
  const value = Number(raw)

  return Number.isFinite(value) ? value : Number.NaN
}

const selectedLines = computed(() => invoiceLines.value.filter(line => quantityNumber(line) > 0))

function lineTotal(line: InvoiceLine): number {
  if (line.isFree)
    return 0

  const quantity = String(line.quantity ?? '').trim()
  const price = Number(line.unitPrice)
  const match = quantity.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match || !Number.isSafeInteger(price) || price < 0)
    return 0

  const fractionalDigits = match[2] ?? ''
  const scale = 10n ** BigInt(fractionalDigits.length)
  const quantityUnits = BigInt(`${match[1]}${fractionalDigits}`)
  const rounded = (quantityUnits * BigInt(price) + scale / 2n) / scale
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER))
    return Number.MAX_SAFE_INTEGER + 1

  return Number(rounded)
}

const selectedTotal = computed(() => selectedLines.value.reduce((sum, line) => {
  return sum + lineTotal(line)
}, 0))

function priceChangePercent(line: InvoiceLine): number | null {
  const previous = Number(line.suggestedPrice)
  const next = Number(line.unitPrice)
  if (line.isFree || !Number.isFinite(previous) || previous <= 0 || !Number.isFinite(next) || next <= 0)
    return null

  const percentage = Math.abs(next - previous) / previous * 100

  return percentage >= 30 ? percentage : null
}

function onPriceChanged(line: InvoiceLine) {
  line.priceChangeConfirmed = false
  line.priceChangeReason = ''
  lineErrors.value[line.id] = ''
}

function setFreeLine(line: InvoiceLine, isFree: boolean) {
  line.isFree = isFree
  line.unitPrice = isFree ? 0 : line.suggestedPrice
  line.freeReason = ''
  line.priceChangeConfirmed = false
  line.priceChangeReason = ''
  lineErrors.value[line.id] = ''
}

const filteredLines = computed(() => {
  const query = productSearch.value.trim().toLocaleLowerCase()
  if (!query)
    return invoiceLines.value

  return invoiceLines.value.filter(line => [line.name, line.sku, line.supplierSku, line.unitName]
    .some(value => String(value ?? '').toLocaleLowerCase().includes(query)))
})

const selectedSupplier = computed(() => suppliers.value.find(
  supplier => String(supplier.id) === String(form.value.supplierId),
))

const selectedLocation = computed(() => locations.value.find(
  location => String(location.id) === String(form.value.locationId),
))

watch(() => form.value.supplierId, async supplierId => {
  formErrors.value.supplierId = ''
  await loadSupplierProducts(supplierId)
})

function requestSupplierChange(nextSupplierId: string) {
  if (String(nextSupplierId) === String(form.value.supplierId))
    return

  if (selectedLines.value.length) {
    pendingSupplierId.value = String(nextSupplierId)
    editorOpen.value = false
    supplierChangeOpen.value = true
    return
  }

  form.value.supplierId = String(nextSupplierId)
}

function closeSupplierChange() {
  supplierChangeOpen.value = false
  pendingSupplierId.value = ''
  editorOpen.value = true
}

function confirmSupplierChange() {
  const nextSupplierId = pendingSupplierId.value

  supplierChangeOpen.value = false
  pendingSupplierId.value = ''
  form.value.supplierId = nextSupplierId
  editorOpen.value = true
}

function quantityPattern(decimalPlaces: number): RegExp {
  return decimalPlaces > 0
    ? new RegExp(`^\\d+(?:\\.\\d{1,${decimalPlaces}})?$`)
    : /^\d+$/
}

function applyServerFieldErrors(fieldErrors: Record<string, string[]>, submittedPayload: PurchaseInvoiceReceiveRequest): boolean {
  let applied = false
  for (const [path, messages] of Object.entries(fieldErrors)) {
    const message = messages.filter(Boolean).join(' ')
    if (!message)
      continue

    if (path.includes('supplier_invoice_number')) {
      formErrors.value.supplierInvoiceNumber = message
      applied = true
      continue
    }
    if (path.includes('supplier_id')) {
      formErrors.value.supplierId = message
      applied = true
      continue
    }
    if (path.includes('location_id')) {
      formErrors.value.locationId = message
      applied = true
      continue
    }
    if (path.includes('invoice_date')) {
      formErrors.value.invoiceDate = message
      applied = true
      continue
    }

    const lineMatch = path.match(/lines\.(\d+)/)
    const supplierItemId = submittedPayload.lines[Number(lineMatch?.[1])]?.supplier_item_id

    const line = invoiceLines.value.find(candidate => Number(candidate.supplierItemId) === supplierItemId)

    if (line) {
      lineErrors.value[line.id] = message
      applied = true
    }
  }

  return applied
}

function validateInvoiceFields() {
  if (!form.value.supplierId)
    formErrors.value.supplierId = t('Supplier is required')
  if (!form.value.locationId)
    formErrors.value.locationId = t('Location is required')
  if (!form.value.invoiceDate)
    formErrors.value.invoiceDate = t('Date is required')
  else if (form.value.invoiceDate > tashkentToday())
    formErrors.value.invoiceDate = t('Invoice date cannot be in the future')
  if (catalogMode.value !== 'receivable')
    submitError.value = t('The backend receivable-products contract is not ready')
}

function hasPositiveValidQuantity(line: InvoiceLine): boolean {
  const rawQuantity = String(line.quantity ?? '').trim()

  if (!rawQuantity || rawQuantity === '0')
    return false

  const quantity = quantityNumber(line)

  if (!quantityPattern(line.quantityDecimals).test(rawQuantity) || !Number.isFinite(quantity) || quantity < 0) {
    lineErrors.value[line.id] = t('Enter a valid quantity for this unit', { count: line.quantityDecimals })

    return false
  }

  const [whole, fraction = ''] = rawQuantity.split('.')
  const quantityUnits = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
  if (quantityUnits > MAX_QUANTITY_UNITS) {
    lineErrors.value[line.id] = t('purchaseInvoice.quantityTooLarge')

    return false
  }

  return quantity !== 0
}

function priceValidationMessage(line: InvoiceLine): string {
  const price = Number(line.unitPrice)

  if (line.isFree)
    return (price === 0 && Boolean(line.freeReason.trim())) ? '' : t('Enter a reason for the free product')

  if (!Number.isSafeInteger(price) || price <= 0)
    return t('Enter a whole UZS unit price greater than zero')

  if (price > MAX_LINE_VALUE)
    return t('purchaseInvoice.unitPriceTooLarge')

  if (priceChangePercent(line) === null)
    return ''

  return (line.priceChangeConfirmed && Boolean(line.priceChangeReason.trim()))
    ? ''
    : t('Confirm the large price change and enter a reason')
}

function trackingValidationMessage(line: InvoiceLine): string {
  if (line.trackBatches && !line.batchNumber.trim())
    return t('Batch number is required for this item')

  if (line.trackExpiry && !line.expiryDate)
    return t('Expiry date is required for this item')

  if (line.trackExpiry && line.expiryDate <= form.value.invoiceDate)
    return t('Expiry date must be later than the invoice date')

  return ''
}

function validateInvoiceLine(line: InvoiceLine): boolean {
  if (!hasPositiveValidQuantity(line))
    return false

  const message = priceValidationMessage(line)
    || trackingValidationMessage(line)
    || (lineTotal(line) > MAX_LINE_VALUE ? t('purchaseInvoice.lineTotalTooLarge') : '')

  if (message)
    lineErrors.value[line.id] = message

  return true
}

function validateEditor(): boolean {
  formErrors.value = {}
  lineErrors.value = {}
  submitError.value = ''

  validateInvoiceFields()

  const positiveLineCount = invoiceLines.value.filter(validateInvoiceLine).length

  if (positiveLineCount === 0)
    submitError.value = submitError.value || t('Enter a quantity for at least one product')
  else if (!Number.isSafeInteger(selectedTotal.value) || selectedTotal.value > MAX_INVOICE_VALUE)
    submitError.value = submitError.value || t('Invoice total is too large')

  return !Object.values(formErrors.value).some(Boolean)
    && !Object.keys(lineErrors.value).length
    && !submitError.value
}

function openConfirmation() {
  if (!canCreate.value || !validateEditor())
    return

  editorOpen.value = false
  confirmationOpen.value = true
}

function closeConfirmation() {
  if (saving.value)
    return
  confirmationOpen.value = false
  editorOpen.value = true
}

function receivePayload(): PurchaseInvoiceReceiveRequest {
  return {
    supplier_id: Number(form.value.supplierId),
    location_id: Number(form.value.locationId),
    invoice_date: form.value.invoiceDate,
    supplier_invoice_number: form.value.supplierInvoiceNumber.trim(),
    currency: 'UZS',
    declared_total_uzs: selectedTotal.value,
    notes: form.value.notes.trim(),
    lines: selectedLines.value.map(line => ({
      supplier_item_id: Number(line.supplierItemId),
      quantity: Number(line.quantity),
      unit_price_uzs: line.isFree ? 0 : Number(line.unitPrice),
      is_free: line.isFree,
      free_reason: line.isFree ? line.freeReason.trim() : '',
      batch_number: line.trackBatches ? line.batchNumber.trim() : '',
      expiry_date: line.trackExpiry ? line.expiryDate : null,
      notes: line.notes.trim(),
      ...(priceChangePercent(line) !== null
        ? {
          price_change_confirmed: line.priceChangeConfirmed,
          price_change_reason: line.priceChangeReason.trim(),
        }
        : {}),
    })),
  }
}

function prepareIdempotencyKey(payload: PurchaseInvoiceReceiveRequest) {
  const payloadSignature = JSON.stringify(payload)

  if (attemptedPayloadSignature.value && attemptedPayloadSignature.value !== payloadSignature)
    idempotencyKey.value = newIdempotencyKey()

  attemptedPayloadSignature.value = payloadSignature
}

function reopenEditor() {
  confirmationOpen.value = false
  editorOpen.value = true
}

function applyRequiredPriceChanges(error: ReturnType<typeof normalizePurchaseInvoiceApiError>, submittedPayload: PurchaseInvoiceReceiveRequest) {
  for (const change of error.price_changes) {
    const supplierItemId = change.supplier_item_id
      ?? submittedPayload.lines[change.line_index]?.supplier_item_id

    const line = invoiceLines.value.find(candidate => Number(candidate.supplierItemId) === supplierItemId)

    if (line) {
      line.suggestedPrice = change.old_unit_price_uzs
      line.priceChangeConfirmed = false
      line.priceChangeReason = ''
    }
  }
}

function handleReceiveError(error: any, submittedPayload: PurchaseInvoiceReceiveRequest) {
  const normalizedError = normalizePurchaseInvoiceApiError(error)
  const status = normalizedError.status ?? statusOf(error)

  if (status === 404 && !normalizedError.code) {
    receiveEndpointNotReady.value = true
    submitError.value = t('The backend receive-invoice endpoint is not available yet')

    return
  }

  if (normalizedError.known_code === 'PRICE_CHANGE_CONFIRMATION_REQUIRED') {
    applyRequiredPriceChanges(normalizedError, submittedPayload)
    reopenEditor()
    submitError.value = normalizedError.message || t('Confirm the large price change and enter a reason')

    return
  }

  submitError.value = normalizedError.message || errorText(error, t('Failed to receive supplier invoice'))
  if (applyServerFieldErrors(normalizedError.field_errors, submittedPayload))
    reopenEditor()
}

async function receiveInvoice() {
  if (!canCreate.value || saving.value || !validateEditor())
    return

  saving.value = true
  submitError.value = ''

  const payload = receivePayload()

  prepareIdempotencyKey(payload)

  try {
    const response = await receivePurchaseInvoice(payload, idempotencyKey.value)

    lastPosted.value = response.invoice
    confirmationOpen.value = false
    editorOpen.value = false
    editorStarted.value = false
    notify(t('Supplier invoice received and stock updated'))
    resetEditor()
    historySearch.value = ''
    historyPage.value = 1
    await loadHistory()
  }
  catch (error: any) {
    handleReceiveError(error, payload)
  }
  finally {
    saving.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadHistory(), loadLookups()])
  if (!form.value.locationId && locations.value.length === 1)
    form.value.locationId = String(locations.value[0].id)

  const requestedSupplier = String(Array.isArray(route.query.supplier) ? route.query.supplier[0] : route.query.supplier ?? '')
  if (canCreate.value && requestedSupplier && suppliers.value.some(supplier => String(supplier.id) === requestedSupplier)) {
    editorStarted.value = true
    editorOpen.value = true
    form.value.supplierId = requestedSupplier
  }
})
</script>

<template>
  <div class="page purchase-invoices-page">
    <PageHeader
      :title="t('Purchase invoices')"
      :subtitle="t('Receive supplier products into stock from one invoice')"
    >
      <template #actions>
        <Button
          v-if="canCreate"
          variant="primary"
          icon="plus"
          :disabled="lookupsLoading"
          @click="openEditor"
        >
          {{ t('New supplier invoice') }}
        </Button>
      </template>
    </PageHeader>

    <div
      v-if="lastPosted"
      class="posted-notice"
      role="status"
    >
      <DesignIcon
        name="checkcircle"
        :size="20"
      />
      <div>
        <strong>{{ t('Stock updated successfully') }}</strong>
        <span>
          {{ invoiceNumber(lastPosted) }}
          · {{ formatCurrency(invoiceTotal(lastPosted)) }} UZS
        </span>
      </div>
    </div>

    <Card>
      <div class="history-toolbar">
        <div class="history-search">
          <Input
            v-model="historySearch"
            icon="search"
            :placeholder="t('Search invoices...')"
            :aria-label="t('Search invoices...')"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon="retry"
          :loading="historyLoading"
          @click="loadHistory"
        >
          {{ t('Refresh') }}
        </Button>
      </div>

      <div class="card__divider" />

      <StateFill
        v-if="historyState === 'not-ready'"
        icon="info"
        :title="t('Purchase invoice history is not available yet')"
        :sub="t('The purchase-invoice history endpoint is unavailable. No sample data is shown.')"
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="loadHistory"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>

      <StateFill
        v-else-if="historyState === 'error'"
        icon="alert"
        :title="t('Failed to load purchase invoices')"
        :sub="historyError"
        error
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="loadHistory"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>

      <DataTable
        v-else
        :columns="historyColumns"
        :rows="historyRows"
        row-key="id"
        :loading="historyLoading"
        :pagination="historyPagination"
        :per-page-options="[10, 25, 50]"
        :empty-title="t('No purchase invoices')"
        :empty-sub="t('Received supplier invoices will appear here')"
        empty-icon="receipt"
        @row-click="openInvoiceDetail"
      >
        <template #cell.invoice_number="{ row }">
          <span class="cell-strong mono">{{ invoiceNumber(row) }}</span>
          <span
            v-if="row.supplier_invoice_number"
            class="history-reference"
          >{{ row.supplier_invoice_number }}</span>
        </template>
        <template #cell.supplier_name="{ row }">
          <span>{{ invoiceSupplier(row) }}</span>
        </template>
        <template #cell.invoice_date="{ row }">
          <span class="mono cell-muted nowrap">
            {{ invoiceDate(row) ? formatDateShort(invoiceDate(row)) : '—' }}
          </span>
        </template>
        <template #cell.items_count="{ row }">
          <span class="mono num-tabular">{{ invoiceItemCount(row) }}</span>
        </template>
        <template #cell.total_uzs="{ row }">
          <span class="mono num-tabular">{{ formatCurrency(invoiceTotal(row)) }} UZS</span>
        </template>
        <template #cell.status="{ row }">
          <Badge
            :tone="STATUS_TONES[String(row.status ?? '').toUpperCase()] ?? 'neutral'"
            dot
          >
            {{ invoiceStatusLabel(row.status, row.status_display) }}
          </Badge>
        </template>
      </DataTable>
    </Card>

    <Modal
      :open="detailOpen"
      :width="980"
      :title="t('Invoice details')"
      @close="closeInvoiceDetail"
    >
      <StateFill
        v-if="detailLoading"
        icon="receipt"
        :title="t('Loading...')"
      />

      <StateFill
        v-else-if="detailError"
        icon="alert"
        :title="t('Failed to load invoice details')"
        :sub="detailError"
        error
      >
        <template #action>
          <Button
            variant="secondary"
            size="sm"
            icon="retry"
            @click="retryInvoiceDetail"
          >
            {{ t('Retry') }}
          </Button>
        </template>
      </StateFill>

      <div
        v-else-if="detailInvoice"
        class="invoice-detail"
      >
        <dl class="invoice-detail-summary">
          <div>
            <dt>{{ t('Invoice') }}</dt>
            <dd>
              <strong class="mono">{{ detailInvoice.receiving_number }}</strong>
              <small v-if="detailInvoice.supplier_invoice_number">
                {{ t('Supplier invoice number') }}: {{ detailInvoice.supplier_invoice_number }}
              </small>
            </dd>
          </div>
          <div>
            <dt>{{ t('Status') }}</dt>
            <dd>
              <Badge
                :tone="STATUS_TONES[detailInvoice.status] ?? 'neutral'"
                dot
              >
                {{ invoiceStatusLabel(detailInvoice.status) }}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>{{ t('Supplier') }}</dt>
            <dd>
              {{ detailInvoice.supplier.name }}
            </dd>
          </div>
          <div>
            <dt>{{ t('Location') }}</dt>
            <dd>
              {{ detailInvoice.location.name }}
            </dd>
          </div>
          <div>
            <dt>{{ t('Invoice date') }}</dt>
            <dd class="mono">
              {{ formatDateShort(detailInvoice.invoice_date) }}
            </dd>
          </div>
          <div>
            <dt>{{ t('Posted at') }}</dt>
            <dd class="mono">
              {{ formatDate(detailInvoice.posted_at) }}
            </dd>
          </div>
          <div>
            <dt>{{ t('Total') }}</dt>
            <dd class="mono num-tabular">
              {{ formatCurrency(detailInvoice.total_uzs) }} UZS
            </dd>
          </div>
          <div v-if="typeof detailInvoice.supplier_balance_before_uzs === 'number'">
            <dt>{{ t('Supplier balance before') }}</dt>
            <dd class="mono num-tabular">
              {{ formatCurrency(detailInvoice.supplier_balance_before_uzs) }} UZS
            </dd>
          </div>
          <div v-if="typeof detailInvoice.supplier_balance_after_uzs === 'number'">
            <dt>{{ t('Supplier balance after') }}</dt>
            <dd class="mono num-tabular">
              {{ formatCurrency(detailInvoice.supplier_balance_after_uzs) }} UZS
            </dd>
          </div>
          <div
            v-if="detailInvoice.notes"
            class="invoice-detail-note"
          >
            <dt>{{ t('Notes') }}</dt>
            <dd>{{ detailInvoice.notes }}</dd>
          </div>
        </dl>

        <div class="invoice-detail-section-head">
          <h3>{{ t('Supplier products') }}</h3>
          <Badge tone="neutral">
            {{ detailInvoice.lines.length }}
          </Badge>
        </div>

        <div class="invoice-detail-lines">
          <article
            v-for="line in detailInvoice.lines"
            :key="line.id"
            class="invoice-detail-line"
          >
            <header class="invoice-detail-line__head">
              <div>
                <strong>{{ line.stock_item_name }}</strong>
                <small
                  v-if="line.stock_item_sku"
                  class="mono"
                >{{ line.stock_item_sku }}</small>
              </div>
              <Badge
                v-if="line.is_free"
                tone="info"
              >
                {{ t('Free') }}
              </Badge>
            </header>

            <dl class="invoice-detail-line__grid">
              <div>
                <dt>{{ t('Quantity Received') }}</dt>
                <dd class="mono num-tabular">
                  {{ line.purchase_quantity }} {{ line.purchase_unit }}
                </dd>
              </div>
              <div>
                <dt>{{ t('Unit Cost') }}</dt>
                <dd class="mono num-tabular">
                  {{ formatCurrency(line.purchase_unit_price_uzs) }} UZS
                </dd>
              </div>
              <div>
                <dt>{{ t('Total') }}</dt>
                <dd class="mono num-tabular">
                  {{ formatCurrency(line.line_total_uzs) }} UZS
                </dd>
              </div>
              <div>
                <dt>{{ t('Stock') }}</dt>
                <dd class="mono num-tabular">
                  {{ line.stock_quantity_before }} &rarr; {{ line.stock_quantity_after }} {{ line.base_unit }}
                </dd>
              </div>
              <div>
                <dt>{{ t('Average cost') }}</dt>
                <dd class="mono num-tabular">
                  {{ formatCurrency(line.previous_average_cost_uzs) }} &rarr; {{ formatCurrency(line.new_average_cost_uzs) }} UZS
                </dd>
              </div>
              <div v-if="line.batch_number">
                <dt>{{ t('Batch Number') }}</dt>
                <dd class="mono">
                  {{ line.batch_number }}
                </dd>
              </div>
              <div v-if="line.expiry_date">
                <dt>{{ t('Expiry Date') }}</dt>
                <dd class="mono">
                  {{ formatDateShort(line.expiry_date) }}
                </dd>
              </div>
              <div
                v-if="line.free_reason"
                class="invoice-detail-note"
              >
                <dt>{{ t('Free product reason') }}</dt>
                <dd>{{ line.free_reason }}</dd>
              </div>
              <div
                v-if="line.price_change_reason"
                class="invoice-detail-note"
              >
                <dt>{{ t('Price change reason') }}</dt>
                <dd>{{ line.price_change_reason }}</dd>
              </div>
              <div
                v-if="line.notes"
                class="invoice-detail-note"
              >
                <dt>{{ t('Notes') }}</dt>
                <dd>{{ line.notes }}</dd>
              </div>
            </dl>
          </article>
        </div>
      </div>
    </Modal>

    <Modal
      :open="editorOpen"
      :width="1120"
      :title="t('New supplier invoice')"
      :subtitle="t('Enter only the quantities that physically arrived')"
      :close-on-backdrop="false"
      :close-on-esc="!saving"
      @close="closeEditor"
    >
      <div class="invoice-editor">
        <div
          v-if="lookupError"
          class="inline-alert inline-alert--error"
          role="alert"
        >
          <DesignIcon
            name="alert"
            :size="18"
          />
          <span>{{ lookupError }}</span>
          <Button
            variant="ghost"
            size="sm"
            icon="retry"
            :loading="lookupsLoading"
            @click="loadLookups"
          >
            {{ t('Retry') }}
          </Button>
        </div>

        <div class="invoice-meta-grid">
          <Field
            :label="t('Supplier')"
            :error="formErrors.supplierId"
          >
            <Select
              :model-value="form.supplierId"
              icon="building"
              :options="supplierOptions"
              :placeholder="lookupsLoading ? t('Loading...') : t('Select supplier')"
              :disabled="lookupsLoading || !supplierOptions.length"
              @update:model-value="requestSupplierChange"
            />
          </Field>

          <Field
            :label="t('Location')"
            :error="formErrors.locationId"
          >
            <Select
              v-model="form.locationId"
              icon="store"
              :options="locationOptions"
              :placeholder="lookupsLoading ? t('Loading...') : t('Select location')"
              :disabled="lookupsLoading || !locationOptions.length"
              @update:model-value="formErrors.locationId = ''"
            />
          </Field>

          <Field
            :label="t('Invoice date')"
            :error="formErrors.invoiceDate"
          >
            <Input
              v-model="form.invoiceDate"
              type="date"
              icon="calendar"
              :max="tashkentToday()"
              @update:model-value="formErrors.invoiceDate = ''"
            />
          </Field>

          <Field
            :label="t('Supplier invoice number')"
            :error="formErrors.supplierInvoiceNumber"
          >
            <Input
              v-model="form.supplierInvoiceNumber"
              maxlength="100"
              :placeholder="t('Optional reference')"
            />
          </Field>

          <Field
            :label="t('Notes')"
            class="meta-notes"
          >
            <Textarea
              v-model="form.notes"
              :rows="2"
              maxlength="1000"
              :placeholder="t('Notes')"
            />
          </Field>
        </div>

        <div class="products-head">
          <div>
            <h3>{{ t('Supplier products') }}</h3>
            <p>{{ t('Zero quantities are ignored when the invoice is received') }}</p>
          </div>
          <Badge
            v-if="selectedLines.length"
            tone="primary"
          >
            {{ t('Selected') }}: {{ selectedLines.length }}
          </Badge>
        </div>

        <StateFill
          v-if="!form.supplierId"
          icon="building"
          :title="t('Select a supplier')"
          :sub="t('The products linked to that supplier will appear here')"
        />

        <StateFill
          v-else-if="catalogLoading"
          icon="package"
          :title="t('Loading supplier products...')"
        />

        <StateFill
          v-else-if="catalogError"
          icon="alert"
          :title="t('Failed to load supplier products')"
          :sub="catalogError"
          error
        >
          <template #action>
            <Button
              variant="secondary"
              size="sm"
              icon="retry"
              @click="retrySupplierProducts"
            >
              {{ t('Retry') }}
            </Button>
          </template>
        </StateFill>

        <template v-else-if="catalogMode !== 'none'">
          <div
            v-if="catalogMode === 'preview'"
            class="inline-alert inline-alert--warning"
            role="status"
          >
            <DesignIcon
              name="info"
              :size="18"
            />
            <span>
              {{ t('Preview only: the backend receivable-products endpoint is unavailable, so this invoice cannot be submitted yet.') }}
            </span>
          </div>

          <div
            v-if="invoiceLines.length"
            class="product-search"
          >
            <Input
              v-model="productSearch"
              icon="search"
              :placeholder="t('Search supplier products...')"
              :aria-label="t('Search supplier products...')"
            />
          </div>

          <div
            v-if="invoiceLines.length && filteredLines.length"
            class="product-list"
          >
            <div
              class="product-grid product-grid--header"
              aria-hidden="true"
            >
              <span>{{ t('Stock Item') }}</span>
              <span>{{ t('Unit') }}</span>
              <span>{{ t('Quantity Received') }}</span>
              <span>{{ t('Unit Cost') }}</span>
              <span class="align-right">{{ t('Total') }}</span>
            </div>

            <div
              v-for="line in filteredLines"
              :key="line.id"
              class="product-grid product-row"
              :class="{ 'is-selected': quantityNumber(line) > 0, 'has-error': !!lineErrors[line.id] }"
            >
              <div class="product-identity">
                <strong :title="line.name">{{ line.name }}</strong>
                <span
                  v-if="line.sku || line.supplierSku"
                  class="mono"
                >
                  {{ [line.sku, line.supplierSku].filter(Boolean).join(' · ') }}
                </span>
              </div>

              <div
                class="product-cell product-unit"
                :data-label="t('Unit')"
              >
                <Badge tone="neutral">
                  {{ line.unitName }}
                </Badge>
              </div>

              <div
                class="product-cell"
                :data-label="t('Quantity Received')"
              >
                <Input
                  v-model="line.quantity"
                  type="number"
                  inputmode="decimal"
                  min="0"
                  :max="MAX_QUANTITY"
                  :step="line.quantityDecimals > 0 ? 1 / 10 ** line.quantityDecimals : 1"
                  :aria-label="`${t('Quantity Received')}: ${line.name}`"
                  :error="!!lineErrors[line.id]"
                  @update:model-value="lineErrors[line.id] = ''"
                />
              </div>

              <div
                class="product-cell"
                :data-label="t('Unit Cost')"
              >
                <MoneyInput
                  v-model="line.unitPrice"
                  nullable
                  :disabled="line.isFree"
                  :aria-label="`${t('Unit Cost')}: ${line.name}`"
                  :error="!!lineErrors[line.id]"
                  @update:model-value="onPriceChanged(line)"
                />
                <span
                  v-if="line.suggestedPrice == null && !line.isFree && !(Number(line.unitPrice) > 0)"
                  class="unknown-price"
                >{{ t('Price required') }}</span>
              </div>

              <div
                class="product-cell product-total mono num-tabular"
                :data-label="t('Total')"
              >
                {{ formatCurrency(quantityNumber(line) > 0 ? lineTotal(line) : 0) }} UZS
              </div>

              <div
                v-if="quantityNumber(line) > 0"
                class="line-details"
              >
                <label class="line-switch">
                  <Switch
                    :model-value="line.isFree"
                    :aria-label="`${t('Free promotional product')}: ${line.name}`"
                    @update:model-value="value => setFreeLine(line, value)"
                  />
                  <span>{{ t('Free promotional product') }}</span>
                </label>
                <Field
                  v-if="line.isFree"
                  :label="t('Free product reason')"
                  class="line-details__wide"
                >
                  <Input
                    v-model="line.freeReason"
                    maxlength="250"
                    :placeholder="t('Explain why this item is free')"
                    @update:model-value="lineErrors[line.id] = ''"
                  />
                </Field>
                <Field
                  v-if="line.trackBatches"
                  :label="t('Batch Number')"
                >
                  <Input
                    v-model="line.batchNumber"
                    maxlength="100"
                    :placeholder="t('Batch Number')"
                    @update:model-value="lineErrors[line.id] = ''"
                  />
                </Field>
                <Field
                  v-if="line.trackExpiry"
                  :label="t('Expiry Date')"
                >
                  <Input
                    v-model="line.expiryDate"
                    type="date"
                    :min="dayAfter(form.invoiceDate)"
                    @update:model-value="lineErrors[line.id] = ''"
                  />
                </Field>
                <div
                  v-if="priceChangePercent(line) !== null"
                  class="price-change-warning line-details__wide"
                  role="status"
                >
                  <DesignIcon
                    name="alert"
                    :size="18"
                  />
                  <div>
                    <strong>{{ t('Large price change') }}: {{ priceChangePercent(line)?.toFixed(1) }}%</strong>
                    <span>
                      {{ formatCurrency(line.suggestedPrice ?? 0) }} UZS → {{ formatCurrency(line.unitPrice ?? 0) }} UZS
                    </span>
                  </div>
                </div>
                <label
                  v-if="priceChangePercent(line) !== null"
                  class="line-switch line-details__wide"
                >
                  <Switch
                    v-model="line.priceChangeConfirmed"
                    :aria-label="`${t('I confirm this price change')}: ${line.name}`"
                    @change="lineErrors[line.id] = ''"
                  />
                  <span>{{ t('I confirm this price change') }}</span>
                </label>
                <Field
                  v-if="priceChangePercent(line) !== null && line.priceChangeConfirmed"
                  :label="t('Price change reason')"
                  class="line-details__wide"
                >
                  <Input
                    v-model="line.priceChangeReason"
                    maxlength="250"
                    :placeholder="t('Explain the price change')"
                    @update:model-value="lineErrors[line.id] = ''"
                  />
                </Field>
              </div>

              <div
                v-if="lineErrors[line.id]"
                class="line-error"
                role="alert"
              >
                {{ lineErrors[line.id] }}
              </div>
            </div>
          </div>

          <StateFill
            v-else-if="invoiceLines.length"
            icon="search"
            :title="t('No matching supplier products')"
            :sub="t('Try another product name or SKU')"
          />

          <StateFill
            v-else
            icon="package"
            :title="t('This supplier has no receivable products')"
            :sub="t('Link stock items to the supplier before receiving an invoice')"
          />
        </template>

        <div
          v-if="submitError"
          class="inline-alert inline-alert--error"
          role="alert"
        >
          <DesignIcon
            name="alert"
            :size="18"
          />
          <span>{{ submitError }}</span>
        </div>
      </div>

      <template #footer>
        <div class="editor-footer">
          <div class="editor-total">
            <span>{{ t('Invoice total') }}</span>
            <strong class="mono num-tabular">{{ formatCurrency(selectedTotal) }} UZS</strong>
            <small>{{ t('Selected products') }}: {{ selectedLines.length }}</small>
          </div>
          <Button
            variant="primary"
            icon-right="chevright"
            :disabled="catalogMode !== 'receivable' || catalogLoading || !invoiceLines.length || receiveEndpointNotReady"
            @click="openConfirmation"
          >
            {{ t('Review and confirm') }}
          </Button>
        </div>
      </template>
    </Modal>

    <Modal
      :open="supplierChangeOpen"
      :width="520"
      :title="t('Change supplier?')"
      :subtitle="t('The quantities and prices already entered will be cleared.')"
      :close-on-backdrop="false"
      @close="closeSupplierChange"
    >
      <div
        class="posting-explanation"
        role="note"
      >
        <DesignIcon
          name="info"
          :size="18"
        />
        <span>{{ t('This keeps products from different suppliers out of the same invoice.') }}</span>
      </div>
      <template #footer>
        <Button
          variant="primary"
          icon="check"
          @click="confirmSupplierChange"
        >
          {{ t('Change supplier and clear products') }}
        </Button>
      </template>
    </Modal>

    <Modal
      :open="confirmationOpen"
      :width="680"
      :title="t('Confirm supplier invoice')"
      :subtitle="t('Review the invoice before stock is updated')"
      :close-on-backdrop="false"
      :close-on-esc="!saving"
      @close="closeConfirmation"
    >
      <div class="confirmation-content">
        <div class="confirmation-grid">
          <div>
            <span>{{ t('Supplier') }}</span>
            <strong>{{ selectedSupplier?.name ?? '—' }}</strong>
          </div>
          <div>
            <span>{{ t('Location') }}</span>
            <strong>{{ selectedLocation?.name ?? '—' }}</strong>
          </div>
          <div>
            <span>{{ t('Date') }}</span>
            <strong class="mono">{{ form.invoiceDate }}</strong>
          </div>
          <div>
            <span>{{ t('Invoice total') }}</span>
            <strong class="mono num-tabular">{{ formatCurrency(selectedTotal) }} UZS</strong>
          </div>
        </div>

        <div class="confirmation-lines">
          <div
            v-for="line in selectedLines"
            :key="line.id"
            class="confirmation-line"
          >
            <div>
              <strong>{{ line.name }}</strong>
              <span>{{ line.quantity }} {{ line.unitName }} × {{ formatCurrency(line.unitPrice ?? 0) }} UZS</span>
            </div>
            <strong class="mono num-tabular">
              {{ formatCurrency(quantityNumber(line) * Number(line.unitPrice)) }} UZS
            </strong>
          </div>
        </div>

        <div
          class="posting-explanation"
          role="note"
        >
          <DesignIcon
            name="info"
            :size="18"
          />
          <span>
            {{ t('Confirming will add the accepted quantities to stock and increase the supplier balance. It will not pay the supplier or debit Safe/Bank.') }}
          </span>
        </div>

        <div
          v-if="submitError"
          class="inline-alert inline-alert--error"
          role="alert"
        >
          <DesignIcon
            name="alert"
            :size="18"
          />
          <span>{{ submitError }}</span>
        </div>
      </div>

      <template #footer>
        <Button
          variant="primary"
          icon="check"
          :loading="saving"
          :disabled="saving || receiveEndpointNotReady"
          @click="receiveInvoice"
        >
          {{ t('Receive and add to stock') }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.purchase-invoices-page {
  max-width: none;
}

.posted-notice,
.inline-alert,
.posting-explanation {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
}

.posted-notice {
  margin-bottom: var(--sp-4);
  padding: 12px 14px;
  border-color: rgb(var(--v-theme-success-border));
  color: rgb(var(--v-theme-success-strong));
  background: rgb(var(--v-theme-success-weak));
}

.posted-notice > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.posted-notice span {
  color: rgb(var(--v-theme-text-secondary));
}

.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-4);
}

.history-search {
  width: min(100%, 380px);
}

.history-reference {
  display: block;
  margin-top: 2px;
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-xs);
}

.invoice-detail {
  display: grid;
  gap: var(--sp-4);
}

.invoice-detail-summary {
  display: grid;
  margin: 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-3);
}

.invoice-detail-summary > div,
.invoice-detail-line__grid > div {
  min-width: 0;
}

.invoice-detail-summary > div {
  padding: 12px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface-inset));
}

.invoice-detail-summary dt,
.invoice-detail-line__grid dt {
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-xs);
}

.invoice-detail-summary dd,
.invoice-detail-line__grid dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-on-surface));
}

.invoice-detail-summary dd {
  display: grid;
  justify-items: start;
  gap: 3px;
}

.invoice-detail-note {
  grid-column: 1 / -1;
}

.invoice-detail-note dd {
  white-space: pre-wrap;
}

.invoice-detail-summary small,
.invoice-detail-line__head small {
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-xs);
}

.invoice-detail-section-head,
.invoice-detail-line__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
}

.invoice-detail-section-head h3 {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-lg);
}

.invoice-detail-lines {
  display: grid;
  max-height: min(52vh, 560px);
  overflow: auto;
  gap: var(--sp-3);
}

.invoice-detail-line {
  padding: 14px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-lg);
  background: rgb(var(--v-theme-surface));
}

.invoice-detail-line__head > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.invoice-detail-line__head strong {
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-on-surface));
}

.invoice-detail-line__grid {
  display: grid;
  margin: var(--sp-3) 0 0;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--sp-3);
}

.invoice-editor,
.confirmation-content {
  display: grid;
  gap: var(--sp-4);
}

.invoice-meta-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--sp-3);
}

.meta-notes {
  grid-column: 1 / -1;
}

.products-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sp-3);
  padding-top: var(--sp-1);
}

.products-head h3 {
  margin: 0;
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-lg);
}

.products-head p {
  margin: 4px 0 0;
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-sm);
}

.product-search {
  width: min(100%, 420px);
}

.product-list {
  max-height: min(48vh, 520px);
  overflow: auto;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-lg);
  background: rgb(var(--v-theme-surface));
}

.product-grid {
  display: grid;
  grid-template-columns: minmax(210px, 1.8fr) minmax(72px, .55fr) minmax(125px, .8fr) minmax(150px, 1fr) minmax(140px, .9fr);
  gap: var(--sp-3);
  align-items: center;
}

.product-grid--header {
  position: sticky;
  z-index: 2;
  top: 0;
  padding: 10px 14px;
  border-bottom: 1px solid rgb(var(--v-theme-border));
  color: rgb(var(--v-theme-text-secondary));
  background: rgb(var(--v-theme-surface-inset));
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  letter-spacing: .03em;
  text-transform: uppercase;
}

.product-row {
  padding: 12px 14px;
  border-bottom: 1px solid rgb(var(--v-theme-border));
  transition: background-color .15s ease, box-shadow .15s ease;
}

.product-row:last-child {
  border-bottom: 0;
}

.product-row.is-selected {
  background: rgb(var(--v-theme-primary-weak));
  box-shadow: inset 3px 0 rgb(var(--v-theme-primary));
}

.product-row.has-error {
  background: rgb(var(--v-theme-error-weak));
  box-shadow: inset 3px 0 rgb(var(--v-theme-error));
}

.product-identity {
  min-width: 0;
}

.product-identity strong,
.product-identity span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-identity strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-sm);
}

.product-identity span {
  margin-top: 3px;
  color: rgb(var(--v-theme-text-tertiary));
  font-size: var(--fs-xs);
}

.product-cell {
  min-width: 0;
}

.product-total {
  text-align: right;
  white-space: nowrap;
}

.unknown-price {
  display: block;
  margin-top: 3px;
  color: rgb(var(--v-theme-warning-strong));
  font-size: var(--fs-xs);
}

.line-details {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
  padding: 10px 12px;
  border: 1px dashed rgb(var(--v-theme-border-strong));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface));
}

.line-details__wide {
  grid-column: 1 / -1;
}

.line-switch {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 9px;
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-sm);
  cursor: pointer;
}

.price-change-warning {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid rgb(var(--v-theme-warning-border));
  border-radius: var(--r-md);
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
  font-size: var(--fs-xs);
}

.price-change-warning > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.line-error {
  grid-column: 1 / -1;
  color: rgb(var(--v-theme-error));
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}

.inline-alert {
  padding: 10px 12px;
}

.inline-alert > span,
.posting-explanation > span {
  min-width: 0;
  flex: 1;
}

.inline-alert--warning {
  border-color: rgb(var(--v-theme-warning-border));
  color: rgb(var(--v-theme-warning-strong));
  background: rgb(var(--v-theme-warning-weak));
}

.inline-alert--error {
  border-color: rgb(var(--v-theme-error-border));
  color: rgb(var(--v-theme-error-strong));
  background: rgb(var(--v-theme-error-weak));
}

.editor-footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
}

.editor-total {
  display: grid;
  min-width: 0;
  grid-template-columns: auto auto;
  gap: 1px 10px;
  align-items: baseline;
}

.editor-total span,
.editor-total small {
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-xs);
}

.editor-total strong {
  color: rgb(var(--v-theme-on-surface));
  font-size: var(--fs-lg);
}

.editor-total small {
  grid-column: 1 / -1;
}

.confirmation-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
}

.confirmation-grid > div {
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
  background: rgb(var(--v-theme-surface-inset));
}

.confirmation-grid span {
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-xs);
}

.confirmation-grid strong {
  min-width: 0;
  overflow-wrap: anywhere;
  color: rgb(var(--v-theme-on-surface));
}

.confirmation-lines {
  max-height: 280px;
  overflow: auto;
  border: 1px solid rgb(var(--v-theme-border));
  border-radius: var(--r-md);
}

.confirmation-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: 11px 12px;
  border-bottom: 1px solid rgb(var(--v-theme-border));
}

.confirmation-line:last-child {
  border-bottom: 0;
}

.confirmation-line > div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.confirmation-line > div strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confirmation-line span {
  color: rgb(var(--v-theme-text-secondary));
  font-size: var(--fs-xs);
}

.confirmation-line > strong {
  flex: 0 0 auto;
  white-space: nowrap;
}

.posting-explanation {
  padding: 11px 12px;
  border-color: rgb(var(--v-theme-info-border));
  color: rgb(var(--v-theme-info-strong));
  background: rgb(var(--v-theme-info-weak));
}

.align-right {
  text-align: right;
}

@media (max-width: 900px) {
  .invoice-detail-summary,
  .invoice-detail-line__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .invoice-meta-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .product-grid--header {
    display: none;
  }

  .product-grid.product-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .product-identity,
  .line-details,
  .line-error {
    grid-column: 1 / -1;
  }

  .product-cell::before {
    display: block;
    margin-bottom: 5px;
    color: rgb(var(--v-theme-text-tertiary));
    content: attr(data-label);
    font-size: var(--fs-xs);
    font-weight: var(--fw-medium);
  }

  .product-total {
    align-self: end;
    padding-bottom: 10px;
    text-align: left;
  }
}

@media (max-width: 620px) {
  .history-toolbar,
  .editor-footer,
  .confirmation-line {
    align-items: stretch;
    flex-direction: column;
  }

  .history-search {
    width: 100%;
  }

  .invoice-detail-summary,
  .invoice-detail-line__grid {
    grid-template-columns: 1fr;
  }

  .invoice-meta-grid,
    .confirmation-grid,
    .product-grid.product-row,
    .line-details {
    grid-template-columns: 1fr;
  }

    .meta-notes,
    .product-identity,
    .line-details,
    .line-error {
      grid-column: auto;
    }

    .line-details__wide {
      grid-column: auto;
    }

  .products-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .product-list {
    max-height: 52vh;
    border: 0;
    background: transparent;
  }

  .product-row {
    margin-bottom: 10px;
    border: 1px solid rgb(var(--v-theme-border));
    border-radius: var(--r-md);
    background: rgb(var(--v-theme-surface));
  }

  .product-row:last-child {
    border-bottom: 1px solid rgb(var(--v-theme-border));
  }

  .product-total {
    padding-bottom: 0;
  }

  .editor-total {
    grid-template-columns: 1fr;
  }

  .editor-total small {
    grid-column: auto;
  }

  .editor-footer :deep(.btn) {
    width: 100%;
  }

  .confirmation-line > strong {
    align-self: flex-end;
  }
}
</style>

<route lang="yaml">
name: stock-purchase-invoices
meta:
  action: manage
  subject: all
  anyPermission:
    - stock.purchase_invoice.view
    - stock.purchase_invoice.receive
</route>
