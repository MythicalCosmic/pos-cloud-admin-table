import { type Page, expect, test } from '@playwright/test'

const admin = {
  id: 1,
  name: 'Expense Admin',
  email: 'expense.admin@example.test',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissions: ['*'],
}

const categories = [
  {
    id: 17,
    uuid: 'category-17',
    code: 'UTILITIES',
    name: 'Utilities',
    description: 'Operational utilities',
    budget_limit: null,
    reporting_group: 'UTILITIES',
    is_active: true,
    sort_order: 10,
    allowed_sources: ['DRAWER', 'SAFE', 'BANK'],
    requires_receipt: false,
    requires_description: true,
    expense_count: 2,
  },
]

function expense(id: number, status: string, createdById: number, description: string) {
  return {
    id,
    uuid: `expense-${id}`,
    category: { id: 17, code: 'UTILITIES', name: 'Utilities', reporting_group: 'UTILITIES', is_active: true },
    category_id: 17,
    amount: id === 2 ? '350000.00' : '100000.00',
    amount_uzs: id === 2 ? 350000 : 100000,
    fee_uzs: 0,
    fee_percent: null,
    total_debited_uzs: id === 2 ? 350000 : 100000,
    description,
    expense_date: '2026-09-03',
    requested_source: 'BANK',
    source_account: 'BANK',
    shift_id: null,
    status,
    receipt_number: '',
    receipt: { has_file: false, download_path: null },
    created_by: { id: createdById, name: createdById === 1 ? 'Expense Admin' : 'Warehouse User' },
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
    created_at: '2026-09-03T09:00:00+05:00',
    updated_at: '2026-09-03T09:00:00+05:00',
  }
}

async function seedSession(page: Page) {
  await page.addInitScript(user => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('expense-control-test-token'))
    localStorage.setItem('userData', JSON.stringify(user))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, admin)
}

test('uses the canonical expense request, approval, payment, and category-deactivation contracts', async ({ page }) => {
  await seedSession(page)

  const rows = [
    expense(1, 'PENDING', 1, 'Own pending request'),
    expense(2, 'APPROVED', 2, 'Approved bank request'),
    expense(3, 'PENDING', 2, 'Pending warehouse request'),
  ]

  const businessCalls: Array<{ method: string; path: string; body: any; idempotencyKey?: string }> = []

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()
    const body = request.postDataJSON?.() ?? null

    if (path.startsWith('/api/admins/expense')) {
      businessCalls.push({
        method,
        path,
        body,
        idempotencyKey: request.headers()['idempotency-key'],
      })
    }

    if (method === 'GET' && path === '/api/admins/expense-categories') {
      await route.fulfill({ json: { success: true, data: { categories, pagination: { page: 1, per_page: 100, total: categories.length, total_pages: 1 } } } })
      return
    }
    if (method === 'POST' && path === '/api/admins/expense-categories/17/deactivate') {
      categories[0].is_active = false
      await route.fulfill({ json: { success: true, data: { category: categories[0] } } })
      return
    }
    if (method === 'GET' && path === '/api/admins/expenses') {
      await route.fulfill({
        json: {
          success: true,
          data: {
            expenses: rows,
            totals: {
              row_count: rows.length,
              amount_uzs: rows.reduce((sum, row) => sum + row.amount_uzs, 0),
              by_status: {},
            },
            pagination: { page: 1, per_page: 20, total: rows.length, total_pages: 1 },
          },
        },
      })
      return
    }
    if (method === 'POST' && path === '/api/admins/expenses') {
      await route.fulfill({ status: 201, json: { success: true, data: { expense: expense(4, 'PENDING', 1, body.description) } } })
      return
    }
    if (method === 'POST' && path === '/api/admins/expenses/3/approve') {
      rows[2].status = 'APPROVED'
      await route.fulfill({ json: { success: true, data: { expense: rows[2] } } })
      return
    }
    if (method === 'POST' && path === '/api/admins/expenses/2/pay') {
      rows[1].status = 'PAID'
      await route.fulfill({ json: { success: true, data: { expense_id: 2, status: 'PAID' } } })
      return
    }

    await route.fulfill({ json: { success: true, data: {} } })
  })

  await page.goto('/hr-expenses')
  await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible()

  const ownRow = page.locator('tbody tr').filter({ hasText: 'Own pending request' })
  const warehouseRow = page.locator('tbody tr').filter({ hasText: 'Pending warehouse request' })

  await expect(ownRow.getByTitle('Approve')).toHaveCount(0)
  await expect(warehouseRow.getByTitle('Approve')).toBeVisible()

  await page.getByRole('button', { name: 'New Expense' }).click()

  const createModal = page.getByRole('dialog', { name: 'New Expense' })
  const categorySelect = createModal.getByRole('combobox', { name: 'Category' })

  await categorySelect.click()
  await page.getByRole('option', { name: 'Pick a category' }).click()
  await createModal.getByRole('button', { name: 'Submit request' }).click()
  await expect(createModal.getByText('Choose an expense category.')).toBeVisible()
  expect(businessCalls.filter(call => call.method === 'POST' && call.path === '/api/admins/expenses')).toHaveLength(0)

  await categorySelect.click()
  await page.getByRole('option', { name: 'Utilities' }).click()

  const sourceSelect = createModal.getByRole('combobox', { name: 'Requested source' })

  await sourceSelect.click()
  await expect(page.getByRole('option', { name: 'Safe', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: 'Bank', exact: true })).toBeVisible()
  await expect(page.getByRole('option', { name: /drawer/i })).toHaveCount(0)
  await page.getByRole('option', { name: 'Bank', exact: true }).click()

  const amount = createModal.getByRole('textbox', { name: 'Amount' })

  await amount.fill('100000')
  await expect(amount).toHaveValue(/100[\s\u202F]000/)
  await createModal.getByRole('textbox', { name: 'Description' }).fill('Monthly electricity')
  await createModal.getByRole('button', { name: 'Submit request' }).click()

  const createCall = businessCalls.find(call => call.method === 'POST' && call.path === '/api/admins/expenses')

  expect(createCall?.body).toMatchObject({
    category_id: 17,
    amount_uzs: 100000,
    requested_source: 'BANK',
  })
  expect(typeof createCall?.body.amount_uzs).toBe('number')

  await warehouseRow.getByTitle('Approve').click()
  await expect.poll(() => businessCalls.some(call => call.method === 'POST' && call.path === '/api/admins/expenses/3/approve')).toBe(true)

  const approvedRow = page.locator('tbody tr').filter({ hasText: 'Approved bank request' })

  await approvedRow.getByTitle('Pay').click()

  const payModal = page.getByRole('dialog', { name: 'Pay expense' })

  await expect(payModal.getByText('Bank commission')).toBeVisible()
  await payModal.getByRole('spinbutton', { name: 'Bank commission' }).fill('1.5')
  await payModal.getByRole('button', { name: 'Pay' }).click()

  const payCall = businessCalls.find(call => call.method === 'POST' && call.path === '/api/admins/expenses/2/pay')

  expect(payCall?.body).toMatchObject({ source_account: 'BANK', fee_percent: '1.5' })
  expect(payCall?.idempotencyKey).toBeTruthy()

  await page.goto('/hr-expense-categories')

  await page.getByRole('button', { name: 'New category' }).click()

  const categoryModal = page.getByRole('dialog', { name: 'Create expense category' })
  const budget = categoryModal.getByRole('textbox', { name: 'Monthly budget limit' })

  await categoryModal.getByRole('textbox', { name: 'Category name' }).fill('Office supplies')
  await budget.fill('100000')
  await expect(budget).toHaveValue(/100[\s\u202F]000/)
  await budget.clear()
  await expect(budget).toHaveValue('')
  await budget.fill('0')
  await expect(budget).toHaveValue('0')
  await budget.clear()
  await expect(budget).toHaveValue('')
  await categoryModal.getByRole('button', { name: 'Save' }).click()

  const categoryCreateCall = businessCalls.find(call => call.method === 'POST' && call.path === '/api/admins/expense-categories')

  expect(categoryCreateCall?.body.budget_limit).toBeNull()

  const categoryRow = page.locator('tbody tr').filter({ hasText: 'Utilities' })

  await categoryRow.getByTitle('Deactivate').click()
  await page.getByRole('dialog', { name: 'Deactivate' }).getByRole('button', { name: 'Deactivate' }).click()
  await expect.poll(() => businessCalls.some(call => call.method === 'POST' && call.path === '/api/admins/expense-categories/17/deactivate')).toBe(true)

  expect(businessCalls.some(call => call.method === 'DELETE')).toBe(false)
  expect(businessCalls.every(call => !call.path.endsWith('/'))).toBe(true)
})
