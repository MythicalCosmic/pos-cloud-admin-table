export type MoneyControlEntityId = string | number

/**
 * Decimal money and quantity values are intentionally not coerced to IEEE-754
 * numbers. Django/DRF commonly serializes Decimal values as strings and the UI
 * must not lose precision while transporting or displaying them.
 */
export type DecimalValue = string | number

export interface MoneyControlOverviewParams {
  date_from?: string
  date_to?: string
  location_id?: MoneyControlEntityId
}

export interface MoneyControlLocation {
  id: MoneyControlEntityId
  name: string
}

export interface MoneyControlIssue {
  code: string
  severity: string
  title: string | null
  message: string | null
  entityType: string | null
  entityId: MoneyControlEntityId | null
  amountUzs: DecimalValue | null
  details: Record<string, unknown>
}

export interface MoneyControlCompleteness {
  status: string | null
  issues: MoneyControlIssue[]
}

export interface MoneyControlPeriod {
  dateFrom: string | null
  dateTo: string | null
  timezone: string | null
}

export interface MoneyControlTreasury {
  drawerUnreconciledUzs: DecimalValue | null
  safeUzs: DecimalValue | null
  bankUzs: DecimalValue | null
  liquidTotalUzs: DecimalValue | null
}

export interface SupplierBalanceSummaryRow {
  supplierId: MoneyControlEntityId | null
  supplierName: string
  balanceUzs: DecimalValue | null
  payableUzs: DecimalValue | null
  creditUzs: DecimalValue | null
  overduePayableUzs: DecimalValue | null
  currency: string | null
}

export interface MoneyControlSuppliers {
  payableUzs: DecimalValue | null
  creditUzs: DecimalValue | null
  overduePayableUzs: DecimalValue | null
  countWithBalance: number | null
  topBalances: SupplierBalanceSummaryRow[]
}

export interface MoneyControlInventory {
  rawMaterialValueUzs: DecimalValue | null
  rawAvailableValueUzs: DecimalValue | null
  rawItemCount: number | null
  lowStockCount: number | null
  outOfStockCount: number | null
  valuationMethod: string | null
}

export interface ExpenseCategorySummaryRow {
  categoryId: MoneyControlEntityId | null
  categoryName: string
  paidUzs: DecimalValue | null
  transactionCount: number | null
}

export interface MoneyControlExpenses {
  paidUzs: DecimalValue | null
  pendingUzs: DecimalValue | null
  approvedUnpaidUzs: DecimalValue | null
  byCategory: ExpenseCategorySummaryRow[]
}

export interface MoneyControlWorkingCapital {
  amountUzs: DecimalValue | null
  formula: string | null
}

export interface MoneyControlReconciliation {
  status: string | null
  issues: MoneyControlIssue[]
}

export interface MoneyControlOverview {
  asOf: string | null
  period: MoneyControlPeriod
  completeness: MoneyControlCompleteness
  treasury: MoneyControlTreasury
  suppliers: MoneyControlSuppliers
  inventory: MoneyControlInventory
  expenses: MoneyControlExpenses
  workingCapital: MoneyControlWorkingCapital
  reconciliation: MoneyControlReconciliation
}

export type CashPositionStatus = 'ESTIMATED' | 'REVIEW_REQUIRED' | 'UNAVAILABLE' | string

export interface CashPositionCalculation {
  asOfDate: string | null
  elapsedDays: number
  currentMonthDays: number
  previousMonthStart: string | null
  previousMonthEnd: string | null
  previousMonthDays: number
}

export interface CashPositionFunds {
  safeUzs: DecimalValue | null
  bankUzs: DecimalValue | null
  totalUzs: DecimalValue | null
}

export interface CashPositionSupplierDebtRow {
  supplierId: MoneyControlEntityId | null
  supplierName: string
  amountUzs: DecimalValue | null
  storedBalanceUzs: DecimalValue | null
  ledgerBalanceUzs: DecimalValue | null
  currency: string | null
  evidenceStatus: string
  calculationBasis: string
}

export interface CashPositionSupplierDebts {
  totalUzs: DecimalValue | null
  count: number
  reviewRequiredCount: number
  rows: CashPositionSupplierDebtRow[]
  usesConservativeBalance: boolean
}

export interface CashPositionPayroll {
  monthlyBaselineUzs: DecimalValue
  accruedEstimateUzs: DecimalValue
  paidCurrentPeriodUzs: DecimalValue
  dueEstimateUzs: DecimalValue
  employeeCount: number
  sourceCounts: Record<string, number>
  elapsedDays: number
  currentMonthDays: number
  previousMonthDays: number
}

export interface CashPositionMonthlyCostRow {
  rowKey: string
  recurringCostId: number | null
  name: string
  reportingGroup: string
  basis: 'FIXED_MONTHLY' | 'PREVIOUS_MONTH_ACTUAL' | string
  monthlyBaselineUzs: DecimalValue
  elapsedDays: number
  divisorDays: number
  accruedEstimateUzs: DecimalValue
  isActive: boolean
  startDate: string | null
  endDate: string | null
}

export interface CashPositionMonthlyCostGroup {
  reportingGroup: string
  plannedMonthlyUzs: DecimalValue
  accruedToDateUzs: DecimalValue
  paidCurrentPeriodUzs: DecimalValue
  remainingUzs: DecimalValue
  rowKeys: string[]
}

export interface CashPositionMonthlyCosts {
  groups: CashPositionMonthlyCostGroup[]
  accruedEstimateUzs: DecimalValue
  paidCurrentPeriodUzs: DecimalValue
  dueEstimateUzs: DecimalValue
  fixedAccruedEstimateUzs: DecimalValue
  historicalAccruedEstimateUzs: DecimalValue
  fixedScheduleCount: number
  historicalUtilityCount: number
  rows: CashPositionMonthlyCostRow[]
}

export interface CashPosition {
  asOf: string | null
  status: CashPositionStatus
  currency: string
  calculation: CashPositionCalculation
  funds: CashPositionFunds
  supplierDebts: CashPositionSupplierDebts
  payroll: CashPositionPayroll
  monthlyCosts: CashPositionMonthlyCosts
  positions: {
    afterSuppliersUzs: DecimalValue | null
    afterPayrollUzs: DecimalValue | null
    finalUzs: DecimalValue | null
  }
  formula: string | null
  dataQuality: MoneyControlCompleteness
  canManageRecurringCosts: boolean
}

export interface RecurringCostPayload {
  name: string
  reporting_group: 'RENT' | 'UTILITIES' | 'OPERATING' | 'TAXES' | string
  monthly_amount: number
  start_date?: string
  end_date?: string | null
  is_active?: boolean
  note?: string
}

export interface RawInventoryParams {
  location_id?: MoneyControlEntityId
  category_id?: MoneyControlEntityId
  search?: string
  low_stock?: boolean
  page?: number
  per_page?: number
}

export interface InventoryReference {
  id: MoneyControlEntityId | null
  name: string
  code: string | null
}

export interface PreferredSupplier {
  supplierId: MoneyControlEntityId | null
  supplierName: string
  price: DecimalValue | null
  currency: string | null
  currentBalanceUzs: DecimalValue | null
  leadTimeDays: number | null
}

export interface RawInventoryRow {
  stockItem: InventoryReference
  category: InventoryReference | null
  baseUnit: InventoryReference | null
  location: InventoryReference | null
  quantity: DecimalValue | null
  reservedQuantity: DecimalValue | null
  availableQuantity: DecimalValue | null
  pendingInQuantity: DecimalValue | null
  pendingOutQuantity: DecimalValue | null
  averageCostUzs: DecimalValue | null
  inventoryValueUzs: DecimalValue | null
  availableValueUzs: DecimalValue | null
  reorderPoint: DecimalValue | null
  isLowStock: boolean | null
  isOutOfStock: boolean | null
  preferredSupplier: PreferredSupplier | null
}

export interface RawInventorySummary {
  inventoryValueUzs: DecimalValue | null
  availableValueUzs: DecimalValue | null
  rawItemCount: number | null
  lowStockCount: number | null
  outOfStockCount: number | null
  supplierPayableUzs: DecimalValue | null
  supplierCreditUzs: DecimalValue | null
  valuationMethod: string | null
  asOf: string | null
}

export interface MoneyControlPagination {
  total: number | null
  page: number
  perPage: number
  totalPages: number | null
}

export interface RawInventoryResult {
  completeness: MoneyControlCompleteness
  issues: MoneyControlIssue[]
  summary: RawInventorySummary
  items: RawInventoryRow[]
  pagination: MoneyControlPagination
}

export type MoneyControlApiErrorKind =
  | 'integration-unavailable'
  | 'forbidden'
  | 'network'
  | 'server'
  | 'request'
  | 'unknown'

export interface MoneyControlApiErrorInfo {
  kind: MoneyControlApiErrorKind
  status: number | null
  code: string | null
  message: string | null
}
