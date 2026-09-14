import type { ExpenseCategory, ExpenseCategorySnapshot, ExpenseCostBehavior, ExpenseSource } from '@/types/expenseControl'

export const EXPENSE_COST_BEHAVIORS: ExpenseCostBehavior[] = [
  'UNCLASSIFIED',
  'FIXED',
  'VARIABLE',
  'MIXED',
  'ONE_TIME',
]

type CategoryIdentity = Pick<ExpenseCategory, 'name' | 'path' | 'parent' | 'cost_behavior' | 'is_active' | 'is_selectable' | 'allowed_sources'>
  | Pick<ExpenseCategorySnapshot, 'name' | 'path' | 'parent' | 'cost_behavior' | 'is_active'>

export function expenseCategoryPath(category: CategoryIdentity | null | undefined): string {
  if (!category)
    return ''

  const path = category.path?.map(part => String(part).trim()).filter(Boolean)
  if (path?.length)
    return path.join(' / ')

  const parentName = category.parent?.name?.trim()

  return parentName ? `${parentName} / ${category.name}` : category.name
}

export function expenseCostBehavior(category: CategoryIdentity | null | undefined): ExpenseCostBehavior {
  return category?.cost_behavior ?? 'UNCLASSIFIED'
}

export function isSelectableExpenseCategory(category: ExpenseCategory): boolean {
  return category.is_active !== false && category.is_selectable !== false
}

export function expenseCategoryAllowsSource(category: ExpenseCategory, source: ExpenseSource): boolean {
  return !Array.isArray(category.allowed_sources) || category.allowed_sources.includes(source)
}
