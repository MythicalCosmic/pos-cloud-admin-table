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
interface State { fail?: boolean; empty?: boolean; gate?: Promise<void>; ordersFail?: boolean; ordersGate?: Promise<void>; many?: boolean }
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
    if (path.endsWith('/orders') && state.ordersGate) await state.ordersGate
    if (path.endsWith('/orders') && state.ordersFail) { await route.fulfill({ status: 500, json: { message: 'Orders temporarily unavailable' } }); return }
    let data: any = { items: [], total: 0, users: [], categories: [], products: [] }
    if (path.endsWith('/loyalty/settings/')) data = settings
    else if (path.endsWith('/loyalty/accounts/')) data = state.empty ? [] : accounts
    else if (path.endsWith('/orders')) data = { orders: state.empty ? [] : state.many ? Array.from({ length: 10 }, (_, i) => ({ ...orders[i % 2], id: 600 + i, order_number: String(201 + i), status: i < 2 ? 'PREPARING' : 'READY', is_paid: i > 0, ready_at: i % 3 ? '2026-09-09T09:40:00+05:00' : null, items: Array.from({ length: i % 5 + 1 }, (_, j) => ({ product__name: j % 2 ? 'Pitsa assorted' : 'Non burger standard', quantity: j + 1, price: 12000 })) })) : url.searchParams.get('statuses') === 'PREPARING' ? [orders[0]] : orders, pagination: { total_orders: state.empty ? 0 : state.many ? 36084 : url.searchParams.get('statuses') === 'PREPARING' ? 1 : 2 } }
    else if (path.endsWith('/orders/stats')) data = { total_orders: state.empty ? 0 : state.many ? 36084 : 2, paid_orders: state.empty ? 0 : state.many ? 36072 : 1, total_revenue: state.empty ? 0 : state.many ? 1860063300 : 332000, status_counts: state.many ? { OPEN: 0, PREPARING: 2, READY: 36071, COMPLETED: 9, CANCELED: 2 } : { PREPARING: 1, COMPLETED: 1 }, payment_breakdown: state.many ? { CASH: '1624316927', HUMO: '227078973', PAYME: '8667400' } : { CASH: '175000', HUMO: '105000', PAYME: '52000' }, payment_total: state.many ? 1860063300 : 332000 }
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
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Filter by Status', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  await page.getByRole('button', { name: 'Filter by Status', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Preparing', exact: true }).click()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.locator('.order-ticket')).toHaveCount(1)
  expect(calls.some(call => call.url.searchParams.get('statuses') === 'PREPARING')).toBeTruthy()
  const card = page.locator('.order-ticket')
  await card.getByRole('button', { name: 'Details', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Aziza Karimova')
  await expect(page.getByRole('dialog')).toContainText('Signature lavash with grilled chicken')
  await expect(page.getByRole('dialog')).toContainText('Александра')
  await page.screenshot({ path: '/tmp/alpha-orders-details-phone.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(card.getByRole('button', { name: 'Details', exact: true })).toBeFocused()
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

test('ten tickets align and opening full details leaves every card in position', async ({ page }) => {
  await setup(page, { many: true }, 'en', 'light')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto('/orders')
  await expect(page.locator('.order-ticket')).toHaveCount(10)
  const bounds = () => page.locator('.order-ticket').evaluateAll(elements => elements.map(el => { const rect = el.getBoundingClientRect(); return { top: rect.top + scrollY, height: rect.height } }))
  const before = await bounds()
  for (const card of before) {
    const peers = before.filter(item => item.top === card.top)
    expect(Math.max(...peers.map(item => item.height)) - Math.min(...peers.map(item => item.height))).toBeLessThan(1)
  }
  await page.locator('.order-ticket').first().getByRole('button', { name: 'Details', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const detailWidth = (await page.getByRole('dialog').boundingBox())?.width ?? 0
  expect(detailWidth).toBeGreaterThanOrEqual(620)
  expect(detailWidth).toBeLessThanOrEqual(640)
  expect(await bounds()).toEqual(before)
  await page.screenshot({ path: '/tmp/alpha-orders-details-desktop.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Order insights', exact: true }).click()
  await expect(page.locator('.ordersinsights__payment-status .distribution__rows')).toContainText('99.97%')
  for (const width of [1920, 1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await fits(page)
    await page.locator('.ordersinsights').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `/tmp/alpha-orders-insights-${width}.png`, animations: 'disabled' })
  }
})

for (const locale of ['en', 'ru', 'uz']) {
  for (const theme of ['light', 'dark']) {
    test(`customer and order registers preserve dense desktop and phone layouts in ${locale}/${theme}`, async ({ page }) => {
      const state: State = {}
      await setup(page, state, locale, theme)
      for (const path of ['/loyalty', '/orders']) {
        await page.goto(path)
        await expect(page.locator('#app-loader')).toHaveCount(0)
        if (path === '/loyalty') await expect(page.locator('.data-table')).not.toHaveAttribute('aria-busy', 'true')
        else await expect(page.locator('.order-ticket')).toHaveCount(2)
        for (const width of [1440, 390, 320]) {
          await page.setViewportSize({ width, height: 900 })
          if (path === '/orders') await expect(page.locator('.order-ticket')).toHaveCount(2)
          else if (width < 700) await expect(page.locator('.mobile-record')).toHaveCount(2)
          else await expect(page.locator('.dtable tbody tr')).toHaveCount(2)
          await fits(page)
          if ((locale === 'en' && theme === 'dark') || (locale === 'ru' && theme === 'light')) await page.screenshot({ path: `/tmp/alpha-${path.slice(1)}-${locale}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' })
        }
      }
    })
  }
}


test('order tickets and the complete table share selection, details, and real CSV downloads', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/orders')
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  await page.locator('.order-ticket').filter({ hasText: '#1042' }).getByRole('checkbox').click()
  await expect(page.locator('.bulkbar')).toContainText('1 selected')
  const download = page.waitForEvent('download')
  await page.locator('.bulkbar').getByRole('button', { name: 'Export', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/\.csv$/)
  await page.getByRole('button', { name: 'Table', exact: true }).click()
  await expect(page.locator('.dtable tbody tr')).toHaveCount(2)
  await expect(page.locator('.dtable thead')).toContainText('Cashier')
  await expect(page.locator('.dtable thead')).toContainText('Prep Time')
  await expect(page.locator('.dtable thead')).toContainText('Paid at')
  await expect(page.locator('.bulkbar')).toContainText('1 selected')
  await page.screenshot({ path: '/tmp/alpha-orders-table-desktop.png', animations: 'disabled' })
  await page.getByRole('button', { name: 'Tickets', exact: true }).click()
  await page.locator('.bulkbar').getByRole('button', { name: 'Clear selection', exact: true }).click()
  await page.getByRole('button', { name: 'Order insights', exact: true }).click()
  await expect(page.locator('.ordersinsights')).toBeVisible()
  await fits(page)
})

test('orders distinguish initial loading, failed requests, stale records, and a real empty result', async ({ page }) => {
  let release!: () => void
  const state: State = { ordersGate: new Promise<void>(resolve => { release = resolve }) }
  await setup(page, state)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/orders')
  await expect(page.locator('.orders-board__skeleton')).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-orders-loading-phone.png', animations: 'disabled' })
  release()
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  state.ordersFail = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.orders-load-error')).toContainText('last available records')
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  await page.reload()
  await expect(page.locator('.orders-load-error')).toContainText('Failed to load orders')
  await expect(page.locator('.orders-board > .statefill')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/alpha-orders-error-phone.png', animations: 'disabled' })
  state.ordersFail = false; state.empty = true
  await page.locator('.orders-load-error').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.getByText('No orders match your filters', { exact: true })).toBeVisible()
  await expect(page.locator('.orders-load-error')).toHaveCount(0)
  await fits(page)
  await page.screenshot({ path: '/tmp/alpha-orders-empty-phone.png', animations: 'disabled' })
})


test('Orders shares the dashboard date toolbar and applies dates to records and totals together', async ({ page }) => {
  const calls = await setup(page)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/orders')
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  await page.getByRole('combobox', { name: 'Rows per page', exact: true }).click()
  await page.getByRole('option', { name: '25', exact: true }).click()
  await expect.poll(() => calls.some(call => call.url.pathname.endsWith('/orders') && call.url.searchParams.get('per_page') === '25')).toBe(true)
  const latest = (path: string) => calls.filter(call => call.url.pathname.endsWith(path)).at(-1)?.url.searchParams
  const quick = () => page.getByRole('combobox', { name: 'Quick select', exact: true })
  await expect(quick()).toContainText('All time')
  await expect(page.locator('.date-fields__error')).toHaveCount(0)
  expect(latest('/orders')?.has('date_from')).toBe(false)
  await quick().click()
  await page.getByRole('option', { name: 'Today', exact: true }).click()
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  expect(latest('/orders')?.get('date_from')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  expect(latest('/orders/stats')?.get('date_from')).toBe(latest('/orders')?.get('date_from'))
  await page.getByRole('button', { name: 'Working hours', exact: true }).click()
  await page.locator('.date-fields').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  expect(latest('/orders')?.get('from_at')).toContain('T')
  expect(latest('/orders/stats')?.get('from_at')).toBe(latest('/orders')?.get('from_at'))
  expect(latest('/orders/stats')?.get('to_at')).toBe(latest('/orders')?.get('to_at'))
  await page.screenshot({ path: '/tmp/alpha-orders-date-desktop.png', animations: 'disabled' })
  await quick().click()
  await page.getByRole('option', { name: 'All time', exact: true }).click()
  await expect(page.locator('.order-ticket')).toHaveCount(2)
  expect(latest('/orders')?.has('from_at')).toBe(false)
  expect(latest('/orders/stats')?.has('date_from')).toBe(false)
  await page.setViewportSize({ width: 320, height: 844 })
  const trigger = page.getByRole('button', { name: 'Date range', exact: true })
  await expect(trigger).toContainText('All time')
  await trigger.click()
  await expect(page.getByRole('dialog').locator('.date-fields')).toBeVisible()
  await expect(page.locator('.date-fields__error')).toHaveCount(0)
  await fits(page)
  await page.screenshot({ path: '/tmp/alpha-orders-date-phone.png', animations: 'disabled' })
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('Order insight controls filter by status or payment and keep tender details interactive', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/orders')
  await page.getByRole('button', { name: 'Order insights', exact: true }).click()
  await expect(page.locator('.ordersinsights__tenders .distribution__row')).toHaveCount(3)
  const unpaid = page.locator('.ordersinsights__payment-status .distribution__row').filter({ hasText: 'Unpaid' })
  await unpaid.click()
  await expect(unpaid).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => calls.some(call => call.url.pathname.endsWith('/orders') && call.url.searchParams.get('payment_status') === 'UNPAID')).toBe(true)
  await unpaid.click()
  await expect(unpaid).toHaveAttribute('aria-pressed', 'false')
  await page.locator('.order-status-strip__items button').filter({ hasText: 'Preparing' }).click()
  await expect(page.locator('.order-ticket')).toHaveCount(1)
  await page.locator('.ordersinsights__tenders .distribution__row').filter({ hasText: 'Card' }).click()
  await expect(page.locator('.ordersinsights__tenders .distribution__summary')).toContainText('105')
  await expect(page.locator('.ordersinsights__tenders .distribution__summary')).toContainText('Card')
})
