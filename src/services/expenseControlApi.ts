import axios from '@/plugins/axios'
import type {
  ExpenseCategory,
  ExpenseCategoryPayload,
  ExpenseCreatePayload,
  ExpensePagination,
  ExpenseRecord,
  ExpenseSource,
  ExpenseStatus,
  ExpenseTotals,
} from '@/types/expenseControl'

interface CategoryListParams {
  page?: number
  per_page?: number
  search?: string
  include_inactive?: boolean
}

interface ExpenseListParams {
  page?: number
  per_page?: number
  status?: ExpenseStatus | ''
  category_id?: number
  date_from?: string
  date_to?: string
  search?: string
}

type AllCategoryListParams = Omit<CategoryListParams, 'page' | 'per_page'>

function payloadOf(response: any): Record<string, any> {
  return response?.data?.data ?? response?.data ?? {}
}

export async function listExpenseCategories(params: CategoryListParams = {}) {
  const response = await axios.get('/expense-categories', { params })
  const data = payloadOf(response)

  return {
    categories: (data.categories ?? data.items ?? []) as ExpenseCategory[],
    pagination: (data.pagination ?? {}) as Partial<ExpensePagination>,
  }
}

export async function listAllExpenseCategories(params: AllCategoryListParams = {}) {
  const perPage = 100
  const first = await listExpenseCategories({ ...params, page: 1, per_page: perPage })
  const reportedTotalPages = Number(first.pagination.total_pages)
  const reportedTotal = Number(first.pagination.total)
  const serverPerPage = Number(first.pagination.per_page) || perPage
  let totalPages = 1

  if (Number.isInteger(reportedTotalPages) && reportedTotalPages > 0)
    totalPages = reportedTotalPages
  else if (Number.isFinite(reportedTotal) && reportedTotal > 0)
    totalPages = Math.ceil(reportedTotal / serverPerPage)

  const remainingPages = Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => index + 2)

  const remaining = await Promise.all(remainingPages.map(page =>
    listExpenseCategories({ ...params, page, per_page: perPage }),
  ))

  const unique = new Map<number, ExpenseCategory>()
  const results = [first, ...remaining]

  results.forEach(result => {
    result.categories.forEach(category => unique.set(category.id, category))
  })

  return [...unique.values()]
}

export async function createExpenseCategory(payload: ExpenseCategoryPayload) {
  const response = await axios.post('/expense-categories', payload)

  return payloadOf(response).category as ExpenseCategory
}

export async function updateExpenseCategory(id: number, payload: Partial<ExpenseCategoryPayload>) {
  const response = await axios.patch(`/expense-categories/${id}`, payload)

  return payloadOf(response).category as ExpenseCategory
}

export async function deactivateExpenseCategory(id: number) {
  const response = await axios.post(`/expense-categories/${id}/deactivate`)

  return payloadOf(response).category as ExpenseCategory
}

export async function listExpenses(params: ExpenseListParams = {}) {
  const response = await axios.get('/expenses', { params })
  const data = payloadOf(response)

  return {
    expenses: (data.expenses ?? data.items ?? []) as ExpenseRecord[],
    totals: (data.totals ?? {
      row_count: 0,
      amount_uzs: 0,
      by_status: {},
    }) as ExpenseTotals,
    pagination: (data.pagination ?? {}) as Partial<ExpensePagination>,
  }
}

export async function getExpense(id: number) {
  const response = await axios.get(`/expenses/${id}`)

  return payloadOf(response).expense as ExpenseRecord
}

export async function createExpense(payload: ExpenseCreatePayload) {
  const response = await axios.post('/expenses', payload)

  return payloadOf(response).expense as ExpenseRecord
}

export async function approveExpense(id: number) {
  const response = await axios.post(`/expenses/${id}/approve`)

  return payloadOf(response).expense as ExpenseRecord
}

export async function rejectExpense(id: number, reason: string) {
  const response = await axios.post(`/expenses/${id}/reject`, { reason })

  return payloadOf(response).expense as ExpenseRecord
}

export async function payExpense(
  id: number,
  payload: { source_account: ExpenseSource; fee_percent?: string; note?: string },
) {
  const response = await axios.post(`/expenses/${id}/pay`, payload)

  return payloadOf(response)
}

export async function cancelExpense(id: number, reason = '') {
  const response = await axios.post(`/expenses/${id}/cancel`, { reason })

  return payloadOf(response).expense as ExpenseRecord
}

export async function voidExpense(id: number, reason: string) {
  const response = await axios.post(`/expenses/${id}/void`, { reason })

  return payloadOf(response).expense as ExpenseRecord
}
