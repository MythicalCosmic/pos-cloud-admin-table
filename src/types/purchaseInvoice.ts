export type PurchaseInvoiceStatus = 'POSTED' | 'REVERSED'

export type PurchaseInvoiceSourceType = 'DIRECT_INVOICE'

export type PurchaseInvoiceCurrency = 'UZS'

export type PurchaseInvoiceAllowedAction = 'reverse' | 'create_replacement'

export interface PurchaseInvoiceReference {
  id: number
  name: string
}

export type PurchaseInvoiceActor = PurchaseInvoiceReference

export interface SupplierReceivablePurchaseUnit {
  id: number
  name: string
  short_name: string
  decimal_places: number
  conversion_to_base: number
}

export interface SupplierReceivableBaseUnit {
  id: number
  name: string
  short_name: string
}

/** A supplier-catalog row that the backend has approved for direct receiving. */
export interface SupplierReceivableItem {
  supplier_item_id: number
  supplier_id: number
  stock_item_id: number
  stock_item_name: string
  stock_item_sku: string
  item_type: 'RAW' | 'SEMI' | 'FINISHED' | 'PACKAGING'
  purchase_unit: SupplierReceivablePurchaseUnit
  base_unit: SupplierReceivableBaseUnit
  suggested_unit_price_uzs: number | null
  price_is_known: boolean
  last_price_update: string | null
  track_batches: boolean
  track_expiry: boolean
  default_expiry_days: number | null
  current_stock_base_quantity: number
}

export interface PurchaseInvoicePagination {
  total_items: number
  page: number
  per_page: number
  total_pages: number
  has_next: boolean
  has_previous: boolean
}

export interface SupplierReceivableItemsParams {
  search?: string
  page?: number
  per_page?: number
}

export interface SupplierReceivableItemsResponse {
  items: SupplierReceivableItem[]
  pagination: PurchaseInvoicePagination
}

/**
 * All monetary and quantity fields are unformatted JSON numbers. Formatting
 * such as `100 000` belongs only in the input component's displayed value.
 */
export interface PurchaseInvoiceReceiveLine {
  supplier_item_id: number
  quantity: number
  unit_price_uzs: number
  is_free: boolean
  free_reason: string
  batch_number: string
  expiry_date: string | null
  notes: string
  price_change_confirmed?: boolean
  price_change_reason?: string
}

export interface PurchaseInvoiceReceiveRequest {
  supplier_id: number
  location_id: number
  invoice_date: string
  supplier_invoice_number: string
  currency: PurchaseInvoiceCurrency
  declared_total_uzs: number
  notes: string
  lines: PurchaseInvoiceReceiveLine[]
  replaces_invoice_id?: number
}

export interface PurchaseInvoiceReverseRequest {
  reason: string
}

export interface PurchaseInvoiceLine {
  id: number
  supplier_item_id: number
  stock_item_id: number
  stock_item_name: string
  stock_item_sku?: string
  purchase_quantity: number
  purchase_unit: string
  purchase_unit_id?: number
  purchase_unit_price_uzs: number
  conversion_to_base?: number
  base_quantity: number
  base_unit: string
  base_unit_id?: number
  base_unit_cost_uzs: number
  line_total_uzs: number
  stock_quantity_before: number
  stock_quantity_after: number
  previous_average_cost_uzs: number
  new_average_cost_uzs: number
  stock_transaction_id: number
  batch_id?: number | null
  is_free?: boolean
  free_reason?: string
  batch_number?: string | null
  expiry_date?: string | null
  notes?: string
  price_change_confirmed?: boolean
  price_change_reason?: string
}

export interface PurchaseInvoiceListItem {
  id: number
  receiving_number: string
  supplier_invoice_number: string
  source_type: PurchaseInvoiceSourceType
  status: PurchaseInvoiceStatus
  invoice_date: string
  posted_at: string
  supplier: PurchaseInvoiceReference
  location: PurchaseInvoiceReference
  currency: PurchaseInvoiceCurrency
  line_count: number
  total_uzs: number
  created_by: PurchaseInvoiceActor
  posted_by: PurchaseInvoiceActor
  allowed_actions: PurchaseInvoiceAllowedAction[]
}

export interface PurchaseInvoiceActionHistoryEntry {
  action: string
  at: string
  actor_id: number | null
  reason?: string
}

export interface PurchaseInvoiceReversal {
  version: number
  correction_id: number
  reason: string
  reversed_at: string
  reversed_by_id: number
  stock_transaction_ids: number[]
  supplier_transaction_id: number
  total_uzs: number
  supplier_balance_before_uzs?: number | null
  supplier_balance_after_uzs?: number | null
}

export interface PurchaseInvoiceDetail extends PurchaseInvoiceListItem {
  subtotal_uzs: number
  lines: PurchaseInvoiceLine[]
  supplier_transaction_id: number
  purchase_order_id: number | null
  receiving_id: number
  supplier_balance_before_uzs?: number | null
  supplier_balance_after_uzs?: number | null
  notes?: string
  action_history?: PurchaseInvoiceActionHistoryEntry[]
  reversal?: PurchaseInvoiceReversal
  replaces_invoice_id?: number | null
  replacement_invoice_ids?: number[]
}

export interface PurchaseInvoiceListParams {
  search?: string
  supplier_id?: number
  location_id?: number
  status?: PurchaseInvoiceStatus | ''
  invoice_date_from?: string
  invoice_date_to?: string
  posted_date_from?: string
  posted_date_to?: string
  stock_item_id?: number
  creator_id?: number
  poster_id?: number

  /** Compatibility aliases mapped to the backend's creator_id/poster_id filters. */
  created_by_id?: number
  posted_by_id?: number
  page?: number
  per_page?: number
}

export interface PurchaseInvoiceListResponse {
  invoices: PurchaseInvoiceListItem[]
  pagination: PurchaseInvoicePagination

  /** Total across every filtered row, not just the loaded page. */
  total_uzs: number | null
}

export interface PurchaseInvoiceDetailResponse {
  invoice: PurchaseInvoiceDetail
}

export interface PurchaseInvoicePostedResponse {
  invoice: PurchaseInvoiceDetail
}

export interface PurchaseInvoiceReversedResponse {
  invoice: PurchaseInvoiceDetail
}

export type PurchaseInvoiceErrorCode =
  | 'SUPPLIER_NOT_FOUND'
  | 'LOCATION_NOT_FOUND'
  | 'SUPPLIER_ITEM_NOT_FOUND'
  | 'SUPPLIER_ITEM_MISMATCH'
  | 'UNIT_CONVERSION_MISSING'
  | 'DUPLICATE_INVOICE_LINE'
  | 'DUPLICATE_SUPPLIER_INVOICE'
  | 'PRICE_REQUIRED'
  | 'PRICE_CHANGE_CONFIRMATION_REQUIRED'
  | 'BATCH_REQUIRED'
  | 'EXPIRY_REQUIRED'
  | 'STOCK_COST_BASIS_MISSING'
  | 'INVOICE_ALREADY_POSTED'
  | 'INVOICE_REVERSAL_STOCK_CONSUMED'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'STOCK_SCOPE_FORBIDDEN'
  | 'INVOICE_NOT_FOUND'
  | 'INVOICE_ALREADY_REVERSED'
  | 'INVOICE_NOT_POSTED'
  | 'INVOICE_TOTAL_MISMATCH'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'VALIDATION_ERROR'
  | 'INVOICE_OPERATION_FAILED'

export interface PurchaseInvoicePriceChange {
  line_index: number
  supplier_item_id?: number
  old_unit_price_uzs: number
  new_unit_price_uzs: number
  difference_uzs: number
  change_percent: number
}

export interface PurchaseInvoiceStockConflict {
  supplier_item_id?: number
  stock_item_id: number
  stock_item_name?: string
  batch_id?: number
  batch_number?: string | null
  received_quantity?: number
  available_quantity?: number
  required_base_quantity?: number
  reason?: string
}

export type PurchaseInvoiceFieldErrors = Record<string, string[]>

/** Normalized error information for validation, conflicts, and transport errors. */
export interface PurchaseInvoiceApiError {
  status: number | null
  code: string | null
  known_code: PurchaseInvoiceErrorCode | null
  message: string | null
  field_errors: PurchaseInvoiceFieldErrors
  price_changes: PurchaseInvoicePriceChange[]
  stock_conflicts: PurchaseInvoiceStockConflict[]
}
