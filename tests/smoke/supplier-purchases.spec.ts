import { type Page, expect, test } from '@playwright/test'

async function seedAdmin(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('alphapos-theme', 'light')
    localStorage.setItem('accessToken', JSON.stringify('supplier-purchases-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 1, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })
}

const supplier = {
  id: 22, name: "Donar go'sht", code: 'DON001', currency: 'UZS', current_balance_uzs: '0.00',
  payment_terms_days: 30, lead_time_days: 7, rating: 3, is_active: true, items: [], stats: {},
}

test('a supplier shows its paid purchases with totals by source and a date filter', async ({ page }) => {
  await seedAdmin(page)
  const purchaseQueries: URL[] = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/stock/suppliers/22/')) {
      await route.fulfill({ json: { success: true, data: { supplier } } })
      return
    }
    if (url.pathname.endsWith('/stock/suppliers/22/purchases/')) {
      purchaseQueries.push(url)
      await route.fulfill({
        json: {
          success: true,
          data: {
            purchases: [
              { expense_id: 1505, date: '2026-08-31', amount_uzs: 5118000, description: "Danargo'sh", category: 'Meat & poultry', source_account: 'SAFE', status: 'PAID' },
              { expense_id: 901, date: '2026-08-15', amount_uzs: 3685000, description: 'Doner meat (Donar go\'shti)', category: 'Meat & poultry', source_account: 'DRAWER', status: 'PAID' },
            ],
            totals: {
              count: 2, amount_uzs: 8803000, paid_uzs: 8803000,
              by_source: { SAFE: { count: 1, amount_uzs: 5118000 }, DRAWER: { count: 1, amount_uzs: 3685000 } },
            },
            pagination: { page: 1, per_page: 20, total: 2, total_pages: 1 },
          },
        },
      })
      return
    }
    await route.fulfill({ json: { success: true, data: {} } })
  })

  await page.goto('/stock/suppliers/22')
  await page.getByRole('tab', { name: 'Paid purchases' }).click()

  const panel = page.locator('.supplier-purchases')
  await expect(panel.getByText('8,803,000')).toBeVisible()
  await expect(panel.getByText('5,118,000').first()).toBeVisible()
  await expect(panel.getByText('Till', { exact: true }).first()).toBeVisible()
  await expect(panel.getByText('31.08.2026')).toBeVisible()
  expect(purchaseQueries.at(-1)?.searchParams.get('date_from')).toBeNull()
  await page.screenshot({ path: '/tmp/alpha-supplier-purchases.png', animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('the expense list leaves supplier purchases out unless asked', async ({ page }) => {
  await seedAdmin(page)
  const listQueries: URL[] = []
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/admins/expenses') {
      listQueries.push(url)
      const only = url.searchParams.get('supplier_purchases') === 'only'
      await route.fulfill({
        json: {
          success: true,
          data: {
            expenses: only
              ? [{ id: 5, uuid: 'e5', category: null, category_id: null, supplier: { id: 22, name: "Donar go'sht" }, amount: '4000000', amount_uzs: 4000000, fee_uzs: 0, fee_percent: null, total_debited_uzs: 4000000, description: 'Doner meat', expense_date: '2026-08-05', requested_source: 'SAFE', status: 'PAID' }]
              : [],
            totals: { row_count: only ? 1 : 0, amount_uzs: only ? 4000000 : 0, by_status: {} },
            pagination: { page: 1, per_page: 20, total: only ? 1 : 0, total_pages: 1 },
          },
        },
      })
      return
    }
    await route.fulfill({ json: { success: true, data: {} } })
  })

  await page.goto('/hr-expenses')
  await expect.poll(() => listQueries.length).toBeGreaterThan(0)
  expect(listQueries.every(url => url.searchParams.get('supplier_purchases') === 'exclude')).toBe(true)

  await page.goto('/hr-expenses?suppliers=only')
  await expect(page.getByRole('link', { name: "Donar go'sht" })).toHaveAttribute('href', '/stock/suppliers/22')
  expect(listQueries.at(-1)?.searchParams.get('supplier_purchases')).toBe('only')

  await page.goto('/hr-expenses?suppliers=all')
  await expect.poll(() => listQueries.at(-1)?.searchParams.has('supplier_purchases')).toBe(false)
})
