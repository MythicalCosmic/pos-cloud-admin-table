import { type Page, expect, test } from '@playwright/test'

interface ExpenseMutation {
  body: Record<string, unknown>
  idempotencyKey?: string
}

async function seedAdminSession(page: Page, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript(({ selectedTheme }) => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', selectedTheme)
    localStorage.setItem('accessToken', JSON.stringify('treasury-test-token'))
    localStorage.setItem('userData', JSON.stringify({
      id: 'admin-1',
      name: 'Admin Tester',
      role: 'ADMIN',
      permissions: ['*'],
    }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { selectedTheme: theme })
}

async function mockTreasuryApi(page: Page): Promise<ExpenseMutation[]> {
  const expenses: ExpenseMutation[] = []

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const method = request.method()

    if (path.endsWith('/treasury/accounts') && method === 'GET') {
      await route.fulfill({
        json: {
          data: {
            accounts: {
              SAFE: { balance: 1_000_000, last_updated: '2026-08-29T08:00:00+05:00' },
              BANK: { balance: 2_000_000, last_updated: '2026-08-29T08:00:00+05:00' },
            },
          },
        },
      })
      return
    }

    if (path.endsWith('/treasury/history') && method === 'GET') {
      await route.fulfill({ json: { data: { transactions: [], pagination: { total: 0 } } } })
      return
    }

    if (path.endsWith('/expense-categories') && method === 'GET') {
      const requestedPage = Number(new URL(request.url()).searchParams.get('page') || 1)
      const supplies = { id: 17, name: 'Supplies', sort_order: 1, is_active: true, allowed_sources: ['SAFE', 'BANK'] }

      const repairs = {
        id: 18,
        name: 'Repairs',
        sort_order: 2,
        is_active: true,
        allowed_sources: ['SAFE', 'BANK'],
        requires_receipt: true,
        requires_description: true,
      }

      await route.fulfill({
        json: {
          data: {
            categories: requestedPage === 1 ? [supplies] : [repairs],
            pagination: { page: requestedPage, per_page: 1, total: 2, total_pages: 2 },
          },
        },
      })
      return
    }

    if (path.endsWith('/treasury/expense') && method === 'POST') {
      expenses.push({
        body: request.postDataJSON(),
        idempotencyKey: request.headers()['idempotency-key'],
      })
      await route.fulfill({ json: { data: { transaction: { id: 501 } } } })
      return
    }

    await route.fulfill({ json: { data: {} } })
  })

  return expenses
}

async function openExpenseDialog(page: Page) {
  await page.goto('/treasury')
  await page.getByRole('button', { name: 'Record Expense' }).click()

  return page.getByRole('dialog', { name: 'Record Treasury Expense' })
}

test.describe('treasury expense workflow', () => {
  test('requires a catalog category and sends grouped cash input as numeric UZS', async ({ page }) => {
    await seedAdminSession(page)

    const expenses = await mockTreasuryApi(page)
    const dialog = await openExpenseDialog(page)

    await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Reference' })).toHaveCount(0)
    await expect(dialog.getByText('Fee / commission (optional)')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toHaveCount(0)

    const submit = dialog.getByRole('button', { name: 'Record Expense' })
    const amount = dialog.getByLabel('Amount')

    await amount.fill('100000')
    await expect(amount).toHaveValue(/100.*000/)
    await expect(submit).toBeDisabled()

    await dialog.getByRole('combobox', { name: 'Category' }).click()
    await page.getByRole('option', { name: 'Supplies' }).click()
    await dialog.getByLabel('Description').fill('Cleaning materials')
    await submit.click()

    await expect.poll(() => expenses.length).toBe(1)

    expect(expenses[0]).toMatchObject({
      body: {
        source_account: 'SAFE',
        amount_uzs: 100_000,
        category_id: 17,
        category: 'Supplies',
        description: 'Cleaning materials',
      },
    })
    expect(expenses[0].body).not.toHaveProperty('fee_percent')
    expect(expenses[0].idempotencyKey).toBeTruthy()
  })

  test('shows commission only for bank expenses and remains usable on dark mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await seedAdminSession(page, 'dark')

    const expenses = await mockTreasuryApi(page)
    const dialog = await openExpenseDialog(page)

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await dialog.getByRole('combobox', { name: 'Account' }).click()
    await page.getByRole('option', { name: 'Bank' }).click()

    const amount = dialog.getByLabel('Amount')
    const commission = dialog.getByLabel('Bank commission (%)')

    await amount.fill('250000')
    await commission.fill('1.5')
    await expect(amount).toHaveValue(/250.*000/)
    await expect(commission).toHaveValue('1.5')
    await expect(dialog.getByText('Calculated fee').locator('..').getByText(/3.*750/)).toBeVisible()

    await dialog.getByRole('combobox', { name: 'Category' }).click()
    await page.getByRole('option', { name: 'Repairs' }).click()

    const submit = dialog.getByRole('button', { name: 'Record Expense' })

    await submit.click()
    await expect(dialog.getByText('A description is required for this category.')).toBeVisible()
    await expect(dialog.getByText('A receipt number is required for this category.')).toBeVisible()
    expect(expenses).toHaveLength(0)

    await dialog.getByLabel('Description').fill('Emergency repair')
    await dialog.getByLabel('Receipt #').fill('INV-2048')
    await submit.click()

    await expect.poll(() => expenses.length).toBe(1)

    expect(expenses[0].body).toMatchObject({
      source_account: 'BANK',
      amount_uzs: 250_000,
      fee_uzs: null,
      fee_percent: '1.5',
      category_id: 18,
      category: 'Repairs',
      description: 'Emergency repair',
      receipt_number: 'INV-2048',
    })

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

    expect(overflow).toBeLessThanOrEqual(0)
  })
})
