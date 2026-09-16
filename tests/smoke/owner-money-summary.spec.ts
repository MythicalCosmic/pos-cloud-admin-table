import { type Page, expect, test } from '@playwright/test'

function bucket(total: number, count: number) {
  return { total_uzs: total, count, categories: [] }
}

// Amounts render with the locale's (narrow) no-break group separator.
function money(value: string) {
  return new RegExp(value.split(' ').join(','))
}

const summary = {
  range: { from: '2026-08-01', to: '2026-08-31' },
  sales: { gross_sales_uzs: 700_000_000, refunds_uzs: 3_088_800, net_sales_uzs: 696_911_200, paid_orders: 13_641 },
  costs: {
    suppliers: { ...bucket(116_848_000, 282), from_expenses_uzs: 116_848_000, from_supplier_payments_uzs: 0, supplier_payment_count: 0 },
    operating: bucket(18_964_000, 190),
    payroll: { ...bucket(24_550_000, 145), from_expenses_uzs: 24_550_000, from_salary_payments_uzs: 0, salary_payment_count: 0 },
    total_uzs: 160_362_000,
  },
  outside_profit: {
    owner_withdrawals: bucket(7_506_000, 30),
    capital_expenditure: bucket(335_000, 3),
    unclassified: bucket(18_033_000, 83),
  },
  profit: { raw_profit_uzs: 536_549_200, raw_margin_pct: '77.0', after_owner_withdrawals_uzs: 529_043_200 },
  balances: {
    safe_uzs: 2_172_000,
    bank_uzs: 5_556_000,
    total_uzs: 7_728_000,
    treasury_updated_at: '2026-09-10T12:03:18+00:00',
    supplier_debt_uzs: 12_071_000,
    suppliers_with_debt: 8,
  },
  warnings: [
    { code: 'SALARY_RECORDS_MISSING' },
    { code: 'PAYROLL_RECORDED_AS_EXPENSES', count: 145, amount_uzs: 24_550_000 },
    { code: 'SUPPLIER_PURCHASES_RECORDED_AS_EXPENSES', count: 282, amount_uzs: 116_848_000 },
  ],
}

async function setup(page: Page, state: { fail?: boolean } = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('numberFormat', 'full')
    localStorage.setItem('accessToken', JSON.stringify('owner-summary-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 1, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })

  const requests: URL[] = []

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/dashboard/owner-summary')) {
      requests.push(url)
      if (state.fail) {
        await route.fulfill({ status: 500, json: { success: false, message: 'Owner summary fixture failed' } })
        return
      }
      await route.fulfill({ json: { success: true, data: summary } })
      return
    }
    await route.fulfill({ json: { success: true, data: {} } })
  })

  return requests
}

test('shows the money summary with an incomplete-data warning on the dashboard', async ({ page }) => {
  const requests = await setup(page)

  await page.goto('/')

  const card = page.locator('.owner-money')

  await expect(card.getByRole('heading', { name: 'Money summary' })).toBeVisible()
  await expect(card.locator('[data-step="sales"]')).toContainText(money('696 911 200'))
  await expect(card.locator('[data-step="suppliers"]')).toContainText(money('116 848 000'))
  await expect(card.locator('[data-step="profit"]')).toContainText(money('536 549 200'))
  await expect(card.locator('[data-step="profit"]').getByText('Incomplete', { exact: true })).toBeVisible()
  await expect(card.getByText('Owed to suppliers')).toBeVisible()
  expect(requests.length).toBeGreaterThan(0)

  await card.getByText('Data still incomplete · 3').click()
  await expect(card.getByText('No salary payments are recorded yet, so salaries are incomplete.')).toBeVisible()
  await expect(card.getByRole('link', { name: 'Open salaries' }).first()).toHaveAttribute('href', '/hr-salaries')
  await expect(card.getByRole('link', { name: 'Suppliers' })).toHaveAttribute('href', '/stock/suppliers')
  await page.screenshot({ path: '/tmp/alpha-owner-money-summary-desktop.png', fullPage: false, animations: 'disabled' })

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(card.locator('[data-step="profit"]')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('keeps a visible retry when the money summary cannot load', async ({ page }) => {
  await setup(page, { fail: true })

  await page.goto('/')

  const card = page.locator('.owner-money')

  await expect(card.getByText(/Money summary could not be loaded/)).toBeVisible()
  await expect(card.getByRole('button', { name: 'Retry' })).toBeVisible()
})
