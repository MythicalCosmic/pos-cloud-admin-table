import type {
  CashPosition,
  CashPositionMonthlyCostRow,
  CashPositionSupplierDebtRow,
  DecimalValue,
  ExpenseCategorySummaryRow,
  InventoryReference,
  MoneyControlApiErrorInfo,
  MoneyControlCompleteness,
  MoneyControlEntityId,
  MoneyControlIssue,
  MoneyControlLocation,
  MoneyControlOverview,
  MoneyControlOverviewParams,
  MoneyControlReconciliation,
  PreferredSupplier,
  RawInventoryParams,
  RawInventoryResult,
  RawInventoryRow,
  RecurringCostPayload,
  SupplierBalanceSummaryRow,
} from '@/types/moneyControl'
import axiosIns, { stockApi } from '@/plugins/axios'

type ApiRecord = Record<string, unknown>

function isRecord(value: unknown): value is ApiRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function record(value: unknown): ApiRecord {
  return isRecord(value) ? value : {}
}

function unwrapResponse(value: unknown): unknown {
  const response = record(value)
  const body = record(response.data)

  // Axios puts the HTTP body under response.data. The APIs may then wrap the
  // business payload once more as { success, data }.
  if ('data' in body && (typeof body.success === 'boolean' || Object.keys(body).length <= 3))
    return body.data

  return response.data
}

function decimal(value: unknown): DecimalValue | null {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null

  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
    return value

  return null
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '')
    return null

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

function booleanOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean')
    return value
  if (value === 1 || value === '1' || value === 'true')
    return true
  if (value === 0 || value === '0' || value === 'false')
    return false

  return null
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined)
    return null

  const normalized = String(value).trim()

  return normalized || null
}

function entityId(value: unknown): MoneyControlEntityId | null {
  return (typeof value === 'string' || typeof value === 'number') ? value : null
}

function listFrom(value: unknown, keys: string[]): unknown[] {
  if (Array.isArray(value))
    return value

  const root = record(value)

  for (const key of keys) {
    const candidate = root[key]

    if (Array.isArray(candidate))
      return candidate
  }

  return []
}

function paramsWithoutEmpty(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== null && value !== undefined),
  )
}

function normalizeIssue(value: unknown): MoneyControlIssue {
  const issue = record(value)
  const details = record(issue.details ?? issue.metadata)

  return {
    code: stringOrNull(issue.code) ?? 'UNSPECIFIED',
    severity: stringOrNull(issue.severity ?? issue.level) ?? 'WARNING',
    title: stringOrNull(issue.title),
    message: stringOrNull(issue.message ?? issue.detail ?? issue.description),
    entityType: stringOrNull(issue.entity_type ?? issue.entityType),
    entityId: entityId(issue.entity_id ?? issue.entityId),
    amountUzs: decimal(issue.amount_uzs ?? issue.amountUzs),
    details,
  }
}

function normalizeCompleteness(value: unknown): MoneyControlCompleteness {
  const completeness = record(value)

  return {
    status: stringOrNull(completeness.status),
    issues: listFrom(completeness.issues, []).map(normalizeIssue),
  }
}

function normalizeReconciliation(value: unknown): MoneyControlReconciliation {
  const reconciliation = record(value)

  return {
    status: stringOrNull(reconciliation.status),
    issues: listFrom(reconciliation.issues, []).map(normalizeIssue),
  }
}

function normalizeSupplierBalance(value: unknown): SupplierBalanceSummaryRow {
  const balance = record(value)
  const supplier = record(balance.supplier)

  return {
    supplierId: entityId(balance.supplier_id ?? supplier.id),
    supplierName: stringOrNull(balance.supplier_name ?? supplier.name) ?? '',
    balanceUzs: decimal(balance.balance_uzs ?? balance.current_balance_uzs ?? balance.balance),
    payableUzs: decimal(balance.payable_uzs),
    creditUzs: decimal(balance.credit_uzs),
    overduePayableUzs: decimal(balance.overdue_payable_uzs),
    currency: stringOrNull(balance.currency),
  }
}

function normalizeExpenseCategory(value: unknown): ExpenseCategorySummaryRow {
  const row = record(value)
  const category = record(row.category)

  return {
    categoryId: entityId(row.category_id ?? category.id),
    categoryName: stringOrNull(row.category_name ?? category.name) ?? '',
    paidUzs: decimal(row.paid_uzs ?? row.amount_uzs ?? row.total_uzs),
    transactionCount: numberOrNull(row.transaction_count ?? row.count),
  }
}

// Compatibility aliases are deliberately kept in this boundary normalizer.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function normalizeMoneyControlOverview(value: unknown): MoneyControlOverview {
  const root = record(value)
  const period = record(root.period)
  const treasury = record(root.treasury)
  const suppliers = record(root.suppliers)
  const inventory = record(root.inventory)
  const expenses = record(root.expenses)
  const workingCapital = record(root.working_capital ?? root.workingCapital)

  return {
    asOf: stringOrNull(root.as_of ?? root.asOf),
    period: {
      dateFrom: stringOrNull(period.date_from ?? period.dateFrom),
      dateTo: stringOrNull(period.date_to ?? period.dateTo),
      timezone: stringOrNull(period.timezone),
    },
    completeness: normalizeCompleteness(root.completeness),
    treasury: {
      drawerUnreconciledUzs: decimal(treasury.drawer_unreconciled_uzs ?? treasury.drawerUnreconciledUzs),
      safeUzs: decimal(treasury.safe_uzs ?? treasury.safeUzs),
      bankUzs: decimal(treasury.bank_uzs ?? treasury.bankUzs),
      liquidTotalUzs: decimal(treasury.liquid_total_uzs ?? treasury.liquidTotalUzs),
    },
    suppliers: {
      payableUzs: decimal(suppliers.payable_uzs ?? suppliers.payableUzs),
      creditUzs: decimal(suppliers.credit_uzs ?? suppliers.creditUzs),
      overduePayableUzs: decimal(suppliers.overdue_payable_uzs ?? suppliers.overduePayableUzs),
      countWithBalance: numberOrNull(suppliers.count_with_balance ?? suppliers.countWithBalance),
      topBalances: listFrom(suppliers, ['top_balances', 'topBalances', 'items']).map(normalizeSupplierBalance),
    },
    inventory: {
      rawMaterialValueUzs: decimal(inventory.raw_material_value_uzs ?? inventory.rawMaterialValueUzs ?? inventory.inventory_value_uzs),
      rawAvailableValueUzs: decimal(inventory.raw_available_value_uzs ?? inventory.rawAvailableValueUzs ?? inventory.available_value_uzs),
      rawItemCount: numberOrNull(inventory.raw_item_count ?? inventory.rawItemCount),
      lowStockCount: numberOrNull(inventory.low_stock_count ?? inventory.lowStockCount),
      outOfStockCount: numberOrNull(inventory.out_of_stock_count ?? inventory.outOfStockCount),
      valuationMethod: stringOrNull(inventory.valuation_method ?? inventory.valuationMethod),
    },
    expenses: {
      paidUzs: decimal(expenses.paid_uzs ?? expenses.paidUzs),
      pendingUzs: decimal(expenses.pending_uzs ?? expenses.pendingUzs),
      approvedUnpaidUzs: decimal(expenses.approved_unpaid_uzs ?? expenses.approvedUnpaidUzs),
      byCategory: listFrom(expenses, ['by_category', 'byCategory', 'categories']).map(normalizeExpenseCategory),
    },
    workingCapital: {
      amountUzs: decimal(workingCapital.amount_uzs ?? workingCapital.amountUzs),
      formula: stringOrNull(workingCapital.formula),
    },
    reconciliation: normalizeReconciliation(root.reconciliation),
  }
}

function normalizeCashPositionSupplier(value: unknown): CashPositionSupplierDebtRow {
  const row = record(value)

  return {
    supplierId: entityId(row.supplier_id ?? row.supplierId),
    supplierName: stringOrNull(row.supplier_name ?? row.supplierName) ?? '',
    amountUzs: decimal(row.amount_uzs ?? row.amountUzs),
    storedBalanceUzs: decimal(row.stored_balance_uzs ?? row.storedBalanceUzs),
    ledgerBalanceUzs: decimal(row.ledger_balance_uzs ?? row.ledgerBalanceUzs),
    currency: stringOrNull(row.currency),
    evidenceStatus: stringOrNull(row.evidence_status ?? row.evidenceStatus) ?? 'UNKNOWN',
    calculationBasis: stringOrNull(row.calculation_basis ?? row.calculationBasis) ?? 'UNKNOWN',
  }
}

// Compatibility aliases are deliberately kept in this boundary normalizer.
// eslint-disable-next-line sonarjs/cognitive-complexity
function normalizeCashPositionCost(value: unknown, index: number): CashPositionMonthlyCostRow {
  const row = record(value)

  return {
    rowKey: stringOrNull(row.row_key ?? row.rowKey) ?? `cost-${index}`,
    recurringCostId: numberOrNull(row.recurring_cost_id ?? row.recurringCostId),
    name: stringOrNull(row.name) ?? '',
    reportingGroup: stringOrNull(row.reporting_group ?? row.reportingGroup) ?? 'OPERATING',
    basis: stringOrNull(row.basis) ?? 'FIXED_MONTHLY',
    monthlyBaselineUzs: decimal(row.monthly_baseline_uzs ?? row.monthlyBaselineUzs) ?? 0,
    elapsedDays: numberOrNull(row.elapsed_days ?? row.elapsedDays) ?? 0,
    divisorDays: numberOrNull(row.divisor_days ?? row.divisorDays) ?? 0,
    accruedEstimateUzs: decimal(row.accrued_estimate_uzs ?? row.accruedEstimateUzs) ?? 0,
    isActive: booleanOrNull(row.is_active ?? row.isActive) ?? true,
    startDate: stringOrNull(row.start_date ?? row.startDate),
    endDate: stringOrNull(row.end_date ?? row.endDate),
  }
}

// Compatibility aliases are deliberately kept in this boundary normalizer.
// eslint-disable-next-line sonarjs/cognitive-complexity
export function normalizeCashPosition(value: unknown): CashPosition {
  const root = record(value)
  const calculation = record(root.calculation)
  const funds = record(root.funds)
  const supplierDebts = record(root.supplier_debts ?? root.supplierDebts)
  const payroll = record(root.payroll)
  const monthlyCosts = record(root.monthly_costs ?? root.monthlyCosts)
  const positions = record(root.positions)
  const sourceCounts = record(payroll.source_counts ?? payroll.sourceCounts)

  return {
    asOf: stringOrNull(root.as_of ?? root.asOf),
    status: stringOrNull(root.status) ?? 'UNAVAILABLE',
    currency: stringOrNull(root.currency) ?? 'UZS',
    calculation: {
      asOfDate: stringOrNull(calculation.as_of_date ?? calculation.asOfDate),
      elapsedDays: numberOrNull(calculation.elapsed_days ?? calculation.elapsedDays) ?? 0,
      currentMonthDays: numberOrNull(calculation.current_month_days ?? calculation.currentMonthDays) ?? 0,
      previousMonthStart: stringOrNull(calculation.previous_month_start ?? calculation.previousMonthStart),
      previousMonthEnd: stringOrNull(calculation.previous_month_end ?? calculation.previousMonthEnd),
      previousMonthDays: numberOrNull(calculation.previous_month_days ?? calculation.previousMonthDays) ?? 0,
    },
    funds: {
      safeUzs: decimal(funds.safe_uzs ?? funds.safeUzs),
      bankUzs: decimal(funds.bank_uzs ?? funds.bankUzs),
      totalUzs: decimal(funds.total_uzs ?? funds.totalUzs),
    },
    supplierDebts: {
      totalUzs: decimal(supplierDebts.total_uzs ?? supplierDebts.totalUzs),
      count: numberOrNull(supplierDebts.count) ?? 0,
      reviewRequiredCount: numberOrNull(
        supplierDebts.review_required_count ?? supplierDebts.reviewRequiredCount,
      ) ?? 0,
      rows: listFrom(supplierDebts, ['rows', 'items']).map(normalizeCashPositionSupplier),
      usesConservativeBalance: booleanOrNull(
        supplierDebts.uses_conservative_balance ?? supplierDebts.usesConservativeBalance,
      ) ?? false,
    },
    payroll: {
      monthlyBaselineUzs: decimal(payroll.monthly_baseline_uzs ?? payroll.monthlyBaselineUzs) ?? 0,
      accruedEstimateUzs: decimal(payroll.accrued_estimate_uzs ?? payroll.accruedEstimateUzs) ?? 0,
      paidCurrentPeriodUzs: decimal(payroll.paid_current_period_uzs ?? payroll.paidCurrentPeriodUzs) ?? 0,
      dueEstimateUzs: decimal(payroll.due_estimate_uzs ?? payroll.dueEstimateUzs) ?? 0,
      employeeCount: numberOrNull(payroll.employee_count ?? payroll.employeeCount) ?? 0,
      sourceCounts: Object.fromEntries(
        Object.entries(sourceCounts).map(([key, count]) => [key, numberOrNull(count) ?? 0]),
      ),
      elapsedDays: numberOrNull(payroll.elapsed_days ?? payroll.elapsedDays) ?? 0,
      currentMonthDays: numberOrNull(payroll.current_month_days ?? payroll.currentMonthDays) ?? 0,
      previousMonthDays: numberOrNull(payroll.previous_month_days ?? payroll.previousMonthDays) ?? 0,
    },
    monthlyCosts: {
      accruedEstimateUzs: decimal(
        monthlyCosts.accrued_estimate_uzs ?? monthlyCosts.accruedEstimateUzs,
      ) ?? 0,
      paidCurrentPeriodUzs: decimal(
        monthlyCosts.paid_current_period_uzs ?? monthlyCosts.paidCurrentPeriodUzs,
      ) ?? 0,
      dueEstimateUzs: decimal(monthlyCosts.due_estimate_uzs ?? monthlyCosts.dueEstimateUzs) ?? 0,
      fixedAccruedEstimateUzs: decimal(
        monthlyCosts.fixed_accrued_estimate_uzs ?? monthlyCosts.fixedAccruedEstimateUzs,
      ) ?? 0,
      historicalAccruedEstimateUzs: decimal(
        monthlyCosts.historical_accrued_estimate_uzs ?? monthlyCosts.historicalAccruedEstimateUzs,
      ) ?? 0,
      fixedScheduleCount: numberOrNull(
        monthlyCosts.fixed_schedule_count ?? monthlyCosts.fixedScheduleCount,
      ) ?? 0,
      historicalUtilityCount: numberOrNull(
        monthlyCosts.historical_utility_count ?? monthlyCosts.historicalUtilityCount,
      ) ?? 0,
      rows: listFrom(monthlyCosts, ['rows', 'items']).map(normalizeCashPositionCost),
    },
    positions: {
      afterSuppliersUzs: decimal(positions.after_suppliers_uzs ?? positions.afterSuppliersUzs),
      afterPayrollUzs: decimal(positions.after_payroll_uzs ?? positions.afterPayrollUzs),
      finalUzs: decimal(positions.final_uzs ?? positions.finalUzs),
    },
    formula: stringOrNull(root.formula),
    dataQuality: normalizeCompleteness(root.data_quality ?? root.dataQuality),
    canManageRecurringCosts: booleanOrNull(
      root.can_manage_recurring_costs ?? root.canManageRecurringCosts,
    ) ?? false,
  }
}

function normalizeReference(value: unknown, fallback: ApiRecord = {}): InventoryReference | null {
  const source = isRecord(value) ? value : fallback
  const id = entityId(source.id ?? source.uuid)
  const name = stringOrNull(source.name ?? source.title)
  const code = stringOrNull(source.code ?? source.sku ?? source.barcode)

  if (id === null && name === null && code === null)
    return null

  return { id, name: name ?? '', code }
}

function normalizePreferredSupplier(value: unknown): PreferredSupplier | null {
  const preferred = record(value)
  const supplier = record(preferred.supplier)
  const supplierId = entityId(preferred.supplier_id ?? supplier.id)
  const supplierName = stringOrNull(preferred.supplier_name ?? supplier.name)

  if (supplierId === null && supplierName === null)
    return null

  return {
    supplierId,
    supplierName: supplierName ?? '',
    price: decimal(preferred.price ?? preferred.unit_price),
    currency: stringOrNull(preferred.currency),
    currentBalanceUzs: decimal(preferred.current_balance_uzs ?? preferred.balance_uzs),
    leadTimeDays: numberOrNull(preferred.lead_time_days ?? preferred.lead_time),
  }
}

function normalizeRawInventoryRow(value: unknown): RawInventoryRow {
  const row = record(value)

  const item = normalizeReference(row.stock_item ?? row.item, {
    id: row.stock_item_id ?? row.item_id ?? row.id,
    name: row.stock_item_name ?? row.item_name ?? row.name,
    code: row.sku ?? row.code ?? row.barcode,
  }) ?? { id: null, name: '', code: null }

  return {
    stockItem: item,
    category: normalizeReference(row.category, {
      id: row.category_id,
      name: row.category_name,
    }),
    baseUnit: normalizeReference(row.base_unit ?? row.unit, {
      id: row.base_unit_id ?? row.unit_id,
      name: row.base_unit_name ?? row.unit_name,
      code: row.base_unit_code ?? row.unit_code,
    }),
    location: normalizeReference(row.location, {
      id: row.location_id,
      name: row.location_name,
    }),
    quantity: decimal(row.quantity),
    reservedQuantity: decimal(row.reserved_quantity),
    availableQuantity: decimal(row.available_quantity),
    pendingInQuantity: decimal(row.pending_in_quantity),
    pendingOutQuantity: decimal(row.pending_out_quantity),
    averageCostUzs: decimal(row.avg_cost_uzs ?? row.average_cost_uzs),
    inventoryValueUzs: decimal(row.inventory_value_uzs),
    availableValueUzs: decimal(row.available_value_uzs),
    reorderPoint: decimal(row.reorder_point),
    isLowStock: booleanOrNull(row.is_low_stock),
    isOutOfStock: booleanOrNull(row.is_out_of_stock),
    preferredSupplier: normalizePreferredSupplier(row.preferred_supplier),
  }
}

export function normalizeRawInventory(value: unknown, params: RawInventoryParams = {}): RawInventoryResult {
  const root = record(value)
  const summary = record(root.summary)
  const pagination = record(root.pagination ?? root.meta)
  const items = listFrom(root, ['items', 'results', 'rows']).map(normalizeRawInventoryRow)

  const perPage = numberOrNull(pagination.per_page ?? pagination.page_size ?? root.per_page)
    ?? params.per_page
    ?? Math.max(items.length, 1)

  const total = numberOrNull(pagination.total ?? pagination.total_items ?? pagination.count ?? root.total ?? root.total_items)

  return {
    completeness: normalizeCompleteness(root.completeness),
    issues: listFrom(root.issues, []).map(normalizeIssue),
    summary: {
      inventoryValueUzs: decimal(summary.inventory_value_uzs),
      availableValueUzs: decimal(summary.available_value_uzs),
      rawItemCount: numberOrNull(summary.raw_item_count),
      lowStockCount: numberOrNull(summary.low_stock_count),
      outOfStockCount: numberOrNull(summary.out_of_stock_count),
      supplierPayableUzs: decimal(summary.supplier_payable_uzs),
      supplierCreditUzs: decimal(summary.supplier_credit_uzs),
      valuationMethod: stringOrNull(summary.valuation_method),
      asOf: stringOrNull(summary.as_of ?? root.as_of),
    },
    items,
    pagination: {
      total,
      page: numberOrNull(pagination.page ?? pagination.current_page ?? root.page) ?? params.page ?? 1,
      perPage,
      totalPages: numberOrNull(pagination.total_pages)
        ?? (total === null ? null : Math.ceil(total / perPage)),
    },
  }
}

export async function fetchMoneyControlOverview(params: MoneyControlOverviewParams = {}): Promise<MoneyControlOverview> {
  const response = await axiosIns.get('/money-control/overview', {
    params: paramsWithoutEmpty(params as Record<string, unknown>),
  })

  return normalizeMoneyControlOverview(unwrapResponse(response))
}

export async function fetchCashPosition(): Promise<CashPosition> {
  const response = await axiosIns.get('/money-control/cash-position')

  return normalizeCashPosition(unwrapResponse(response))
}

export async function createCashPositionRecurringCost(payload: RecurringCostPayload): Promise<void> {
  await axiosIns.post('/money-control/recurring-costs', payload)
}

export async function updateCashPositionRecurringCost(
  id: number,
  payload: Partial<RecurringCostPayload>,
): Promise<void> {
  await axiosIns.patch(`/money-control/recurring-costs/${id}`, payload)
}

export async function fetchRawInventory(params: RawInventoryParams = {}): Promise<RawInventoryResult> {
  const response = await stockApi.get('/inventory-control/', {
    params: paramsWithoutEmpty({ ...params, item_type: 'RAW' }),
  })

  return normalizeRawInventory(unwrapResponse(response), params)
}

export async function fetchMoneyControlLocations(): Promise<MoneyControlLocation[]> {
  const response = await stockApi.get('/locations/', { params: { per_page: 200 } })

  return listFrom(unwrapResponse(response), ['locations', 'items', 'results'])
    .map(value => {
      const location = record(value)

      return {
        id: entityId(location.id ?? location.uuid),
        name: stringOrNull(location.name ?? location.title),
      }
    })
    .filter((location): location is MoneyControlLocation => location.id !== null && location.name !== null)
}

export function classifyMoneyControlApiError(error: unknown): MoneyControlApiErrorInfo {
  const errorRecord = record(error)

  if (errorRecord.isAxiosError !== true)
    return { kind: 'unknown', status: null, code: null, message: null }

  const response = record(errorRecord.response)
  const status = numberOrNull(response.status)
  const data = record(response.data)
  const code = stringOrNull(data.code)
  const message = stringOrNull(data.message ?? data.detail ?? errorRecord.message)

  if (status !== null && [404, 405, 501].includes(status))
    return { kind: 'integration-unavailable', status, code, message }
  if (status === 403)
    return { kind: 'forbidden', status, code, message }
  if (status === null)
    return { kind: 'network', status, code, message }
  if (status >= 500)
    return { kind: 'server', status, code, message }

  return { kind: 'request', status, code, message }
}

export function isMoneyControlIntegrationUnavailable(error: unknown): boolean {
  return classifyMoneyControlApiError(error).kind === 'integration-unavailable'
}

export const moneyControlApi = {
  overview: fetchMoneyControlOverview,
  rawInventory: fetchRawInventory,
  locations: fetchMoneyControlLocations,
}
