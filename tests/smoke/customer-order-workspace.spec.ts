import { type Page, expect, test } from '@playwright/test'

// Transport-only fixtures: never shipped in the application.
const accounts = [
  { phone_number: '+998901234567', stamps_balance: 12, stamps_earned_total: 32, stamps_redeemed_total: 20, updated_at: '2026-09-09T08:30:00+05:00' },
  { phone_number: '+998909876543', stamps_balance: 3, stamps_earned_total: 3, stamps_redeemed_total: 0, updated_at: '2026-09-08T10:15:00+05:00' },
]
const orders = [
  { id: 500, order_number: '1042', order_type: 'HALL', status: 'PREPARING', is_paid: false, total_amount: '245000', customer: { name: 'Александра Константиновна Мирзаева' }, cashier: { name: 'Aziza Karimova' }, created_at: '2026-09-09T08:30:00+05:00', phone_number: '+998901234567', items: [{ product__name: 'Signature lavash with grilled chicken', quantity: 2, price: 122500 }] },
  { id: 501, order_number: '1043', order_type: 'DELIVERY', status: 'COMPLETED', is_paid: true, total_amount: '87000', cashier: { name: 'Aziza Karimova' }, created_at: '2026-09-09T09:30:00+05:00', paid_at: '2026-09-09T09:35:00+05:00', items: [] },
]
interface State { fail?: boolean; empty?: boolean; gate?: Promise<void> }
async function setup(page: Page, state: State = {}, locale = 'en', theme = 'light') {
  const calls: { url: URL; method: string; body: any }[] = []
  let settings = { is_enabled: true, stamps_per_completed_order: 1, stamps_per_reward: 10, reward_description: 'Free coffee' }
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem('appLocale', locale)
    localStorage.setItem('alphapos-theme', theme)
    localStorage.setItem('accessToken', JSON.stringify('register-workspace-fixture'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme })
  page.on('pageerror', error => { throw error })
  await page.route('**/api/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname
    calls.push({ url, method: req.method(), body: req.postDataJSON() })
    if (req.method() !== 'GET') {
      if (state.gate) await state.gate
      if (!state.fail && path.endsWith('/loyalty/settings/')) settings = req.postDataJSON()
      await route.fulfill({ status: state.fail ? 422 : 200, json: state.fail ? { message: 'Please check the values and try again.' } : { data: settings } })
      return
    }
    let data: any = { items: [], total: 0, users: [], categories: [], products: [] }
    if (path.endsWith('/loyalty/settings/')) data = settings
    else if (path.endsWith('/loyalty/accounts/')) data = state.empty ? [] : accounts
    else if (path.endsWith('/orders')) data = { orders: state.empty ? [] : url.searchParams.get('statuses') === 'PREPARING' ? [orders[0]] : orders, pagination: { total_orders: state.empty ? 0 : url.searchParams.get('statuses') === 'PREPARING' ? 1 : 2 } }
    else if (path.endsWith('/orders/stats')) data = { total_orders: state.empty ? 0 : 2, paid_orders: state.empty ? 0 : 1, total_revenue: state.empty ? 0 : 332000, status_counts: { PREPARING: 1, COMPLETED: 1 }, payment_methods: {}, payment_total: 87000 }
    else if (path.endsWith('/categories')) data = { categories: [{ id: 1, name: 'Main dishes' }] }
    else if (path.endsWith('/products')) data = { products: [{ id: 2, name: 'Signature lavash' }] }
    else if (path.endsWith('/users')) data = { users: [{ id: 4, first_name: 'Aziza', last_name: 'Karimova' }] }
    await route.fulfill({ json: { data } })
  })
  return calls
}
async function fits(page: Page) {
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll<HTMLElement>('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 2 && el.getBoundingClientRect().width > 1).slice(0, 14).map(el => ({ tag: el.tagName, class: el.className, width: el.clientWidth, scroll: el.scrollWidth })) }))
  expect(geometry.scroll, JSON.stringify(geometry.overflow)).toBeLessThanOrEqual(geometry.width + 1)
  const clips = await page.locator('.mobile-record__fields > div, .mobile-record__head, .customers-program, .orders-toolbar').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className))
  expect(clips).toEqual([])
}

test('customer settings discard unsaved edits and show guarded server errors', async ({ page }) => {
  const state: State = {}
  const calls = await setup(page, state)
  await page.goto('/loyalty')
  await expect(page.locator('.customers-program')).toContainText('Free coffee')
  await expect(page.getByLabel('Reward description')).toHaveCount(0)
  await page.getByRole('button', { name: 'Loyalty Settings', exact: true }).click()
  await page.getByLabel('Reward description').fill('Unsaved reward')
  await page.keyboard.press('Escape')
  await expect(page.locator('.customers-program')).toContainText('Free coffee')
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(0)
  await page.getByRole('button', { name: 'Loyalty Settings', exact: true }).click()
  await expect(page.getByLabel('Reward description')).toHaveValue('Free coffee')
  state.fail = true
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await page.getByRole('button', { name: 'Save', exact: true }).dblclick()
  expect(calls.filter(call => call.method === 'PUT')).toHaveLength(1)
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Please check the values')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('phone orders keep filters, complete details, selection and mutation errors available', async ({ page }) => {
  const state: State = { fail: true }
  const calls = await setup(page, state)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/orders')
  await expect(page.locator('.mobile-record')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Filter by Status', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('button', { name: 'Filter by Status', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Preparing', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.mobile-record')).toHaveCount(1)
  expect(calls.some(call => call.url.searchParams.get('statuses') === 'PREPARING')).toBeTruthy()
  const card = page.locator('.mobile-record')
  await card.getByRole('button', { name: 'Details', exact: true }).click()
  await expect(card).toContainText('Aziza Karimova')
  await expect(card).toContainText('Signature lavash with grilled chicken')
  await expect(card).toContainText('Александра')
  await card.getByRole('checkbox').click()
  await expect(page.locator('.bulkbar')).toContainText('1 selected')
  let release!: () => void
  state.gate = new Promise(resolve => { release = resolve })
  await card.getByRole('button', { name: 'Mark ready', exact: true }).dblclick()
  expect(calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/ready'))).toHaveLength(1)
  release()
  await expect(page.locator('.alpha-toast').last()).toContainText('Please check the values')
  await fits(page)
  await page.screenshot({ path: '/tmp/alpha-orders-expanded-phone.png', fullPage: true, animations: 'disabled' })
})

for (const locale of ['en', 'ru', 'uz']) {
  for (const theme of ['light', 'dark']) {
    test(`customer and order registers preserve dense desktop and phone layouts in ${locale}/${theme}`, async ({ page }) => {
      const state: State = {}
      await setup(page, state, locale, theme)
      for (const path of ['/loyalty', '/orders']) {
        await page.goto(path)
        await expect(page.locator('#app-loader')).toHaveCount(0)
        await expect(page.locator('.data-table')).not.toHaveAttribute('aria-busy', 'true')
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 900 })
          if (width < 700) await expect(page.locator('.mobile-record')).toHaveCount(2)
          else await expect(page.locator('.dtable tbody tr')).toHaveCount(2)
          await fits(page)
          if ((locale === 'en' && theme === 'dark') || (locale === 'ru' && theme === 'light')) await page.screenshot({ path: `/tmp/alpha-${path.slice(1)}-${locale}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' })
        }
      }
    })
  }
}
