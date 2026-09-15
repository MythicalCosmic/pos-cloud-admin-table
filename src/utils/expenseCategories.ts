import type { ExpenseCategory, ExpenseCategorySnapshot, ExpenseCostBehavior, ExpenseSource } from '@/types/expenseControl'
import { fmtNum } from '@/components/design/utils/format'

export const EXPENSE_COST_BEHAVIORS: ExpenseCostBehavior[] = [
  'UNCLASSIFIED',
  'FIXED',
  'VARIABLE',
  'MIXED',
  'ONE_TIME',
]

export const EXPENSE_REPORTING_GROUPS = [
  'INVENTORY_PURCHASE',
  'PAYROLL',
  'RENT',
  'UTILITIES',
  'OPERATING',
  'WASTE_SPOILAGE',
  'FINANCE_FEES',
  'DEPRECIATION',
  'TAXES',
  'CAPITAL_EXPENDITURE',
  'OWNER_DRAW',
  'NON_BUSINESS',
  'REVIEW',
] as const

type Translate = (key: string, values?: Record<string, unknown>) => string

type CategoryIdentity = Pick<ExpenseCategory, 'name' | 'path' | 'parent' | 'cost_behavior' | 'is_active' | 'is_selectable' | 'allowed_sources'>
  | Pick<ExpenseCategorySnapshot, 'name' | 'path' | 'parent' | 'cost_behavior' | 'is_active'>

export interface ExpenseCategoryGroup {
  category: ExpenseCategory
  children: ExpenseCategory[]
}

export interface ExpenseCategoryOption {
  value: string
  label: string
  keywords?: string
  disabled?: boolean
  depth?: number
  description?: string
  meta?: string
  group?: boolean
  selectedLabel?: string
}

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

/** Groups tree-ordered categories; a subcategory whose parent is not loaded stays visible as a root. */
export function expenseCategoryTree(categories: ExpenseCategory[]): ExpenseCategoryGroup[] {
  const ids = new Set(categories.map(category => category.id))
  const groups = new Map<number, ExpenseCategoryGroup>()

  for (const category of categories) {
    if (category.parent_id == null || !ids.has(category.parent_id))
      groups.set(category.id, { category, children: [] })
  }
  for (const category of categories) {
    if (category.parent_id != null)
      groups.get(category.parent_id)?.children.push(category)
  }

  const ordered = [...groups.values()]

  // Keep retired top-level categories after the active tree.
  return [
    ...ordered.filter(group => group.category.is_active !== false),
    ...ordered.filter(group => group.category.is_active === false),
  ]
}

export function expenseCategoryExpenseCount(category: ExpenseCategory, includesChildren: boolean): number {
  const count = includesChildren ? category.subtree_expense_count : category.direct_expense_count

  return Number(count ?? category.expense_count ?? 0)
}

/** Filter choices: a group selects all of its subcategories; a subcategory selects only itself. */
export function expenseCategoryFilterOptions(categories: ExpenseCategory[], t: Translate): ExpenseCategoryOption[] {
  return expenseCategoryTree(categories).flatMap(({ category, children }) => {
    const isGroup = children.length > 0

    const description = [
      isGroup ? t('expense_picker_group_hint', { count: children.length }) : '',
      category.is_active === false ? t('expcat_status_INACTIVE') : '',
    ].filter(Boolean).join(' · ')

    const parent: ExpenseCategoryOption = {
      value: String(category.id),
      label: category.name,
      keywords: [category.code, ...children.flatMap(child => [child.name, child.code])].join(' '),
      group: isGroup,
      description: description || undefined,
      meta: fmtNum(expenseCategoryExpenseCount(category, isGroup)),
      selectedLabel: isGroup ? t('expense_picker_group_selected', { name: category.name }) : expenseCategoryPath(category),
    }

    const subcategories = children.map(child => ({
      value: String(child.id),
      label: child.name,
      keywords: `${child.code} ${category.name}`,
      depth: 1,
      description: child.is_active === false ? t('expcat_status_INACTIVE') : undefined,
      meta: fmtNum(expenseCategoryExpenseCount(child, false)),
      selectedLabel: `${category.name} › ${child.name}`,
    }))

    return [parent, ...subcategories]
  })
}

/** Choices for new or reclassified expenses: groups are headings and only selectable categories can be chosen. */
export function expenseCategoryRequestOptions(
  categories: ExpenseCategory[],
  t: Translate,
  allowed: (category: ExpenseCategory) => boolean,
): ExpenseCategoryOption[] {
  const behavior = (category: ExpenseCategory) => t(`expense_cost_behavior_${expenseCostBehavior(category)}`)
  const available = (category: ExpenseCategory) => isSelectableExpenseCategory(category) && allowed(category)

  return expenseCategoryTree(categories).flatMap(({ category, children }) => {
    if (!children.length) {
      if (!available(category))
        return []

      return [{
        value: String(category.id),
        label: category.name,
        keywords: category.code,
        description: behavior(category),
        selectedLabel: category.name,
      }]
    }

    const choices = children.filter(available)
    if (!choices.length)
      return []

    const heading: ExpenseCategoryOption = {
      value: `group:${category.id}`,
      label: category.name,
      keywords: [category.code, ...choices.flatMap(child => [child.name, child.code])].join(' '),
      group: true,
      disabled: true,
    }

    const subcategories = choices.map(child => ({
      value: String(child.id),
      label: child.name,
      keywords: `${child.code} ${category.name}`,
      depth: 1,
      description: behavior(child),
      selectedLabel: `${category.name} › ${child.name}`,
    }))

    return [heading, ...subcategories]
  })
}
