export type ExpenseSource = 'DRAWER' | 'SAFE' | 'BANK'

export type ExpenseCostBehavior =
  | 'UNCLASSIFIED'
  | 'FIXED'
  | 'VARIABLE'
  | 'MIXED'
  | 'ONE_TIME'

export type ExpenseStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'
  | 'CANCELED'
  | 'VOIDED'

export interface ExpenseActor {
  id: number
  name: string
}

export interface ExpenseCategory {
  id: number
  uuid?: string
  code: string
  name: string
  description: string
  budget_limit: string | null
  reporting_group: string
  is_active: boolean
  sort_order: number
  allowed_sources: ExpenseSource[]
  requires_receipt: boolean
  requires_description: boolean
  expense_count: number
  parent_id?: number | null
  parent?: {
    id: number
    uuid?: string
    code: string
    name: string
    is_active: boolean
  } | null
  depth?: 0 | 1
  path?: string[]
  cost_behavior?: ExpenseCostBehavior
  direct_expense_count?: number
  descendant_expense_count?: number
  subtree_expense_count?: number
  child_count?: number
  active_child_count?: number
  is_selectable?: boolean
  created_by?: ExpenseActor | null
  updated_by?: ExpenseActor | null
  created_at?: string
  updated_at?: string
}

export interface ExpenseCategorySnapshot {
  id: number
  code: string
  name: string
  parent?: { code?: string; name: string } | null
  path?: string[]
  cost_behavior?: ExpenseCostBehavior
  reporting_group: string
  is_active: boolean
}

export interface ExpenseTransition {
  id: number
  previous_status: ExpenseStatus | null
  new_status: ExpenseStatus
  actor: ExpenseActor | null
  reason: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface ExpenseRecord {
  id: number
  uuid: string
  category: ExpenseCategorySnapshot | null
  category_id: number | null
  supplier?: { id: number; name: string } | null
  amount: string
  amount_uzs: number
  fee_uzs: number
  fee_percent: string | null
  total_debited_uzs: number
  description: string
  expense_date: string
  requested_source: ExpenseSource | null
  source_account: ExpenseSource | null
  shift_id: number | null
  status: ExpenseStatus
  receipt_number: string
  receipt?: { has_file: boolean; download_path: string | null }
  created_by: ExpenseActor | null
  approved_by: ExpenseActor | null
  paid_by: ExpenseActor | null
  canceled_by: ExpenseActor | null
  voided_by: ExpenseActor | null
  notes: string
  cancel_reason: string
  void_reason: string
  approved_at: string | null
  rejected_at: string | null
  paid_at: string | null
  canceled_at: string | null
  voided_at: string | null
  created_at: string
  updated_at: string
  transitions?: ExpenseTransition[]
}

export interface ExpensePagination {
  page: number
  per_page: number
  total: number
  total_pages: number
}

export interface ExpenseStatusTotal {
  amount_uzs: number
  count: number
}

export interface ExpenseTotals {
  row_count: number
  amount_uzs: number
  by_status: Partial<Record<ExpenseStatus, ExpenseStatusTotal>>
}

export interface ExpenseCategoryPayload {
  name: string
  code?: string
  description: string
  budget_limit: number | null
  reporting_group: string
  is_active: boolean
  sort_order: number
  allowed_sources: ExpenseSource[]
  requires_receipt: boolean
  requires_description: boolean
  parent_id: number | null
  cost_behavior: ExpenseCostBehavior
}

export interface ExpenseCreatePayload {
  category_id: number
  amount_uzs: number
  requested_source: 'SAFE' | 'BANK'
  expense_date: string
  description: string
  receipt_number: string
  notes: string
}

export interface ExpenseReclassificationPayload {
  expense_ids: number[]
  category_id: number
  expected_category_id?: number
  reason: string
  dry_run: boolean
}

export interface ExpenseReclassificationBreakdown {
  id?: number
  category_id?: number
  code?: string
  name?: string
  source_account?: ExpenseSource
  count: number
  amount_uzs: number
  path?: string[]
}

export interface ExpenseReclassificationResult {
  row_count: number
  total_amount_uzs: number
  current_category_breakdown?: ExpenseReclassificationBreakdown[]
  source_breakdown?: ExpenseReclassificationBreakdown[]
  target_category?: Partial<ExpenseCategorySnapshot> & { id?: number }
  target_path?: string[]
  target_cost_behavior?: ExpenseCostBehavior
  target_reporting_group?: string
  expenses?: ExpenseRecord[]
}
