import type {
  PurchaseInvoiceApiError,
  PurchaseInvoiceDetail,
  PurchaseInvoiceDetailResponse,
  PurchaseInvoiceErrorCode,
  PurchaseInvoiceFieldErrors,
  PurchaseInvoiceListItem,
  PurchaseInvoiceListParams,
  PurchaseInvoiceListResponse,
  PurchaseInvoicePagination,
  PurchaseInvoicePostedResponse,
  PurchaseInvoicePriceChange,
  PurchaseInvoiceReceiveRequest,
  PurchaseInvoiceReverseRequest,
  PurchaseInvoiceReversedResponse,
  PurchaseInvoiceStockConflict,
  SupplierReceivableItem,
  SupplierReceivableItemsParams,
  SupplierReceivableItemsResponse,
} from '@/types/purchaseInvoice'
import { stockApi } from '@/plugins/axios'

type ApiRecord = Record<string, unknown>

const PURCHASE_INVOICE_ERROR_CODES = new Set<PurchaseInvoiceErrorCode>([
  'SUPPLIER_NOT_FOUND',
  'LOCATION_NOT_FOUND',
  'SUPPLIER_ITEM_NOT_FOUND',
  'SUPPLIER_ITEM_MISMATCH',
  'UNIT_CONVERSION_MISSING',
  'DUPLICATE_INVOICE_LINE',
  'DUPLICATE_SUPPLIER_INVOICE',
  'PRICE_REQUIRED',
  'PRICE_CHANGE_CONFIRMATION_REQUIRED',
  'BATCH_REQUIRED',
  'EXPIRY_REQUIRED',
  'STOCK_COST_BASIS_MISSING',
  'INVOICE_ALREADY_POSTED',
  'INVOICE_REVERSAL_STOCK_CONSUMED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'STOCK_SCOPE_FORBIDDEN',
  'INVOICE_NOT_FOUND',
  'INVOICE_ALREADY_REVERSED',
  'INVOICE_NOT_POSTED',
  'INVOICE_TOTAL_MISMATCH',
  'IDEMPOTENCY_KEY_INVALID',
  'VALIDATION_ERROR',
  'INVOICE_OPERATION_FAILED',
])

const API_ENVELOPE_KEYS = new Set([
  'success',
  'data',
  'message',
  'code',
  'errors',
  'field_errors',
  'pagination',
  'meta',
])

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): ApiRecord {
  return isRecord(value) ? value : {}
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string')
    return null

  const normalized = value.trim()

  return normalized || null
}

/**
 * Accept the canonical `{ success, data }` envelope and the older raw/one-key
 * `{ data }` variants at one boundary. Business objects are never recursively
 * unwrapped unless their surrounding object still looks like an envelope.
 */
export function unwrapPurchaseInvoiceEnvelope(value: unknown): unknown {
  let current = value

  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current) || !('data' in current))
      break

    const keys = Object.keys(current)

    const isEnvelope = typeof current.success === 'boolean'
      || keys.every(key => API_ENVELOPE_KEYS.has(key))

    if (!isEnvelope)
      break

    current = current.data
  }

  return current
}

function listFrom(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value))
    return value

  const root = record(value)

  for (const key of keys) {
    if (Array.isArray(root[key]))
      return root[key] as unknown[]
  }

  return []
}

function normalizePagination(value: unknown, itemCount: number, requestedPage?: number, requestedPerPage?: number): PurchaseInvoicePagination {
  const root = record(value)
  const totalItems = finiteNumber(root.total_items ?? root.total ?? root.count) ?? itemCount
  const page = finiteNumber(root.page ?? root.current_page) ?? requestedPage ?? 1
  const perPage = finiteNumber(root.per_page ?? root.page_size) ?? requestedPerPage ?? Math.max(itemCount, 1)
  const totalPages = finiteNumber(root.total_pages) ?? Math.max(1, Math.ceil(totalItems / perPage))

  return {
    total_items: totalItems,
    page,
    per_page: perPage,
    total_pages: totalPages,
    has_next: typeof root.has_next === 'boolean' ? root.has_next : page < totalPages,
    has_previous: typeof root.has_previous === 'boolean' ? root.has_previous : page > 1,
  }
}

function paginationFrom(value: unknown, fallback: ApiRecord): unknown {
  let current = value

  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current))
      break

    if (isRecord(current.pagination))
      return current.pagination
    if (isRecord(current.meta))
      return current.meta

    current = current.data
  }

  return fallback
}

function invoiceFrom(value: unknown): PurchaseInvoiceDetail {
  const rootValue = unwrapPurchaseInvoiceEnvelope(value)
  const root = record(rootValue)
  const candidate = root.invoice ?? root.purchase_invoice ?? root.receiving ?? rootValue

  if (!isRecord(candidate) || finiteNumber(candidate.id) === null)
    throw new TypeError('Purchase invoice response does not contain an invoice')

  return candidate as unknown as PurchaseInvoiceDetail
}

export function normalizeSupplierReceivableItemsResponse(
  value: unknown,
  params: SupplierReceivableItemsParams = {},
): SupplierReceivableItemsResponse {
  const unwrapped = unwrapPurchaseInvoiceEnvelope(value)
  const root = record(unwrapped)
  const items = listFrom(unwrapped, ['items', 'receivable_items', 'supplier_items', 'results']) as SupplierReceivableItem[]
  const pagination = normalizePagination(paginationFrom(value, root), items.length, params.page, params.per_page)

  return { items, pagination }
}

export function normalizePurchaseInvoiceListResponse(
  value: unknown,
  params: PurchaseInvoiceListParams = {},
): PurchaseInvoiceListResponse {
  const unwrapped = unwrapPurchaseInvoiceEnvelope(value)
  const root = record(unwrapped)
  const invoices = listFrom(unwrapped, ['invoices', 'purchase_invoices', 'items', 'results']) as PurchaseInvoiceListItem[]
  const pagination = normalizePagination(paginationFrom(value, root), invoices.length, params.page, params.per_page)

  return { invoices, pagination, total_uzs: finiteNumber(root.total_uzs) }
}

export function normalizePurchaseInvoiceDetailResponse(value: unknown): PurchaseInvoiceDetailResponse {
  return { invoice: invoiceFrom(value) }
}

export function normalizePurchaseInvoicePostedResponse(value: unknown): PurchaseInvoicePostedResponse {
  return { invoice: invoiceFrom(value) }
}

export function normalizePurchaseInvoiceReversedResponse(value: unknown): PurchaseInvoiceReversedResponse {
  return { invoice: invoiceFrom(value) }
}

function paramsWithoutEmpty(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
}

function assertIdempotencyKey(idempotencyKey: string): string {
  const key = idempotencyKey.trim()

  if (!key)
    throw new TypeError('Idempotency-Key is required for a purchase invoice command')

  return key
}

function errorMessages(value: unknown): string[] {
  if (typeof value === 'string')
    return value.trim() ? [value] : []

  if (!Array.isArray(value))
    return []

  return value.flatMap(item => (typeof item === 'string' && item.trim()) ? [item] : [])
}

function collectFieldErrors(value: unknown, result: PurchaseInvoiceFieldErrors, path = ''): void {
  const directMessages = errorMessages(value)

  if (directMessages.length > 0) {
    result[path || 'non_field_errors'] = directMessages

    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFieldErrors(item, result, path ? `${path}.${index}` : String(index)))

    return
  }

  if (!isRecord(value))
    return

  Object.entries(value).forEach(([key, nested]) => {
    const nestedPath = path ? `${path}.${key}` : key

    collectFieldErrors(nested, result, nestedPath)
  })
}

function normalizePriceChange(value: unknown): PurchaseInvoicePriceChange | null {
  const item = record(value)
  const lineIndex = finiteNumber(item.line_index ?? item.index)
  const supplierItemId = finiteNumber(item.supplier_item_id)
  const oldPrice = finiteNumber(item.old_unit_price_uzs ?? item.old_price_uzs ?? item.old_price)
  const newPrice = finiteNumber(item.new_unit_price_uzs ?? item.new_price_uzs ?? item.new_price)
  const difference = finiteNumber(item.difference_uzs ?? item.price_difference_uzs ?? item.difference)
  const percentage = finiteNumber(item.change_percent ?? item.price_change_percent ?? item.percentage)

  if (lineIndex === null || !Number.isInteger(lineIndex) || lineIndex < 0 || oldPrice === null || newPrice === null || difference === null || percentage === null)
    return null

  return {
    line_index: lineIndex,
    supplier_item_id: supplierItemId ?? undefined,
    old_unit_price_uzs: oldPrice,
    new_unit_price_uzs: newPrice,
    difference_uzs: difference,
    change_percent: percentage,
  }
}

function normalizeStockConflict(value: unknown): PurchaseInvoiceStockConflict | null {
  const item = record(value)
  const stockItemId = finiteNumber(item.stock_item_id)
  const stockItemName = stringOrNull(item.stock_item_name ?? item.name)

  if (stockItemId === null || !Number.isSafeInteger(stockItemId) || stockItemId <= 0)
    return null

  return {
    supplier_item_id: finiteNumber(item.supplier_item_id) ?? undefined,
    stock_item_id: stockItemId,
    stock_item_name: stockItemName ?? undefined,
    batch_id: finiteNumber(item.batch_id) ?? undefined,
    batch_number: stringOrNull(item.batch_number),
    received_quantity: finiteNumber(item.received_quantity) ?? undefined,
    available_quantity: finiteNumber(item.available_quantity) ?? undefined,
    required_base_quantity: finiteNumber(item.required_base_quantity) ?? undefined,
    reason: stringOrNull(item.reason) ?? undefined,
  }
}

export function isPurchaseInvoiceErrorCode(value: string | null): value is PurchaseInvoiceErrorCode {
  return value !== null && PURCHASE_INVOICE_ERROR_CODES.has(value as PurchaseInvoiceErrorCode)
}

export function normalizePurchaseInvoiceApiError(error: unknown): PurchaseInvoiceApiError {
  const errorRoot = record(error)
  const response = record(errorRoot.response)
  const body = record(response.data)
  const nested = record(unwrapPurchaseInvoiceEnvelope(response.data))
  const details = record(body.details ?? nested.details ?? body.data ?? nested.data)
  const code = stringOrNull(body.code ?? nested.code ?? details.code)
  const fieldErrors: PurchaseInvoiceFieldErrors = {}

  collectFieldErrors(body.field_errors ?? body.errors ?? nested.field_errors ?? nested.errors, fieldErrors)

  const priceChangeRows = listFrom(details, ['price_changes', 'changes'])

  // The delivered command returns the first conflicting line as flat details.
  // Retain array support for responses that report several conflicts at once.
  if (priceChangeRows.length === 0 && code === 'PRICE_CHANGE_CONFIRMATION_REQUIRED')
    priceChangeRows.push(details)

  const priceChanges = priceChangeRows
    .map(normalizePriceChange)
    .filter((item): item is PurchaseInvoicePriceChange => item !== null)

  const stockConflictRows = listFrom(details, ['stock_conflicts', 'affected_items', 'items'])

  // Cost-basis failures identify a single affected item in flat details.
  if (stockConflictRows.length === 0 && finiteNumber(details.stock_item_id) !== null)
    stockConflictRows.push(details)

  const stockConflicts = stockConflictRows
    .map(normalizeStockConflict)
    .filter((item): item is PurchaseInvoiceStockConflict => item !== null)

  return {
    status: finiteNumber(response.status),
    code,
    known_code: isPurchaseInvoiceErrorCode(code) ? code : null,
    message: stringOrNull(body.message ?? body.detail ?? nested.message ?? nested.detail ?? errorRoot.message),
    field_errors: fieldErrors,
    price_changes: priceChanges,
    stock_conflicts: stockConflicts,
  }
}

export async function fetchSupplierReceivableItems(
  supplierId: number,
  params: SupplierReceivableItemsParams = {},
): Promise<SupplierReceivableItemsResponse> {
  const response = await stockApi.get(`/suppliers/${supplierId}/receivable-items/`, {
    params: paramsWithoutEmpty(params as Record<string, unknown>),
  })

  return normalizeSupplierReceivableItemsResponse(response.data, params)
}

export async function fetchPurchaseInvoices(params: PurchaseInvoiceListParams = {}): Promise<PurchaseInvoiceListResponse> {
  const { created_by_id, posted_by_id, ...canonicalParams } = params

  const response = await stockApi.get('/purchase-invoices/', {
    params: paramsWithoutEmpty({
      ...canonicalParams,
      creator_id: canonicalParams.creator_id ?? created_by_id,
      poster_id: canonicalParams.poster_id ?? posted_by_id,
    }),
  })

  return normalizePurchaseInvoiceListResponse(response.data, params)
}

export async function fetchPurchaseInvoice(invoiceId: number): Promise<PurchaseInvoiceDetailResponse> {
  const response = await stockApi.get(`/purchase-invoices/${invoiceId}/`)

  return normalizePurchaseInvoiceDetailResponse(response.data)
}

export async function receivePurchaseInvoice(
  payload: PurchaseInvoiceReceiveRequest,
  idempotencyKey: string,
): Promise<PurchaseInvoicePostedResponse> {
  const response = await stockApi.post('/purchase-invoices/receive/', payload, {
    headers: { 'Idempotency-Key': assertIdempotencyKey(idempotencyKey) },
  })

  return normalizePurchaseInvoicePostedResponse(response.data)
}

export async function reversePurchaseInvoice(
  invoiceId: number,
  payload: PurchaseInvoiceReverseRequest,
  idempotencyKey: string,
): Promise<PurchaseInvoiceReversedResponse> {
  const response = await stockApi.post(`/purchase-invoices/${invoiceId}/reverse/`, payload, {
    headers: { 'Idempotency-Key': assertIdempotencyKey(idempotencyKey) },
  })

  return normalizePurchaseInvoiceReversedResponse(response.data)
}

export const purchaseInvoiceApi = {
  supplierItems: fetchSupplierReceivableItems,
  list: fetchPurchaseInvoices,
  detail: fetchPurchaseInvoice,
  receive: receivePurchaseInvoice,
  reverse: reversePurchaseInvoice,
}
