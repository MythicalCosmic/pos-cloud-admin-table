import { type Page, type Request, expect, test } from '@playwright/test'

const OWNER = { id: 1, email: 'owner@alpha.uz', first_name: 'Akmal', last_name: '', role: 'ADMIN', permissions: ['*'] }
const MANAGER = { id: 9, name: 'Abdulquddus' }

function expense(id: number, status: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    uuid: `e-${id}`,
    status,
    amount: '350000.00',
    amount_uzs: 350_000,
    description: `Gas cylinder refill ${id}`,
    expense_date: '2026-09-18',
    requested_source: 'SAFE',
    source_account: null,
    category: { id: 3, code: 'SF_UTIL_GAS', name: 'Gas', path: ['Utilities', 'Gas'], reporting_group: 'OPERATING', is_active: true },
    category_id: 3,
    created_by: MANAGER,
    notes: '[IMPORT 2026-09-16] From the safe book.',
    fee_uzs: 0,
    fee_percent: null,
    total_debited_uzs: 350_000,
    created_at: '2026-09-18T10:00:00+05:00',
    updated_at: '2026-09-18T10:00:00+05:00',
    ...extra,
  }
}

const summary = {
  range: { from: '2026-09-18', to: '2026-09-18' },
  sales: { gross_sales_uzs: 12_000_000, refunds_uzs: 0, net_sales_uzs: 12_000_000, paid_orders: 210 },
  costs: {
    suppliers: { total_uzs: 0, count: 0, categories: [], from_expenses_uzs: 0, from_supplier_payments_uzs: 0, supplier_payment_count: 0 },
    operating: { total_uzs: 350_000, count: 1, categories: [] },
    payroll: { total_uzs: 0, count: 0, categories: [], from_expenses_uzs: 0, from_salary_payments_uzs: 0, salary_payment_count: 0 },
    total_uzs: 350_000,
  },
  outside_profit: {
    owner_withdrawals: { total_uzs: 0, count: 0, categories: [] },
    capital_expenditure: { total_uzs: 0, count: 0, categories: [] },
    unclassified: { total_uzs: 0, count: 0, categories: [] },
  },
  profit: { raw_profit_uzs: 11_650_000, raw_margin_pct: '97.1', after_owner_withdrawals_uzs: 11_650_000 },
  balances: { safe_uzs: 4_250_000, bank_uzs: 18_900_000, total_uzs: 23_150_000, treasury_updated_at: '2026-09-18T09:00:00+05:00', supplier_debt_uzs: 7_400_000, suppliers_with_debt: 2 },
  warnings: [],
}

interface Api {
  calls: Request[]
  expenses: Map<number, ReturnType<typeof expense>>
  unauthorized: boolean
}

async function setup(page: Page, opts: { signedIn?: boolean; locale?: string; theme?: 'light' | 'dark'; user?: Record<string, unknown> } = {}) {
  const { signedIn = true, locale = 'en', theme = 'light', user = OWNER } = opts

  await page.addInitScript(({ signedIn, locale, theme, user }) => {
    if (sessionStorage.getItem('seeded'))
      return
    sessionStorage.setItem('seeded', '1')
    localStorage.clear()
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('numberFormat', 'full')
    if (signedIn) {
      localStorage.setItem('accessToken', JSON.stringify('owner-token'))
      localStorage.setItem('userData', JSON.stringify(user))
      localStorage.setItem('ownerTokenIssuedAt', String(Date.now()))
    }
  }, { signedIn, locale, theme, user })

  const api: Api = {
    calls: [],
    expenses: new Map([
      [41, expense(41, 'PENDING')],
      [42, expense(42, 'APPROVED', { amount_uzs: 1_200_000, description: 'Bread supplier' })],
      [43, expense(43, 'PENDING', { created_by: { id: OWNER.id, name: 'Akmal' }, description: 'My own request' })],
    ]),
    unauthorized: false,
  }

  await page.route('**/api/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace(/^\/api\/admins/, '')
    const method = request.method()
    api.calls.push(request)

    const ok = (data: unknown) => route.fulfill({ json: { success: true, data } })

    if (api.unauthorized && path !== '/auth-login')
      return route.fulfill({ status: 401, json: { success: false, message: 'Invalid session' } })

    if (path === '/auth-login') {
      const body = request.postDataJSON()
      if (body.email === 'cashier@alpha.uz')
        return ok({ token: 'cashier-token', user: { id: 5, role: 'CASHIER', first_name: 'Kassir' } })

      return ok({ token: 'owner-token', user: OWNER })
    }
    if (path === '/auth-me')
      return ok({ ...OWNER, business_day_start: '03:00' })
    if (path === '/dashboard/today') {
      return ok({
        today: { revenue: '12000000.00', paid_orders: 210, orders: 214, open: 4, cancelled: 0 },
        payment_breakdown_today: { cash: 5_000_000, card: 4_000_000, payme: 3_000_000 },
      })
    }
    if (path === '/dashboard/owner-summary')
      return ok(summary)
    if (path === '/expenses' && method === 'GET') {
      const status = url.searchParams.get('status')
      const rows = [...api.expenses.values()].filter(e => !status || e.status === status)

      return ok({ expenses: rows, pagination: { total: rows.length } })
    }
    const detail = path.match(/^\/expenses\/(\d+)(?:\/(approve|pay|reject))?$/)
    if (detail) {
      const item = api.expenses.get(Number(detail[1]))
      if (!item)
        return route.fulfill({ status: 404, json: { success: false, message: 'Not found' } })
      if (detail[2] === 'approve')
        item.status = 'APPROVED'
      else if (detail[2] === 'pay')
        item.status = 'PAID'
      else if (detail[2] === 'reject')
        item.status = 'REJECTED'

      return ok({ expense: item })
    }
    if (path === '/treasury/accounts')
      return ok({ accounts: { SAFE: { kind: 'SAFE', balance: '4250000.00', balance_uzs: 4_250_000 }, BANK: { kind: 'BANK', balance: '18900000.00', balance_uzs: 18_900_000 } } })
    if (path === '/treasury/history') {
      const page = Number(url.searchParams.get('page') || 1)
      const rows = Array.from({ length: page < 3 ? 30 : 5 }, (_, i) => ({
        id: page * 100 + i,
        account: i % 2 ? 'BANK' : 'SAFE',
        type: i % 3 ? 'EXPENSE' : 'INKASSA',
        delta: i % 3 ? '-150000.00' : '2000000.00',
        delta_uzs: i % 3 ? -150_000 : 2_000_000,
        description: `[SAFE 2026-09-16] Movement ${page}-${i}`,
        created_at: '2026-09-17T18:00:00+05:00',
      }))

      return ok({ transactions: rows, pagination: { total: 65 } })
    }
    if (path === '/stock/suppliers/') {
      return ok({
        suppliers: [
          { id: 5, name: 'Andijan Meat', phone: '+998901112233', current_balance_uzs: 5_200_000, is_active: true },
          { id: 6, name: 'Bun Bakery', contact_person: 'Elbek', current_balance_uzs: 2_200_000, is_active: true },
          { id: 7, name: 'Old Supplier', current_balance_uzs: 0, is_active: false },
        ],
        pagination: { total_suppliers: 3 },
      })
    }
    if (path === '/stock/suppliers/5/')
      return ok({ supplier: { id: 5, name: 'Andijan Meat', phone: '+998901112233', current_balance_uzs: 5_200_000, is_active: true } })
    if (path === '/stock/suppliers/5/ledger/') {
      return ok({
        transactions: [
          { id: 1, type: 'PURCHASE', amount_uzs: 3_000_000, change_uzs: 3_000_000, balance_after_uzs: 5_200_000, source_account: null, note: 'Pizza meat', performed_by: null, created_at: '2026-09-15T12:00:00+05:00' },
          { id: 2, type: 'PAYMENT', amount_uzs: 1_000_000, change_uzs: -1_000_000, balance_after_uzs: 2_200_000, source_account: 'SAFE', note: '', performed_by: null, created_at: '2026-09-10T12:00:00+05:00' },
        ],
        pagination: { total: 2 },
      })
    }
    if (path === '/hr/salaries/') {
      return ok({
        salaries: [
          { id: 72, employee_id: 7, employee: { id: 7, position: 'Cook', user: { id: 60, first_name: 'Muhlisa', last_name: 'Karimova' } }, period_year: 2026, period_month: 8, base_amount: '6050000.00', bonus: '0.00', deduction: '0.00', net_amount: '6050000.00', status: 'PAID', paid_at: '2026-08-31T23:00:00+05:00', notes: '' },
        ],
      })
    }
    if (path === '/hr/salaries/summary/')
      return ok({ count: 1, total_base: '6050000.00', total_bonus: '0.00', total_deduction: '0.00', total_net: '6050000.00', by_status: { PAID: '6050000.00' } })

    return ok({})
  })

  return api
}

// OWNER_SHOTS=<dir> saves each checked screen (design review, store screenshots).
async function shot(page: Page, name: string) {
  if (process.env.OWNER_SHOTS)
    await page.screenshot({ path: `${process.env.OWNER_SHOTS}/${name}.png` })
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('signed-out owner lands on login; a cashier is refused; the owner reaches home', async ({ page }) => {
  const api = await setup(page, { signedIn: false })

  await page.goto('/approvals')
  await expect(page).toHaveURL(/\/login\?to=(%2F|\/)approvals/)
  await expectNoSideScroll(page)

  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Enter your email and password.')).toBeVisible()

  await page.getByLabel('Email').fill('cashier@alpha.uz')
  await page.getByLabel('Password', { exact: true }).fill('secret')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('This app is for owners only.', { exact: false })).toBeVisible()
  expect(api.calls.some(r => r.url().endsWith('/auth-logout') && r.headers().authorization === 'Bearer cashier-token')).toBe(true)

  await page.getByLabel('Email').fill('owner@alpha.uz')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/approvals$/)
  await expect(page.getByText('Gas cylinder refill 41')).toBeVisible()
})

test('home shows today\'s sales and the money summary', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await expect(page.getByText('Sales today')).toBeVisible()
  await expect(page.getByText('12,000,000').first()).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await expectNoSideScroll(page)
})

test('approve and pay goes through a confirm step with an idempotency key', async ({ page }) => {
  const api = await setup(page)
  await page.goto('/approvals')

  await expect(page.getByText('Waiting for approval')).toBeVisible()
  await page.getByText('Gas cylinder refill 41').click()
  await expect(page).toHaveURL(/\/approvals\/41$/)
  await expect(page.getByText('350,000').first()).toBeVisible()
  await expect(page.getByText('Utilities › Gas')).toBeVisible()
  await expect(page.getByText('[IMPORT')).toHaveCount(0)
  await expectNoSideScroll(page)

  await page.getByRole('button', { name: 'Approve and pay' }).click()
  await expect(page.getByText('350,000 UZS will be paid from', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Pay 350,000 UZS' }).click()

  await expect(page).toHaveURL(/\/approvals$/)
  const approve = api.calls.filter(r => r.url().endsWith('/expenses/41/approve'))
  const pay = api.calls.filter(r => r.url().endsWith('/expenses/41/pay'))
  expect(approve).toHaveLength(1)
  expect(pay).toHaveLength(1)
  expect(pay[0].postDataJSON()).toMatchObject({ source_account: 'SAFE' })
  expect(pay[0].headers()['idempotency-key']).toBeTruthy()
})

test('reject needs a reason; the owner cannot approve their own request', async ({ page }) => {
  const api = await setup(page)
  await page.goto('/approvals/41')

  await page.getByRole('button', { name: 'Reject' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'Reject' })).toBeDisabled()
  await dialog.getByRole('textbox').fill('Duplicate of yesterday')
  await dialog.getByRole('button', { name: 'Reject' }).click()
  await expect(page).toHaveURL(/\/approvals$/)
  const reject = api.calls.find(r => r.url().endsWith('/expenses/41/reject'))
  expect(reject?.postDataJSON()).toEqual({ reason: 'Duplicate of yesterday' })

  await page.goto('/approvals/43')
  await expect(page.getByText('You created this expense.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve and pay' })).toHaveCount(0)

  await page.goto('/approvals/42')
  await expect(page.getByRole('button', { name: 'Pay', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0)
})

test('money, suppliers, salaries and settings render on a phone', async ({ page }) => {
  await setup(page)

  await page.goto('/money')
  await expect(page.getByText('18,900,000')).toBeVisible()
  await expect(page.getByText('Movement 1-0')).toBeVisible()
  await expect(page.getByText('[SAFE')).toHaveCount(0)
  await page.getByText('Movement 1-29').scrollIntoViewIfNeeded()
  await expect(page.getByText('Movement 2-0')).toBeVisible()
  await expectNoSideScroll(page)

  await page.getByRole('link', { name: 'Suppliers' }).click()
  await expect(page.getByText('7,400,000')).toBeVisible()
  await expect(page.getByText('Old Supplier')).toHaveCount(0)
  await page.getByText('Andijan Meat').click()
  await expect(page).toHaveURL(/\/suppliers\/5$/)
  await expect(page.getByText('Pizza meat')).toBeVisible()
  await expectNoSideScroll(page)

  await page.goto('/more')
  await page.getByText('Salaries').click()
  await expect(page.getByText('Muhlisa Karimova')).toBeVisible()
  await expect(page.getByText('6,050,000').first()).toBeVisible()
  await expectNoSideScroll(page)

  await page.goto('/more/settings')
  await page.getByRole('tab', { name: 'Русский' }).click()
  await expect(page.getByText('Настройки').first()).toBeVisible()
})

test('an expired session returns to login without reloading the app', async ({ page }) => {
  const api = await setup(page)
  await page.goto('/')
  await expect(page.getByText('Sales today')).toBeVisible()
  await page.evaluate(() => { (window as any).__stillHere = true })

  api.unauthorized = true
  await page.getByRole('link', { name: 'Money' }).click()
  await expect(page).toHaveURL(/\/login/)
  expect(await page.evaluate(() => (window as any).__stillHere)).toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('accessToken'))).toBeNull()
})

for (const locale of ['uz', 'ru'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`home and approvals fit the phone in ${locale}/${theme}`, async ({ page }) => {
      await setup(page, { locale, theme })
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByText('12,000,000').first()).toBeVisible()
      await expectNoSideScroll(page)
      await shot(page, `home-${locale}-${theme}`)
      await page.goto('/approvals')
      await expect(page.getByText('Gas cylinder refill 41')).toBeVisible()
      await shot(page, `approvals-${locale}-${theme}`)
      await page.goto('/approvals/41')
      await expect(page.getByText('350,000').first()).toBeVisible()
      await expectNoSideScroll(page)
      await shot(page, `expense-${locale}-${theme}`)
      for (const path of ['/money', '/suppliers', '/suppliers/5', '/more', '/more/settings']) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        await expectNoSideScroll(page)
        await shot(page, `${path.slice(1).replace(/\//g, '-')}-${locale}-${theme}`)
      }
    })
  }
}
