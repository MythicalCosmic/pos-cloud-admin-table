export type ExpenseSource = 'DRAWER' | 'SAFE' | 'BANK'

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
  created_by?: ExpenseActor | null
  updated_by?: ExpenseActor | null
  created_at?: string
  updated_at?: string
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
  category: Pick<ExpenseCategory, 'id' | 'code' | 'name' | 'reporting_group' | 'is_active'> | null
  category_id: number | null
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
