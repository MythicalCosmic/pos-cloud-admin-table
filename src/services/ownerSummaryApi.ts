import { getDashboard } from '@/services/dashboardRequests'

export interface OwnerCategoryRow {
  parent: string
  name: string
  amount_uzs: number
  count: number
}

export interface OwnerCostBucket {
  total_uzs: number
  count: number
  categories: OwnerCategoryRow[]
}

export interface OwnerWarning {
  code: string
  count?: number
  amount_uzs?: number
}

export interface OwnerSummary {
  range: { from: string; to: string }
  sales: {
    gross_sales_uzs: number
    refunds_uzs: number
    net_sales_uzs: number
    paid_orders: number
  }
  costs: {
    suppliers: OwnerCostBucket & {
      from_expenses_uzs: number
      from_supplier_payments_uzs: number
      supplier_payment_count: number
    }
    operating: OwnerCostBucket
    payroll: OwnerCostBucket & {
      from_expenses_uzs: number
      from_salary_payments_uzs: number
      salary_payment_count: number
    }
    total_uzs: number
  }
  outside_profit: {
    owner_withdrawals: OwnerCostBucket
    capital_expenditure: OwnerCostBucket
    unclassified: OwnerCostBucket
  }
  profit: {
    raw_profit_uzs: number
    raw_margin_pct: string | null
    after_owner_withdrawals_uzs: number
  }
  balances: {
    safe_uzs: number
    bank_uzs: number
    total_uzs: number
    treasury_updated_at: string | null
    supplier_debt_uzs: number
    suppliers_with_debt: number
  }
  warnings: OwnerWarning[]
}

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOwnerSummary(value: unknown): value is OwnerSummary {
  return isRecord(value)
    && isRecord(value.sales) && typeof value.sales.net_sales_uzs === 'number'
    && isRecord(value.costs)
    && ['suppliers', 'operating', 'payroll'].every(key => isRecord(value.costs[key]) && typeof value.costs[key].total_uzs === 'number')
    && isRecord(value.profit) && typeof value.profit.raw_profit_uzs === 'number'
    && isRecord(value.balances) && typeof value.balances.safe_uzs === 'number'
    && Array.isArray(value.warnings)
}

export async function getOwnerSummary(params: Record<string, string>): Promise<OwnerSummary> {
  const response = await getDashboard('/dashboard/owner-summary', { params })
  const payload = response.data?.data ?? response.data

  // An incomplete payload is an error state, never a card of invented zeros.
  if (!isOwnerSummary(payload))
    throw new Error('Invalid owner summary response')

  return payload
}
