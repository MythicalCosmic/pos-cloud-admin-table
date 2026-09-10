// ── Stock Item ──
export type ItemType = 'RAW' | 'SEMI' | 'FINISHED' | 'PACKAGING'

export interface StockItem {
  id: number
  sku: string
  name: string
  barcode: string | null
  item_type: ItemType
  item_type_display: string
  category: { id: number; name: string } | null
  category_id: number | null
  base_unit: { id: number; name: string; short_name: string } | null
  base_unit_id: number | null
  cost_price: string
  avg_cost_price?: string | number | null
  last_cost_price?: string | number | null
  min_stock_level: number | null
  max_stock_level: number | null
  reorder_point: number | null
  is_purchasable: boolean
  is_sellable: boolean
  is_producible: boolean
  track_batches: boolean
  track_expiry: boolean
  default_expiry_days: number | null
  storage_conditions: string | null
  is_active: boolean
}

export interface StockItemsListResponse {
  items: StockItem[]
  pagination?: { total_items: number }
}

// ── Supplier ──
export interface Supplier {
  id: number
  name: string
  contact_person: string
  email: string
  phone: string
  city: string
  address: string
  rating: number | null
  payment_terms_days: number | null
  lead_time_days: number | null
  current_balance: string
  item_count: number
  is_active: boolean
  items?: SupplierItem[]
}

export interface SupplierItem {
  stock_item_name: string
  price: string
  unit_short: string
}

export interface SuppliersListResponse {
  suppliers: Supplier[]
  pagination?: { total_items: number }
}

// ── Stock Category ──
export type StockCategoryType = 'RAW_MATERIAL' | 'SEMI_FINISHED' | 'FINISHED_GOOD' | 'PACKAGING'

export interface StockCategory {
  id: number
  name: string
  type: StockCategoryType
  type_display: string
  parent: { id: number; name: string } | null
  parent_id: number | null
  sort_order: number
  is_active: boolean
}

export interface StockCategoriesListResponse {
  categories: StockCategory[]
  pagination?: { total_items: number }
  count?: number
}

// ── Unit ──
export type UnitType = 'WEIGHT' | 'VOLUME' | 'COUNT' | 'LENGTH' | 'TIME'

export interface Unit {
  id: number
  name: string
  short_name: string
  unit_type: UnitType
  unit_type_display: string
  is_base_unit: boolean
  base_unit: { id: number; short_name: string } | null
  base_unit_id: number | null
  conversion_factor: number | null
  decimal_places: number
  is_active: boolean
}

export interface UnitsListResponse {
  units: Unit[]
  count?: number
}

// ── Location ──
export type LocationType = 'WAREHOUSE' | 'KITCHEN' | 'BAR' | 'STORAGE' | 'PREP'

export interface Location {
  id: number
  name: string
  type: LocationType
  type_display: string
  parent: { id: number; name: string } | null
  parent_id: number | null
  is_default: boolean
  is_production_area: boolean
  sort_order: number
  is_active: boolean
}

export interface LocationsListResponse {
  locations: Location[]
  count?: number
}

// ── Stock Level ──
export interface StockLevel {
  stock_item: { id: number; name: string; sku: string }
  location: { id: number; name: string }
  quantity: number
  reserved_quantity: number
  available_quantity: number
  pending_in_quantity: number
  last_movement_at: string | null
}

export interface StockLevelsListResponse {
  levels: StockLevel[]
  pagination?: { total_items: number }
}

// ── Recipe ──
export type RecipeType = 'PRODUCTION' | 'ASSEMBLY' | 'PREPARATION' | 'DISASSEMBLY'
export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD'

export interface Ingredient {
  stock_item: { id: number; name: string } | null
  quantity: number
  unit: string
}

export interface Recipe {
  id: number
  name: string
  code: string
  recipe_type: RecipeType
  output_item: { id: number; name: string } | null
  output_item_id: number | null
  output_item_name: string
  output_quantity: number
  output_unit: string
  output_unit_id: number | null
  estimated_time_minutes: number | null
  difficulty_level: DifficultyLevel
  version: number
  notes: string
  is_active: boolean
  ingredients: Ingredient[]
}

export interface RecipesListResponse {
  recipes: Recipe[]
  pagination?: { total_items: number }
}

// ── Transfer ──
export type TransferStatus = 'DRAFT' | 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELED'

export interface TransferLineItem {
  stock_item_id: number
  quantity: number
  unit_id: number
  item?: { id: number; name: string }
  stock_item?: { id: number; name: string }
  unit?: { id: number; short_name: string }
}

export interface Transfer {
  id: number
  transfer_number: string
  from_location: { id: number; name: string } | null
  to_location: { id: number; name: string } | null
  transfer_type: 'INTERNAL' | 'BRANCH_TO_BRANCH'
  status: TransferStatus
  created_at: string
  items?: TransferLineItem[]
  line_items?: TransferLineItem[]
}

export interface TransfersListResponse {
  transfers: Transfer[]
  pagination?: { total_items: number }
}

// ── Transaction ──
export type MovementType =
  | 'PURCHASE_IN' | 'SALE_OUT' | 'TRANSFER_IN' | 'TRANSFER_OUT'
  | 'PRODUCTION_IN' | 'PRODUCTION_OUT' | 'ADJUSTMENT_PLUS' | 'ADJUSTMENT_MINUS'
  | 'WASTE' | 'SPOILAGE' | 'RETURN_FROM_CUSTOMER' | 'RETURN_TO_SUPPLIER'
  | 'COUNT_ADJUSTMENT' | 'OPENING_BALANCE'

export interface Transaction {
  created_at: string
  movement_type: MovementType
  stock_item: { id: number; name: string } | null
  location: { id: number; name: string } | null
  quantity_change: number
  quantity_before: number
  quantity_after: number
  reference_type: string
  reference_id: number | null
}

export interface TransactionsListResponse {
  transactions: Transaction[]
  pagination?: { total_items: number }
}

// ── Purchase Order ──
export type PurchaseOrderStatus = 'DRAFT' | 'SENT' | 'CONFIRMED' | 'PARTIAL' | 'RECEIVED' | 'CANCELED'
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID'

export interface PurchaseOrderItem {
  item?: { id: number; name: string }
  stock_item_name?: string
  quantity_ordered: number
  quantity_received: number
  unit_price?: string
  price?: string
}

export interface PurchaseOrder {
  id: number
  order_number: string
  supplier: { id: number; name: string } | null
  delivery_location: { id: number; name: string } | null
  status: PurchaseOrderStatus
  payment_status: PaymentStatus
  order_date: string
  expected_delivery_date: string | null
  total?: string
  subtotal?: string
  currency: string
  notes: string
  items?: PurchaseOrderItem[]
  line_items?: PurchaseOrderItem[]
}

export interface PurchaseOrdersListResponse {
  orders: PurchaseOrder[]
  pagination?: { total_items: number }
}

// ── Production Order ──
export type ProductionOrderStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'ON_HOLD'
export type ProductionPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'

export interface ProductionOrder {
  id: number
  order_number: string
  recipe: { id: number; name: string } | null
  recipe_id: number | null
  status: ProductionOrderStatus
  priority: ProductionPriority
  batch_multiplier: number
  source_location_id: number | null
  output_location_id: number | null
  source_location: { id: number; name: string } | null
  output_location: { id: number; name: string } | null
  planned_start_date: string | null
  expected_output_qty: number
  output_unit: { short_name: string } | null
  notes: string
  created_by_id: number | null
}

export interface ProductionOrdersListResponse {
  orders: ProductionOrder[]
  pagination?: { total_items: number }
}

// ── Stock Count ──
export type CountType = 'FULL' | 'PARTIAL' | 'CYCLE' | 'SPOT'
export type CountStatus = 'DRAFT' | 'IN_PROGRESS' | 'PENDING_APPROVAL' | 'APPROVED' | 'CANCELED'

export interface StockCount {
  id: number
  count_number: string
  location: { id: number; name: string } | null
  location_id: number | null
  count_type: CountType
  status: CountStatus
  items_counted: number
  count_items?: unknown[]
  created_at: string
  notes: string
}

export interface StockCountsListResponse {
  counts: StockCount[]
  pagination?: { total_items: number }
}
