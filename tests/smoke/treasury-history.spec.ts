import { type Page, expect, test } from '@playwright/test'

const treasuryViewer = {
  id: 'treasury-viewer',
  name: 'Treasury Viewer',
  role: 'MANAGER',
  status: 'ACTIVE',
  permissions: ['treasury.account.view'],
}

const administrator = {
  id: 'admin-1',
  name: 'Admin Tester',
  role: 'ADMIN',
  status: 'ACTIVE',
  permissions: ['*'],
}

async function seedSession(page: Page, sessionUser = treasuryViewer) {
  await page.addInitScript(storedUser => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('treasury-history-token'))
    localStorage.setItem('userData', JSON.stringify(storedUser))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, sessionUser)
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = []

  page.on('console', message => {
    if (message.type() === 'error')
      errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`))

  return errors
}

test.describe('treasury server history contract', () => {
  test('hydrates deep-linked filters and renders full-result backend totals', async ({ page }) => {
    await seedSession(page)

    const runtimeErrors = collectRuntimeErrors(page)
    const historyQueries: URLSearchParams[] = []

    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.method() === 'GET' && url.pathname.endsWith('/treasury/accounts')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              accounts: {
                SAFE: { balance: 1_000, last_updated: '2026-09-01T08:00:00+05:00' },
                BANK: { balance: 2_000, last_updated: '2026-09-01T08:00:00+05:00' },
              },
            },
          },
        })
        return
      }

      if (request.method() === 'GET' && url.pathname.endsWith('/treasury/history')) {
        historyQueries.push(url.searchParams)
        await route.fulfill({
          json: {
            success: true,
            data: {
              transactions: [{
                id: 42,
                created_at: '2026-08-15T12:30:00+05:00',
                account: 'BANK',
                type: 'EXPENSE',
                delta: -56_700,
                fee: 800,
                balance_before: 200_000,
                balance_after: 143_300,
                category: 'Utilities',
                description: 'Server returned row',
                performed_by: 'Finance Manager',
              }],
              totals: {
                total_inflow_uzs: 123_400,
                total_outflow_uzs: 56_700,
                total_fee_uzs: 800,
                row_count: 11,
              },
              pagination: { page: 2, per_page: 10, total: 11, total_pages: 2 },
            },
          },
        })
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/treasury?account=BANK&type=EXPENSE&date_from=2026-08-01&date_to=2026-08-31&search=rent&page=2&per_page=10')

    await expect.poll(() => historyQueries.length).toBe(1)

    const query = historyQueries[0]

    expect(query.get('account')).toBe('BANK')
    expect(query.get('type')).toBe('EXPENSE')
    expect(query.get('date_from')).toBe('2026-08-01')
    expect(query.get('date_to')).toBe('2026-08-31')
    expect(query.get('search')).toBe('rent')
    expect(query.get('page')).toBe('2')
    expect(query.get('per_page')).toBe('10')

    await expect(page.getByText('Server returned row')).toBeVisible()
    await expect(page.getByText('Total Deposits')).toBeVisible()
    await expect(page.getByText(/123.*400/)).toBeVisible()
    await expect(page.getByText('Total Withdrawals')).toBeVisible()
    await expect(page.getByText(/56.*700/).first()).toBeVisible()
    await expect(page.getByText('Transactions', { exact: true })).toBeVisible()
    await expect(page.getByText('11', { exact: true })).toBeVisible()

    await expect(page.getByRole('button', { name: 'Transfer', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Record Expense', exact: true })).toHaveCount(0)
    expect(runtimeErrors).toEqual([])
  })

  test('keeps backend authorization failures visible without fabricated values', async ({ page }) => {
    await seedSession(page)

    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())

      if (url.pathname.endsWith('/treasury/accounts')) {
        await route.fulfill({
          status: 403,
          json: { success: false, code: 'PERMISSION_DENIED', message: 'Account access was denied.' },
        })
        return
      }

      if (url.pathname.endsWith('/treasury/history')) {
        await route.fulfill({
          status: 403,
          json: { success: false, code: 'PERMISSION_DENIED', message: 'History access was denied.' },
        })
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/treasury')

    const content = page.locator('#main-content')

    await expect(content.getByText('Account access was denied.', { exact: true })).toBeVisible()
    await expect(content.getByText('History access was denied.', { exact: true })).toBeVisible()
    await expect(content.getByText('Total Deposits')).toHaveCount(0)
    await expect(content.getByRole('button', { name: 'Retry' })).toHaveCount(2)
  })

  test('loads canonical active expense categories allowed for the selected account', async ({ page }) => {
    await seedSession(page, administrator)

    let categoryRequests = 0

    await page.route('**/api/**', async route => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.method() === 'GET' && url.pathname.endsWith('/treasury/accounts')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              accounts: {
                SAFE: { balance: 1_000_000, last_updated: '2026-09-01T08:00:00+05:00' },
                BANK: { balance: 2_000_000, last_updated: '2026-09-01T08:00:00+05:00' },
              },
            },
          },
        })
        return
      }

      if (request.method() === 'GET' && url.pathname.endsWith('/treasury/history')) {
        await route.fulfill({
          json: {
            success: true,
            data: {
              transactions: [],
              totals: {
                total_inflow_uzs: 0,
                total_outflow_uzs: 0,
                total_fee_uzs: 0,
                row_count: 0,
              },
              pagination: { page: 1, per_page: 20, total: 0, total_pages: 0 },
            },
          },
        })
        return
      }

      if (request.method() === 'GET' && url.pathname.endsWith('/expense-categories')) {
        categoryRequests += 1
        expect(url.searchParams.get('page')).toBe('1')
        expect(url.searchParams.get('per_page')).toBe('100')
        await route.fulfill({
          json: {
            success: true,
            data: {
              categories: [
                { id: 1, name: 'Safe supplies', is_active: true, allowed_sources: ['SAFE'], sort_order: 1 },
                { id: 2, name: 'Bank commission', is_active: true, allowed_sources: ['BANK'], sort_order: 2 },
                { id: 3, name: 'Inactive category', is_active: false, allowed_sources: ['SAFE', 'BANK'], sort_order: 3 },
              ],
              pagination: { page: 1, per_page: 100, total: 3, total_pages: 1 },
            },
          },
        })
        return
      }

      await route.fulfill({ json: { success: true, data: {} } })
    })

    await page.goto('/treasury')
    await page.getByRole('button', { name: 'Record Expense' }).click()
    await expect.poll(() => categoryRequests).toBe(1)

    const dialog = page.getByRole('dialog', { name: 'Record Treasury Expense' })
    const category = dialog.getByRole('combobox', { name: 'Category' })

    await category.click()
    await expect(page.getByRole('option', { name: 'Safe supplies' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Bank commission' })).toHaveCount(0)
    await expect(page.getByRole('option', { name: 'Inactive category' })).toHaveCount(0)
    await page.getByRole('option', { name: 'Safe supplies' }).click()

    await dialog.getByRole('combobox', { name: 'Account' }).click()
    await page.getByRole('option', { name: 'Bank' }).click()
    await category.click()
    await expect(page.getByRole('option', { name: 'Bank commission' })).toBeVisible()
    await expect(page.getByRole('option', { name: 'Safe supplies' })).toHaveCount(0)
  })
})
