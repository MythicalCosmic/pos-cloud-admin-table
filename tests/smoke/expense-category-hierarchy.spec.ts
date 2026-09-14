import { type Page, type Route, expect, test } from '@playwright/test'

interface ApiCall {
  method: string
  path: string
  query: string
  body: any
  idempotencyKey?: string
}

interface ApiOptions {
  applyConflict?: boolean
  failFirstApply?: boolean
  applyAttempts?: number
}

const categories = [
  {
    id: 10,
    code: 'FACILITIES',
    name: 'Facilities',
    description: 'Building and site costs',
    reporting_group: 'OPERATING',
    budget_limit: null,
    is_active: true,
    sort_order: 1,
    allowed_sources: ['SAFE', 'BANK'],
    requires_receipt: false,
    requires_description: false,
    expense_count: 8,
    parent_id: null,
    parent: null,
    depth: 0,
    path: ['Facilities'],
    cost_behavior: 'MIXED',
    direct_expense_count: 2,
    subtree_expense_count: 8,
    child_count: 1,
    active_child_count: 1,
    is_selectable: false,
  },
  {
    id: 11,
    code: 'ELECTRICITY',
    name: 'Electricity and building utilities with a deliberately long name',
    description: 'Monthly utility invoices',
    reporting_group: 'UTILITIES',
    budget_limit: null,
    is_active: true,
    sort_order: 2,
    allowed_sources: ['SAFE', 'BANK'],
    requires_receipt: true,
    requires_description: true,
    expense_count: 6,
    parent_id: 10,
    parent: { id: 10, code: 'FACILITIES', name: 'Facilities', is_active: true },
    depth: 1,
    path: ['Facilities', 'Electricity and building utilities with a deliberately long name'],
    cost_behavior: 'VARIABLE',
    direct_expense_count: 6,
    subtree_expense_count: 6,
    child_count: 0,
    active_child_count: 0,
    is_selectable: true,
  },
  {
    id: 12,
    code: 'RENT',
    name: 'Rent',
    description: 'Premises rent',
    reporting_group: 'RENT',
    budget_limit: null,
    is_active: true,
    sort_order: 3,
    allowed_sources: ['SAFE', 'BANK'],
    requires_receipt: false,
    requires_description: true,
    expense_count: 4,
    parent_id: null,
    parent: null,
    depth: 0,
    path: ['Rent'],
    cost_behavior: 'FIXED',
    direct_expense_count: 4,
    subtree_expense_count: 4,
    child_count: 0,
    active_child_count: 0,
    is_selectable: true,
  },
]

const expenses = [
  expenseRow(301, 125_000, 'Electricity invoice for the first branch'),
  expenseRow(302, 275_000, 'Electricity invoice for the second branch'),
]

function expenseRow(id: number, amount: number, description: string) {
  return {
    id,
    uuid: `expense-${id}`,
    category_id: 11,
    category: {
      id: 11,
      code: 'ELECTRICITY',
      name: 'Electricity',
      parent: { code: 'FACILITIES', name: 'Facilities' },
      path: ['Facilities', 'Electricity'],
      cost_behavior: 'VARIABLE',
      reporting_group: 'UTILITIES',
      is_active: true,
    },
    amount: `${amount}.00`,
    amount_uzs: amount,
    fee_uzs: 0,
    fee_percent: null,
    total_debited_uzs: amount,
    description,
    expense_date: '2026-09-14',
    requested_source: 'BANK',
    source_account: null,
    shift_id: null,
    status: 'PENDING',
    receipt_number: `INV-${id}`,
    created_by: { id: 22, name: 'Warehouse Manager' },
    approved_by: null,
    paid_by: null,
    canceled_by: null,
    voided_by: null,
    notes: '',
    cancel_reason: '',
    void_reason: '',
    approved_at: null,
    rejected_at: null,
    paid_at: null,
    canceled_at: null,
    voided_at: null,
    created_at: '2026-09-14T09:00:00+05:00',
    updated_at: '2026-09-14T09:00:00+05:00',
  }
}

async function fulfillCategoryList(route: Route, url: URL) {
  const rootsOnly = url.searchParams.get('roots_only') === 'true'
  const behavior = url.searchParams.get('cost_behavior')

  const rows = categories.filter(category =>
    (!rootsOnly || category.depth === 0) && (!behavior || category.cost_behavior === behavior),
  )

  await route.fulfill({ json: { data: { categories: rows, pagination: { page: 1, per_page: 100, total: rows.length, total_pages: 1 } } } })
}

async function fulfillExpenseList(route: Route) {
  const total = expenses.reduce((sum, row) => sum + row.amount_uzs, 0)

  await route.fulfill({
    json: {
      data: {
        expenses,
        totals: { row_count: expenses.length, amount_uzs: total, by_status: { PENDING: { count: expenses.length, amount_uzs: total } } },
        pagination: { page: 1, per_page: 20, total: expenses.length, total_pages: 1 },
      },
    },
  })
}

async function fulfillReclassification(route: Route, body: any, options: ApiOptions) {
  await new Promise(resolve => setTimeout(resolve, 80))
  if (!body.dry_run && options.applyConflict) {
    await route.fulfill({ status: 409, json: { code: 'EXPENSE_RECLASSIFICATION_STATUS_CHANGED', message: 'One expense is no longer pending.' } })
    return
  }
  if (!body.dry_run && options.failFirstApply) {
    options.applyAttempts = (options.applyAttempts ?? 0) + 1
    if (options.applyAttempts === 1) {
      await route.fulfill({ status: 503, json: { code: 'TEMPORARILY_UNAVAILABLE', message: 'The reviewed update could not be completed.' } })
      return
    }
  }

  const result = body.dry_run
    ? {
      preview: {
        row_count: 2,
        total_amount_uzs: 400_000,
        current_category_breakdown: [{ category_id: 11, name: 'Electricity', path: ['Facilities', 'Electricity'], count: 2, amount_uzs: 400_000 }],
        source_breakdown: [{ source_account: 'BANK', count: 2, amount_uzs: 400_000 }],
        target_path: ['Rent'],
        target_cost_behavior: 'FIXED',
        target_reporting_group: 'RENT',
      },
    }
    : { result: { row_count: 2, total_amount_uzs: 400_000 } }

  await route.fulfill({ json: { data: result } })
}

async function handleApiRoute(route: Route, calls: ApiCall[], options: ApiOptions) {
  const request = route.request()
  const url = new URL(request.url())
  const method = request.method()
  const body = request.postDataJSON?.() ?? null

  calls.push({
    method,
    path: url.pathname,
    query: url.search,
    body,
    idempotencyKey: request.headers()['idempotency-key'],
  })

  if (method === 'GET' && url.pathname.endsWith('/expense-categories'))
    return fulfillCategoryList(route, url)

  if (method === 'POST' && url.pathname.endsWith('/expense-categories'))
    return route.fulfill({ status: 201, json: { data: { category: { ...categories[1], id: 13, ...body } } } })

  if (method === 'PATCH' && url.pathname.includes('/expense-categories/'))
    return route.fulfill({ json: { data: { category: { ...categories[0], ...body } } } })

  if (method === 'GET' && url.pathname.endsWith('/expenses'))
    return fulfillExpenseList(route)

  if (method === 'POST' && url.pathname.endsWith('/expenses/reclassify'))
    return fulfillReclassification(route, body, options)

  return route.fulfill({ json: { data: {} } })
}

async function setup(page: Page, options: ApiOptions = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('accessToken', JSON.stringify('expense-hierarchy-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 1, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })

  const calls: ApiCall[] = []

  await page.route('**/api/**', route => handleApiRoute(route, calls, options))

  return calls
}

test('manages hierarchy, cost behavior, group safety, and long mobile labels', async ({ page }) => {
  const calls = await setup(page)

  await page.goto('/hr-expense-categories')
  await expect(page.getByRole('heading', { name: 'Expense Categories' })).toBeVisible()

  const categoryTableBody = page.locator('tbody:visible')

  await expect(categoryTableBody.getByText('Facilities / Electricity and building utilities with a deliberately long name', { exact: true })).toBeVisible()
  await expect(categoryTableBody.getByText('Variable', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-expense-category-hierarchy-desktop.png', fullPage: true, animations: 'disabled' })

  const groupRow = categoryTableBody.locator('tr').filter({
    has: page.getByText('FACILITIES', { exact: true }),
  })

  await expect(groupRow.getByText('Group', { exact: true })).toBeVisible()
  await expect(groupRow.getByText('Deactivate active subcategories before deactivating this category.', { exact: true })).toBeVisible()
  await expect(groupRow.getByTitle('Deactivate active subcategories before deactivating this category.')).toBeDisabled()
  await groupRow.getByTitle('Edit').click()

  const editGroupDialog = page.getByRole('dialog', { name: 'Edit expense category' })

  await expect(editGroupDialog.getByRole('combobox', { name: 'Parent category' })).toHaveAttribute('aria-disabled', 'true')
  await expect(editGroupDialog.locator('button[role="switch"]').last()).toBeDisabled()
  await editGroupDialog.getByTitle('Close').click()

  const rootLeafRow = categoryTableBody.locator('tr').filter({
    has: page.getByText('RENT', { exact: true }),
  })

  await rootLeafRow.getByTitle('Edit').click()

  const editLeafDialog = page.getByRole('dialog', { name: 'Edit expense category' })

  await editLeafDialog.getByRole('combobox', { name: 'Parent category' }).click()
  await expect(page.getByRole('option', { name: 'Rent', exact: true })).toHaveCount(0)
  await expect(page.getByRole('option', { name: /Electricity and building utilities/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(editLeafDialog).not.toBeVisible()

  await page.getByRole('button', { name: 'New category' }).click()

  const dialog = page.getByRole('dialog', { name: 'Create expense category' })

  await dialog.getByRole('textbox', { name: 'Category name' }).fill('Internet')
  await dialog.getByRole('combobox', { name: 'Parent category' }).click()
  await expect(page.getByRole('option', { name: /Electricity and building utilities/ })).toHaveCount(0)
  await page.getByRole('option', { name: 'Facilities', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Cost behavior' }).click()
  await page.getByRole('option', { name: 'Variable', exact: true }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).not.toBeVisible()

  const createCall = calls.find(call => call.method === 'POST' && call.path.endsWith('/expense-categories'))

  expect(createCall?.body).toMatchObject({ parent_id: 10, cost_behavior: 'VARIABLE' })

  await page.locator('.tb-filter').getByRole('combobox', { name: 'Cost behavior' }).click()
  await page.getByRole('option', { name: 'Variable', exact: true }).click()
  await expect.poll(() => calls.some(call => call.method === 'GET' && call.query.includes('cost_behavior=VARIABLE'))).toBe(true)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => {
    localStorage.setItem('alphapos-theme', 'dark')
  })
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Language', exact: true }).click()
  await page.getByText('O\'zbekcha', { exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Xarajat kategoriyalari' })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: '/tmp/alpha-expense-category-hierarchy-mobile-dark.png', fullPage: true, animations: 'disabled' })

  await page.getByRole('button', { name: 'Yangi kategoriya', exact: true }).click()

  const mobileEditor = page.getByRole('dialog', { name: 'Xarajat kategoriyasi yaratish' })
  const mobileCostBehavior = mobileEditor.getByRole('combobox', { name: 'Xarajat xususiyati' })

  await mobileCostBehavior.scrollIntoViewIfNeeded()
  await expect(mobileCostBehavior).toBeVisible()
  await expect(mobileEditor.getByRole('combobox', { name: 'Yuqori toifa' })).toBeVisible()
  expect(await mobileEditor.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0)
  await page.screenshot({ path: '/tmp/alpha-expense-category-editor-mobile-dark.png', animations: 'disabled' })
  await mobileEditor.getByTitle('Yopish').click()
})

test('uses selectable paths, server filters, and a retry-safe dry-run-first reclassification', async ({ page }) => {
  const calls = await setup(page, { failFirstApply: true })

  await page.goto('/hr-expenses')
  await expect(page.locator('tbody:visible').getByText('Facilities / Electricity', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'New Expense' }).click()

  const createDialog = page.getByRole('dialog', { name: 'New Expense' })
  const categorySelect = createDialog.getByRole('combobox', { name: 'Category' })

  await categorySelect.click()
  await expect(page.getByRole('option', { name: 'Facilities', exact: true })).toHaveCount(0)
  await expect(page.getByRole('option', { name: /Facilities \/ Electricity.*Variable/ })).toBeVisible()
  await createDialog.getByTitle('Close').click()

  await page.getByRole('combobox', { name: 'All categories' }).click()
  await page.getByRole('option', { name: 'Facilities', exact: true }).click()
  await page.getByText('Include subcategories', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Cost behavior' }).click()
  await page.getByRole('option', { name: 'Variable', exact: true }).click()
  await page.getByRole('combobox', { name: 'Reporting group' }).click()
  await page.getByRole('option', { name: 'Utilities', exact: true }).click()
  await page.getByRole('combobox', { name: 'Source account' }).click()
  await page.getByRole('option', { name: 'Bank', exact: true }).click()

  await expect.poll(() => calls.some(call =>
    call.method === 'GET'
    && call.path.endsWith('/expenses')
    && call.query.includes('category_id=10')
    && call.query.includes('include_subcategories=true')
    && call.query.includes('cost_behavior=VARIABLE')
    && call.query.includes('reporting_group=UTILITIES')
    && call.query.includes('source_account=BANK'),
  )).toBe(true)

  await page.getByRole('button', { name: 'Review categories' }).click()
  await page.getByRole('checkbox', { name: 'Select 301' }).click()
  await page.getByRole('checkbox', { name: 'Select 302' }).click()
  await page.getByRole('button', { name: 'Review selection' }).click()

  const reviewDialog = page.getByRole('dialog', { name: 'Review expense categories' })

  await reviewDialog.getByRole('combobox', { name: 'Target category' }).click()
  await page.getByRole('option', { name: /Rent.*Fixed/ }).click()
  await reviewDialog.getByRole('button', { name: 'Preview changes' }).click()
  await expect(reviewDialog.getByText('Exact UZS total', { exact: true })).toBeVisible()
  await expect(reviewDialog.getByText('400 000', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-expense-reclassification-preview.png', animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

  const mobileApply = reviewDialog.getByRole('button', { name: 'Apply category change' })
  const mobileApplyBox = await mobileApply.boundingBox()

  await expect(mobileApply).toBeVisible()
  expect((mobileApplyBox?.y ?? Number.POSITIVE_INFINITY) + (mobileApplyBox?.height ?? 0)).toBeLessThanOrEqual(844)
  await page.screenshot({ path: '/tmp/alpha-expense-reclassification-mobile.png', animations: 'disabled' })

  const previewCalls = calls.filter(call => call.method === 'POST' && call.path.endsWith('/expenses/reclassify') && call.body?.dry_run)

  expect(previewCalls).toHaveLength(1)
  expect(previewCalls[0].body).toMatchObject({ expense_ids: [301, 302], category_id: 12, expected_category_id: 11, reason: '', dry_run: true })
  expect(previewCalls[0].idempotencyKey).toBeTruthy()

  await reviewDialog.getByRole('textbox', { name: 'Reason' }).fill('Reviewed against the September expense workbook')
  await reviewDialog.getByRole('button', { name: 'Apply category change' }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await expect(reviewDialog.getByText('The reviewed update could not be completed.', { exact: true })).toBeVisible()

  const failedApplyCalls = calls.filter(call => call.method === 'POST' && call.path.endsWith('/expenses/reclassify') && call.body?.dry_run === false)

  expect(failedApplyCalls).toHaveLength(1)
  await reviewDialog.getByRole('button', { name: 'Apply category change' }).click()
  await expect(reviewDialog).not.toBeVisible()

  const applyCalls = calls.filter(call => call.method === 'POST' && call.path.endsWith('/expenses/reclassify') && call.body?.dry_run === false)

  expect(applyCalls).toHaveLength(2)
  expect(applyCalls[0].body.reason).toBe('Reviewed against the September expense workbook')
  expect(applyCalls[0].idempotencyKey).toBeTruthy()
  expect(applyCalls[0].idempotencyKey).not.toBe(previewCalls[0].idempotencyKey)
  expect(applyCalls[1].idempotencyKey).toBe(applyCalls[0].idempotencyKey)
})

test('offers a visible reload when the reviewed expense state changed', async ({ page }) => {
  await setup(page, { applyConflict: true })
  await page.goto('/hr-expenses')

  await page.getByRole('button', { name: 'Review categories' }).click()
  await page.getByRole('checkbox', { name: 'Select 301' }).click()
  await page.getByRole('button', { name: 'Review selection' }).click()

  const dialog = page.getByRole('dialog', { name: 'Review expense categories' })

  await dialog.getByRole('combobox', { name: 'Target category' }).click()
  await page.getByRole('option', { name: /Rent.*Fixed/ }).click()
  await dialog.getByRole('button', { name: 'Preview changes' }).click()
  await dialog.getByRole('textbox', { name: 'Reason' }).fill('Reviewed after workbook reconciliation')
  await dialog.getByRole('button', { name: 'Apply category change' }).click()

  await expect(dialog.getByText('One expense is no longer pending.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Reload selection' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Reload selection' }).click()
  await expect(dialog).not.toBeVisible()
})
