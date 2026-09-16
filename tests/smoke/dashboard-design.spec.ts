import { type Page, expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { alphaPaletteTokens } from '../../src/config/palettes'

// Deterministic fixtures are confined to tests; the application always uses the API.
const revenueSeries = Array.from({ length: 30 }, (_, i) => 1_250_000 + (i % 6) * 230_000 + Math.floor(i / 7) * 110_000)
const revenue = revenueSeries.reduce((sum, value) => sum + value, 0)
const channels = revenueSeries.map((_, i) => ({ hall: 16 + i % 7, delivery: 3, pickup: 2 }))
const orders = channels.reduce((sum, row) => sum + row.hall + row.delivery + row.pickup, 0)

const categories = [
  { category: 'Основные блюда и фирменные предложения ресторана', revenue: Math.round(revenue * 0.42) },
  { category: 'Drinks & refreshments', revenue: Math.round(revenue * 0.27) },
  { category: 'Desserts', revenue: Math.round(revenue * 0.18) },
  { category: 'Salads', revenue: Math.round(revenue * 0.07) },
  { category: 'Bakery', revenue: Math.round(revenue * 0.03) },
  { category: 'Extras', revenue: Math.round(revenue * 0.02) },
  { category: 'Seasonal specials', revenue: Math.round(revenue * 0.01) },
]

const grouped = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

interface FixtureState {
  fail?: boolean
  empty?: boolean
  partial?: boolean
  todayFallback?: boolean
  todayOrders?: number | null
  gate?: Promise<void>
  failPaths?: string[]
  staffCount?: number
  paretoTotal?: number
  paretoShares?: boolean
  productCount?: number
  role?: string
  partialChannels?: boolean
  expenseCount?: number
}

function salesFixture(state: FixtureState) {
  return {
    monthRevenue: state.empty ? 0 : revenue,
    expense30: state.empty ? [] : revenueSeries.map(v => Math.round(v * 0.2)),
    revenue30: state.empty ? [] : revenueSeries,
    dayLabels: state.empty ? [] : revenueSeries.map((_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`),
    channelDays: state.empty ? [] : channels.map((row, i) => ({ ...row, delivery: state.partialChannels && i === 0 ? null : row.delivery, pickup: state.partialChannels && i === 0 ? 0 : row.pickup, day: `2026-08-${String(i + 1).padStart(2, '0')}` })),
    grossMargin: state.empty ? undefined : 0.64,
    previous_period: state.empty
      ? undefined
      : {
        revenue_series: revenueSeries.map(value => Math.round(value * 0.8)),
        range: { from: '2026-07-01', to: '2026-07-30' },
      },
  }
}

function rangeFixture(state: FixtureState, url: URL) {
  return {
    revenue: state.empty ? 0 : revenue,
    paid_orders: state.empty ? 0 : orders,
    orders: state.empty ? 0 : orders,
    units_sold: state.empty ? 0 : 1427,
    cancelled: state.empty ? 0 : 12,
    payment_breakdown: state.empty ? {} : { cash: revenue * 0.5, card: revenue * 0.3, payme: revenue * 0.2, card_detail: { HUMO: revenue * 0.3 } },
    category_stats: (state.empty || state.todayFallback) ? [] : categories,
    live_order_feed: state.empty
      ? []
      : [
        { id: 7894, order_number: '1042', display_id: 'legacy-42', order_type: 'HALL', table: { name: '12' }, total_amount: 245000, status: 'READY', created_at: new Date().toISOString() },
        { id: 7893, display_id: '1041', order_type: 'DELIVERY', delivery_address: 'Мирзо-Улугбекский район, улица Амира Темура, дом 25', total_amount: 390000, status: 'PREPARING', created_at: new Date(Date.now() - 180000).toISOString() },
        { id: 7892, order_number: '1040', order_type: 'PICKUP', total_amount: 87000, status: 'COMPLETED', created_at: new Date(Date.now() - 360000).toISOString() },
      ],
    range: { from: url.searchParams.get('from'), to: url.searchParams.get('to') },
  }
}

const productFixtureRows = ['Signature lavash with grilled chicken', 'Pizza Margherita', 'Fresh lemonade'].map((name, i) => ({
  product_id: i + 1, product_name: name, qty_sold: 150 - i * 30, revenue: 8_500_000 - i * 1_500_000,
}))

const sectionFixtures: Record<string, (empty?: boolean) => unknown> = {
  '/dashboard/sales/expenses': empty => ({
    total_expense: empty ? 0 : 850000,
    expenses: empty ? [] : [{ id: 21, amount: '850000', comment: 'Fresh produce and kitchen supplies', category: 'Supplies', created_at: '2026-08-30T08:20:00Z', shift_id: 7, cashier_name: 'Aziza Karimova' }],
  }),
  '/analytics/products/overview': empty => ({
    total_revenue: empty ? 0 : revenue, total_units: empty ? 0 : 1427, distinct_products_sold: empty ? 0 : 28, top_products: (empty ? [] : productFixtureRows),
  }),
  '/analytics/products/categories': empty => ({ categories: empty ? [] : categories.map((row, i) => ({ ...row, units: 350 - i * 40 })) }),
  '/analytics/products/pareto': empty => ({ products: (empty ? [] : productFixtureRows) }),
  '/analytics/products/trends': empty => ({
    daily: empty ? [] : revenueSeries.map((value, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, revenue: value })),
    top_products_trend: (empty ? [] : productFixtureRows).map(row => ({ ...row, total_revenue: row.revenue, points: revenueSeries.map((_, i) => ({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, qty: 5, revenue: row.revenue / 30 })) })),
  }),
  '/analytics/products/affinity': empty => ({
    products: (empty ? [] : productFixtureRows).map((row, i) => ({ id: row.product_id, name: row.product_name, orders: 250 - i * 25, price: 25000 })),
    pairs: empty ? [] : [{ a: 0, b: 1, count: 42 }, { a: 0, b: 2, count: 35 }, { a: 1, b: 2, count: 21 }],
    totalOrders: empty ? 0 : 450,
  }),
  '/staff/performance': empty => ({
    staff: empty
      ? []
      : ['Aziza Karimova', 'Александр Константинович', 'Sardor Mirzayev'].map((name, i) => ({
        user_id: i + 1, name, revenue: 10_000_000 - i * 1_500_000, orders_total: 150 - i * 15, avg_order_value: 65000, hours_worked: 96 - i * 12, cancel_rate_pct: i + 1, shifts_worked: 8 - i,
      })),
  }),
  '/dashboard/operations': empty => ({
    funnel: empty ? [] : [{ status: 'PREPARING', count: 12 }, { status: 'READY', count: 4 }, { status: 'COMPLETED', count: 340 }, { status: 'CANCELED', count: 12 }],
    ordersByHour: empty ? [] : Array.from({ length: 16 }, (_, i) => ({ hour: String(i + 7), orders: 12 + i % 5 * 3 })),
    prepByCategory: empty ? [] : categories.map((row, i) => ({ label: row.category, mins: 8 + i, target: 12, orders: 90 - i * 10 })),
    tableGrid: empty ? [] : Array.from({ length: 8 }, (_, i) => ({ n: i + 1, status: ['seated', 'free', 'reserved', 'cleaning'][i % 4], guests: i % 4 + 1, mins: i * 3 + 10 })),
  }),
  '/orders/stats': empty => ({ preparing_orders: empty ? 0 : 12, ready_orders: empty ? 0 : 4, unpaid_orders: empty ? 0 : 3 }),
}

function sectionFixture(path: string, state: FixtureState) {
  const key = Object.keys(sectionFixtures).find(endpoint => path.endsWith(endpoint))
  if (key === '/staff/performance' && state.staffCount !== undefined) {
    const data = sectionFixtures[key](state.empty) as { staff: unknown[] }
    return { staff: Array.from({ length: state.staffCount }, (_, index) => ({ ...(data.staff[index % data.staff.length] as object), user_id: index + 1, ...(index >= data.staff.length ? { name: `Team member ${index + 1}`, revenue: 4_000_000 - index * 100_000 } : {}) })) }
  }
  if (key === '/dashboard/sales/expenses' && state.expenseCount !== undefined) {
    return { total_expense: state.expenseCount * 100_000, expenses: Array.from({ length: state.expenseCount }, (_, index) => ({ id: index + 1, amount: 100_000, comment: `Expense record ${index + 1}`, category: 'Supplies', created_at: '2026-08-30T08:20:00Z', shift_id: 7, cashier_name: 'Aziza Karimova' })) }
  }
  return key ? sectionFixtures[key](state.empty) : null
}

function todayFixture(state: FixtureState) {
  const orderCount = state.empty ? 0 : state.todayOrders === undefined ? 42 : state.todayOrders
  const hasSales = typeof orderCount === 'number' && orderCount > 0

  return {
    today: {
      orders: orderCount,
      peak_hour: hasSales ? { hour: 13, orders: 11, revenue: 690000 } : null,
    },
    top_products_today: hasSales
      ? [{ product_id: 1, product_name: 'Signature lavash with grilled chicken', quantity: 28, revenue: 1_400_000 }]
      : [],
    category_stats_today: state.todayFallback ? categories : [],
  }
}

async function setup(page: Page, state: FixtureState = {}, locale = 'en', theme = 'light') {
  await page.addInitScript(initial => {
    localStorage.setItem('appLocale', initial.locale)
    if (!localStorage.getItem('alphapos-theme')) localStorage.setItem('alphapos-theme', initial.theme)
    localStorage.setItem('alphapos-dashview', 'exec')
    localStorage.setItem('accessToken', JSON.stringify('dashboard-design-test-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, name: 'Design review', role: initial.role, permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  }, { locale, theme, role: state.role ?? 'ADMIN' })

  const calls: URL[] = []

  page.on('pageerror', error => { throw error })

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname

    calls.push(url)
    if (path.includes('/dashboard') && state.gate)
      await state.gate
    if (state.failPaths?.some(endpoint => path.endsWith(endpoint)) || (path.includes('/dashboard') && (state.fail || (state.partial && path.endsWith('/sales'))))) {
      await route.fulfill({ status: 500, json: { message: 'Fixture unavailable' } })
      return
    }
    let payload = sectionFixture(path, state)
    if (path.endsWith('/analytics/products/pareto') && !state.empty) {
      const products = state.productCount ? Array.from({ length: state.productCount }, (_, index) => ({ product_id: index + 1, product_name: `Product ${index + 1}`, qty_sold: state.productCount! - index, revenue: (state.productCount! - index) * 1000 })) : productFixtureRows
      let sum = 0
      payload = { total_revenue: state.paretoTotal, products: products.map(row => {
        sum += row.revenue
        return { ...row, ...(state.paretoShares ? { pct_of_revenue: row.revenue / revenue * 100, cumulative_pct: sum / revenue * 100 } : {}) }
      }) }
    }
    if (payload !== null) {
      await route.fulfill({ json: { data: payload } })
      return
    }
    if (path.endsWith('/dashboard/sales')) {
      await route.fulfill({ json: { data: salesFixture(state) } })
      return
    }
    if (path.endsWith('/dashboard/today')) {
      await route.fulfill({ json: { data: todayFixture(state) } })
      return
    }
    if (path.endsWith('/dashboard')) {
      await route.fulfill({ json: { data: rangeFixture(state, url) } })
      return
    }
    await route.fulfill({ json: { data: { items: [], total: 0 } } })
  })
  return calls
}

async function expectNoOverflow(page: Page) {
  const geometry = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
    overflowing: [...document.querySelectorAll<HTMLElement>('main *')]
      .filter(el => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 35)
      .map(el => ({ tag: el.tagName, class: el.getAttribute('class'), right: el.getBoundingClientRect().right, width: el.getBoundingClientRect().width })),
    clipped: [...document.querySelectorAll<HTMLElement>('.date-fields__row, .datetime-field__trigger, .today-orders, .date-fields__timebar, .distribution__row, .series-explorer__point, .summary-metric__value, .summary-lead__amount, .overview-panel__head, .overview-order, .overview-chart-value, .channel-flow__selection, .dashboard-section__head, .herokpi__value, .kpi__value, .sales-expense-list__row')]
      .filter(el => el.clientWidth > 1 && el.scrollWidth > el.clientWidth + 1)
      .map(el => el.className),
  }))

  expect(geometry.scroll, JSON.stringify(geometry.overflowing)).toBeLessThanOrEqual(geometry.width + 1)
  expect(geometry.clipped).toEqual([])
}

async function expectReadableChartLabels(page: Page) {
  await expect.poll(() => page.locator('main svg').evaluateAll(charts => charts.flatMap(chart => {
    const labels = [...chart.querySelectorAll('.chart-axis-label')]
      .filter(label => label.getBoundingClientRect().width > 0)
      .map(label => ({ text: label.textContent, rect: label.getBoundingClientRect() }))

    return labels.filter((label, i) => i > 0 && label.rect.left < labels[i - 1].rect.right + 3)
      .map(label => label.text)
  }))).toEqual([])
}

async function expectDonutLabelContrast(page: Page) {
  const ratios = await page.locator('.distribution__ring-label').evaluateAll(labels => labels.map(label => {
    const luminance = (color: string) => {
      const rgb = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => channel / 255)
      return rgb.reduce((sum, value, index) => sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index], 0)
    }
    const text = label.querySelector('text')!
    const back = label.querySelector('rect')
    if (!back) return 0
    const foreground = luminance(getComputedStyle(text).fill)
    const background = luminance(getComputedStyle(back).fill)
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
  }))
  expect(ratios.length).toBeGreaterThan(0)
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5)
}

async function expectChannelColorConsistency(page: Page) {
  const channels = await page.locator('.channel-flow__selection dt i').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))
  expect(channels).toHaveLength(3)
  expect(new Set(channels).size).toBe(3)
  const mix = await page.locator('.sales-order-type .distribution__track > span').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))
  const ledger = await page.locator('.daily-ledger tbody tr').first().locator('.daily-ledger__channel i').evaluateAll(els => els.map(el => getComputedStyle(el).backgroundColor))
  expect(mix).toEqual(channels)
  expect(ledger).toEqual(channels)
}

interface ExportState { gate?: Promise<void>; error?: boolean }
async function mockReportExports(page: Page, state: ExportState = {}) {
  const calls: URL[] = []
  await page.route('**/api/admins/reports/product-performance/export?**', async route => {
    const url = new URL(route.request().url())
    const format = url.searchParams.get('format')!
    calls.push(url)
    if (format === 'xlsx' && state.gate)
      await state.gate
    if (state.error) {
      await route.fulfill({ status: 413, json: { success: false, code: 'REPORT_TOO_LARGE', message: 'Choose a shorter period' } })
      return
    }
    await route.fulfill({
      contentType: format === 'csv' ? 'text/csv' : format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      headers: { 'Access-Control-Expose-Headers': 'Content-Disposition, X-Report-Cost-Complete, X-Export-Count', 'Content-Disposition': `attachment; filename="fallback.${format}"; filename*=UTF-8''Sales%20%E2%80%94%20${url.searchParams.get('from')}.${format}`, 'X-Report-Cost-Complete': 'true', 'X-Export-Count': '185' },
      body: `Product,Revenue\nALL PRODUCTS,185\nTOTAL,123456.78\n`,
    })
  })
  return calls
}

test('dashboard exports all report formats for the applied dates and a useful exact snapshot', async ({ page }) => {
  const calls = await setup(page)
  const exports = await mockReportExports(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  const range = calls.filter(url => url.pathname.endsWith('/dashboard')).at(-1)!
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Export', exact: true })
  await expect(menu).toContainText('Product performance')
  await expect(menu).toContainText('07:00–03:00 next day')
  for (const [format, label] of [['xlsx', 'XLSX Excel'], ['pdf', 'PDF PDF'], ['csv', 'CSV CSV']]) {
    const pending = page.waitForEvent('download')
    await menu.getByRole('menuitem', { name: label, exact: true }).click()
    const file = await pending
    expect(file.suggestedFilename()).toBe(`Sales — ${range.searchParams.get('from')}.${format}`)
    expect(await readFile((await file.path())!, 'utf8')).toContain('ALL PRODUCTS,185')
    await expect(menu.getByRole('menuitem', { name: label, exact: true })).toBeEnabled()
  }
  expect(exports).toHaveLength(3)
  for (const url of exports) {
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ preset: 'custom', from: range.searchParams.get('from'), to: range.searchParams.get('to'), sort: 'highest_revenue' })
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('per_page')).toBe(false)
    expect(url.searchParams.has('from_at')).toBe(false)
  }
  const pending = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: 'Dashboard snapshot CSV', exact: true }).click()
  const file = await pending
  const csv = await readFile((await file.path())!, 'utf8')
  expect(csv).toContain(`"Revenue","${revenue}"`)
  expect(csv).toContain(`"Orders","${orders}"`)
  expect(csv).toContain(`"Cash","${revenue * 0.5}"`)
  expect(csv).toContain('"Основные блюда и фирменные предложения ресторана"')
  expect(csv).toContain('"1042","Hall","READY","245000"')
  expect(csv).toContain('Asia/Tashkent')
  expect(csv).not.toContain('[object Object]')
  await expect(menu).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeFocused()
})

test('dashboard exports keep other formats usable during generation and report errors support retry', async ({ page }) => {
  test.setTimeout(30_000)
  await setup(page)
  let release!: () => void
  const state: ExportState = { gate: new Promise<void>(resolve => { release = resolve }) }
  const calls = await mockReportExports(page, state)
  await page.goto('/')
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Export', exact: true })
  const excel = menu.getByRole('menuitem', { name: 'XLSX Excel', exact: true })
  const pdf = menu.getByRole('menuitem', { name: 'PDF PDF', exact: true })
  const excelDownload = page.waitForEvent('download', { predicate: download => download.suggestedFilename().endsWith('.xlsx'), timeout: 10_000 })
  try {
    await excel.click()
    await expect(excel).toBeDisabled()
    await expect(pdf).toBeEnabled()
    await expect(pdf).toBeFocused()
    // Native disabled controls and the handler guard both prevent duplicate requests.
    await excel.evaluate((button: HTMLButtonElement) => button.click())
    await expect.poll(() => calls.filter(url => url.searchParams.get('format') === 'xlsx').length).toBe(1)
    const pdfDownload = page.waitForEvent('download', { predicate: download => download.suggestedFilename().endsWith('.pdf'), timeout: 10_000 })
    await pdf.click()
    await pdfDownload
    release()
    await excelDownload
    await expect(excel).toBeEnabled()
    state.error = true
    await menu.getByRole('menuitem', { name: 'CSV CSV', exact: true }).click()
    await expect(page.locator('[data-sonner-toaster]')).toContainText('This report is too large')
    await expect(menu.getByRole('menuitem', { name: 'CSV CSV', exact: true })).toBeEnabled()
    state.error = false
    const retry = page.waitForEvent('download')
    await menu.getByRole('menuitem', { name: 'CSV CSV', exact: true }).click()
    await retry
  }
  finally { release() }
})

test('dashboard exports disclose business-day scope and preserve the overnight snapshot interval', async ({ page }) => {
  await setup(page)
  const calls = await mockReportExports(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await chooseDateTime(page, 'Start date', '2026-08-05', '22:00')
  await chooseDateTime(page, 'End date', '2026-08-05', '02:00')
  await page.locator('.date-fields').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Export', exact: true })
  await expect(menu).toContainText('Reports use full business days, without your selected hours')
  const report = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: 'CSV CSV', exact: true }).click()
  await report
  expect(Object.fromEntries(calls[0].searchParams)).toEqual({ preset: 'custom', from: '2026-08-05', to: '2026-08-05', sort: 'highest_revenue', format: 'csv' })
  const pending = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: 'Dashboard snapshot CSV', exact: true }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe('dashboard-2026-08-05-2026-08-05-2200-0200.csv')
  const csv = await readFile((await file.path())!, 'utf8')
  expect(csv).toContain('2026-08-05T22:00:00+05:00')
  expect(csv).toContain('2026-08-06T02:00:00+05:00')
})

test('dashboard exports distinguish a failed snapshot from real zero activity', async ({ page }) => {
  const state: FixtureState = { fail: true }
  await setup(page, state)
  await mockReportExports(page)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Export', exact: true })
  await expect(menu.getByRole('menuitem', { name: 'Dashboard snapshot CSV', exact: true })).toBeDisabled()
  await expect(menu).toContainText('Snapshot unavailable')
  const report = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: 'XLSX Excel', exact: true }).click()
  await report
  await page.keyboard.press('Escape')
  state.fail = false
  state.empty = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const pending = page.waitForEvent('download')
  await menu.getByRole('menuitem', { name: 'Dashboard snapshot CSV', exact: true }).click()
  const file = await pending
  expect(await readFile((await file.path())!, 'utf8')).toContain('"Revenue","0"')
})

test('dashboard exports preserve report role restrictions', async ({ page }) => {
  await setup(page, { role: 'CASHIER' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  const menu = page.getByRole('menu', { name: 'Export', exact: true })
  await expect(menu.getByRole('menuitem')).toHaveCount(1)
  await expect(menu.getByRole('menuitem', { name: 'Dashboard snapshot CSV', exact: true })).toBeEnabled()
})

for (const locale of ['en', 'ru', 'uz']) {
  for (const viewport of [{ width: 1440, height: 1000, theme: 'dark' }, { width: 390, height: 844, theme: 'light' }]) {
    test(`dashboard exports menu keyboard and layout ${locale} ${viewport.theme} ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await setup(page, {}, locale, viewport.theme)
      await page.goto('/')
      const trigger = page.locator('.dashboard-export > button')
      await trigger.click()
      const menu = page.locator('.dashboard-export [role="menu"]')
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      await page.keyboard.press('End')
      await expect(menu.getByRole('menuitem').last()).toBeFocused()
      await page.keyboard.press('Home')
      await expect(menu.getByRole('menuitem').first()).toBeFocused()
      const geometry = await menu.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, bottom: el.getBoundingClientRect().bottom, width: el.clientWidth, scroll: el.scrollWidth }))
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(viewport.width)
      expect(geometry.bottom).toBeLessThanOrEqual(viewport.height)
      expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
      await page.screenshot({ path: `/tmp/alpha-dashboard-export/menu-${locale}-${viewport.theme}-${viewport.width}.png` })
      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await expect(trigger).toBeFocused()
      await trigger.click()
      await page.locator('.dashboard-header h1').click()
      await expect(menu).toHaveCount(0)

      // A narrow, short phone still exposes the exact-time notice and footer;
      // the menu itself scrolls above the fixed bottom navigation.
      if (viewport.width === 390) {
        await page.setViewportSize({ width: 1440, height: 1000 })
        await page.locator('.date-fields__timebar button').filter({ hasText: locale === 'en' ? 'Working hours' : locale === 'ru' ? 'Рабочие часы' : 'Ish soatlari' }).click()
        await page.locator('.date-fields__apply').click()
        await expect(page.locator('.dashboard-header__actions > button')).toBeEnabled()
        await page.setViewportSize({ width: 320, height: 640 })
        await trigger.click()
        await expect(menu.locator('.dashboard-export__notice')).toBeVisible()
        await page.keyboard.press('End')
        await expect(menu.getByRole('menuitem').last()).toBeFocused()
        const bottom = await menu.evaluate(el => el.getBoundingClientRect().bottom)
        const barTop = await page.locator('.mobile-tabbar').evaluate(el => el.getBoundingClientRect().top)
        expect(bottom).toBeLessThanOrEqual(barTop)
        await page.screenshot({ path: `/tmp/alpha-dashboard-export/menu-${locale}-time-320.png` })
      }
    })
  }
}

test('overview preserves API totals, comparison, metric switching, refresh, and CSV export', async ({ page }) => {
  const calls = await setup(page)

  await page.goto('/')
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await expect(page.locator('.summary-metric').filter({ hasText: 'Orders' }).first()).toContainText(String(orders))
  await expect(page.locator('.overview-order__title').first()).toContainText('#1042')
  await expect(page.locator('.overview-order__title').last()).toContainText('Completed')
  await expect(page.locator('.overview-order__title').first()).not.toContainText('7894')
  await expect(page.getByText('Live', { exact: true })).toHaveCount(0)
  await expect(page.locator('.summary-lead__insight')).toContainText('25%')

  const performance = page.locator('.overview-performance')

  const explorer = performance.locator('.series-explorer')
  const point = explorer.getByRole('slider', { name: 'Explore a data point' })

  await expect(point).toHaveCount(0)
  await explorer.getByRole('button', { name: 'Chart navigation', exact: true }).click()
  await point.focus()
  await page.keyboard.press('Home')
  await expect(point).toHaveValue('0')
  await expect(explorer.locator('.series-explorer__readout')).toContainText(grouped(revenueSeries[0]))
  await page.keyboard.press('ArrowRight')
  await expect(point).toHaveAttribute('aria-valuetext', /2026-08-02.*1.480.000 UZS/)
  await explorer.locator('.series-explorer__canvas').hover({ position: { x: 160, y: 70 } })
  await expect(point).not.toHaveValue('1')
  await explorer.getByRole('button', { name: 'Column chart', exact: true }).click()
  await expect(explorer.getByRole('button', { name: 'Column chart', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await explorer.getByRole('button', { name: 'Focus on last 7 points', exact: true }).click()
  await expect(explorer.getByRole('button', { name: 'Reset zoom', exact: true })).toBeVisible()
  await explorer.getByRole('button', { name: 'Reset zoom', exact: true }).click()
  await expect(explorer.getByRole('button', { name: 'Focus on last 7 points', exact: true })).toBeVisible()
  await explorer.getByRole('button', { name: 'Area chart', exact: true }).click()
  await performance.getByRole('button', { name: 'Compare', exact: true }).click()
  await expect(performance.locator('.overview-chart-key')).toContainText('Previous period')
  await performance.locator('summary').click()
  await expect(performance.getByRole('table')).toBeVisible()
  await expect(performance.locator('tbody tr')).toHaveCount(30)
  await expect(performance.locator('tbody tr').first()).toContainText(grouped(revenueSeries[0]))
  await performance.getByRole('button', { name: 'Orders', exact: true }).click()
  await expect(performance.locator('.overview-chart-value')).toContainText(String(orders))
  await expect(performance.getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.dashboard-overview')).toHaveAttribute('aria-busy', 'false')
  await expect(performance.getByRole('button', { name: 'Orders', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await performance.getByRole('button', { name: 'Revenue', exact: true }).click()
  await expect(performance.getByRole('button', { name: 'Compare', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const download = page.waitForEvent('download')

  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Dashboard snapshot CSV', exact: true }).click()
  expect((await download).suggestedFilename()).toMatch(/^dashboard-.*\.csv$/)

  const ranges = calls.filter(url => url.pathname.endsWith('/dashboard'))

  expect(ranges).toHaveLength(2)
  expect(ranges.every(url => url.searchParams.get('from') && url.searchParams.get('to'))).toBe(true)
  await expectNoOverflow(page)
})

test('all five sections stay visible; quick links jump with keyboard support and auto refresh', async ({ page }) => {
  const calls = await setup(page)

  await page.goto('/')
  await expect(page.locator('.dashboard-overview')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('.dashprod')).toHaveAttribute('aria-busy', 'false')
  await expect(page.locator('section[data-section]')).toHaveCount(5)
  for (const section of ['exec', 'sales', 'products', 'staff', 'operations'])
    await expect(page.locator(`#dashboard-${section}`)).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveCount(0)
  await expect(page.locator('#dashboard-sales')).toContainText('Fresh produce and kitchen supplies')
  await expect(page.locator('#dashboard-products')).toContainText('Signature lavash with grilled chicken')
  await expect(page.locator('#dashboard-products').getByRole('button', { name: 'Chord', exact: true })).toBeVisible()
  await expect(page.locator('#dashboard-products .affinity-body')).toBeVisible()
  await page.locator('.product-category-distribution').getByRole('button', { name: 'Show all 7', exact: true }).click()
  await expect(page.locator('.product-category-distribution .distribution__rows')).toContainText('Seasonal specials')
  await page.locator('.product-category-distribution .distribution__summary').hover()
  await expect(page.locator('.product-category-distribution .distribution__summary')).toContainText(grouped(revenue))
  await expect(page.locator('#dashboard-staff')).toContainText('Aziza Karimova')
  await expect(page.locator('#dashboard-operations')).toContainText('Table occupancy')
  expect(calls.filter(url => url.pathname.endsWith('/dashboard/sales'))).toHaveLength(1)
  expect(calls.filter(url => url.pathname.endsWith('/dashboard/operations'))).toHaveLength(1)

  const directory = page.getByRole('button', { name: 'Explore dashboard', exact: true })
  const overview = page.locator('.dashboard-directory__panel a[href="#dashboard-exec"]')
  const sales = page.locator('.dashboard-directory__panel a[href="#dashboard-sales"]')

  await directory.focus()
  await page.keyboard.press('ArrowDown')
  await expect(overview).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(directory).toBeFocused()
  await expect(overview).toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  await expect(overview).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(sales).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#dashboard-sales')).toBeFocused()
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await page.keyboard.press('4')
  await expect(page.locator('#dashboard-staff')).toBeFocused()
  await directory.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('End')
  await page.keyboard.press('Home')
  await expect(overview).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#dashboard-exec')).toBeFocused()
  await page.getByRole('button', { name: 'Auto-refresh off', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Auto-refresh on', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.alpha-toast').last()).toContainText('Refreshing every 60s')
  await page.getByRole('button', { name: 'Auto-refresh on', exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('alphapos-dash-autorefresh'))).toBe('0')
})

test('changing the reporting period updates all dashboard sections and restores focus', async ({ page }) => {
  const calls = await setup(page)

  await page.goto('/')
  await expect(page.locator('.summary-lead__amount')).toBeVisible()

  const trigger = page.getByRole('combobox', { name: 'Quick select', exact: true })

  await trigger.click()
  await page.getByRole('option', { name: 'Last 7 days', exact: true }).click()
  await expect(trigger).toContainText('Last 7 days')
  await expect(page.getByRole('button', { name: 'Start date', exact: true })).toContainText('2026')
  await expect(page.getByRole('button', { name: 'End date', exact: true })).toBeVisible()
  await expect(page.locator('.dashboard-overview')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()

  const range = calls.filter(url => url.pathname.endsWith('/dashboard')).at(-1)
  const sales = calls.filter(url => url.pathname.endsWith('/dashboard/sales')).at(-1)

  expect(range?.searchParams.get('from')).toBe(sales?.searchParams.get('from'))
  expect(range?.searchParams.get('to')).toBe(sales?.searchParams.get('to'))
  for (const endpoint of ['/analytics/products/categories', '/analytics/products/affinity', '/staff/performance', '/dashboard/operations']) {
    const request = calls.filter(url => url.pathname.endsWith(endpoint)).at(-1)

    expect(request?.searchParams.get('from'), endpoint).toBe(range?.searchParams.get('from'))
    expect(request?.searchParams.get('to'), endpoint).toBe(range?.searchParams.get('to'))
  }

  const from = Date.parse(range?.searchParams.get('from') ?? '')
  const to = Date.parse(range?.searchParams.get('to') ?? '')

  expect((to - from) / 86_400_000).toBe(6)
})

test('initial loading reserves the layout; empty data does not invent a trend or payments', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })

  await setup(page, { empty: true, gate })
  await page.goto('/')
  await expect(page.locator('.overview-skeleton')).toBeVisible()
  await expect(page.locator('.today-orders')).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('.today-orders__skeleton')).toBeVisible()
  await expect(page.locator('.summary-lead__amount')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoOverflow(page)
  await page.screenshot({ path: '/tmp/alpha-dashboard-rebuild/loading-mobile.png', animations: 'disabled' })
  release()
  await expect(page.locator('.summary-lead__amount')).toContainText('0')
  await expect(page.getByText('No trend activity in this period', { exact: true })).toBeVisible()
  await expect(page.locator('.overview-performance').getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0)
  await expect(page.getByText('No payments in this period', { exact: true })).toBeVisible()
  await expect(page.getByText('No recent orders', { exact: true })).toBeVisible()
  await expect(page.locator('.overview-plot svg')).toHaveCount(0)
  await expect(page.locator('.dashboard-overview').getByText('Average orders per day', { exact: true })).toHaveCount(0)
  await expectNoOverflow(page)
  await page.locator('#dashboard-exec').screenshot({ path: '/tmp/alpha-dashboard-rebuild/empty-mobile.png' })
})

test('failed initial requests show a top-right error toast and a working retry without fake zero totals', async ({ page }) => {
  const state: FixtureState = { fail: true }

  await setup(page, state)
  await page.goto('/')
  await expect(page.locator('.overview-unavailable')).toContainText('Could not load dashboard')
  await expect(page.locator('.dash-errbar')).toHaveCount(0)
  await expect(page.locator('.summary-lead__amount')).toHaveCount(0)

  const toast = page.locator('.alpha-toast[data-type="error"]')

  await expect(toast).toContainText('The server is temporarily unavailable. Please try again shortly.')
  await expect(page.locator('.alpha-toaster')).toHaveAttribute('data-y-position', 'top')
  await expect(page.locator('.alpha-toaster')).toHaveAttribute('data-x-position', 'right')
  await expect(toast).toHaveCSS('opacity', '1')

  const box = await toast.boundingBox()
  const viewport = page.viewportSize()

  if (!box || !viewport)
    throw new Error('Toast geometry unavailable')
  expect(box.x).toBeGreaterThan(viewport.width / 2)
  expect(box.y).toBeLessThan(50)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 12)
  await page.screenshot({ path: '/tmp/smart-pos-dashboard-error-toast.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.dash-errbar')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/alpha-dashboard-rebuild/review-error-mobile.png', animations: 'disabled' })
  state.fail = false
  await page.locator('.overview-unavailable').getByRole('button', { name: 'Retry' }).click()
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await expect(page.locator('.overview-unavailable')).toHaveCount(0)
})

test('a failed refresh retains the selected chart and labels the last available values', async ({ page }) => {
  const state: FixtureState = {}

  await setup(page, state)
  await page.goto('/')
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await page.locator('.overview-performance').getByRole('button', { name: 'Avg Order', exact: true }).click()
  state.fail = true
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.overview-stale')).toBeVisible()
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await expect(page.locator('.overview-performance').getByRole('button', { name: 'Avg Order', exact: true })).toHaveAttribute('aria-pressed', 'true')
  state.fail = false
  await page.locator('.overview-stale').getByRole('button', { name: 'Retry' }).click()
  await expect(page.locator('.overview-stale')).toHaveCount(0)
})

test('optional breakdown failures remain distinct from zero sales and today fallback is labeled', async ({ page }) => {
  const state: FixtureState = { partial: true, todayFallback: true }
  await setup(page, state)
  await page.goto('/')
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await expect(page.getByText('Trend data unavailable', { exact: true })).toBeVisible()
  await expect(page.locator('.overview-categories .overview-panel__head')).toContainText('Today')
  await expect(page.locator('.dashboard-overview').getByText('Average orders per day', { exact: true })).toHaveCount(0)
  await expect(page.locator('.overview-performance').getByRole('button', { name: 'Compare', exact: true })).toHaveCount(0)
  state.partial = false
  await page.locator('.overview-performance').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.overview-performance .series-explorer')).toBeVisible()
})

async function captureSections(page: Page, locale: string, theme: string, width: number) {
  if (width !== 1440 && width !== 390)
    return
  for (const chart of await page.locator('.series-explorer__canvas, .category-map__canvas, .channel-flow__chart').all()) {
    await chart.scrollIntoViewIfNeeded()
    await expect(chart.locator('svg')).toBeVisible()
  }
  await page.mouse.move(1, 1)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `/tmp/smart-pos-redesign-top-${locale}-${theme}-${width}.png` })
  await page.screenshot({ path: `/tmp/smart-pos-long-dashboard-${locale}-${theme}-${width}.png`, fullPage: true })
  for (const section of ['exec', 'sales', 'products', 'staff', 'operations']) {
    await page.locator(`#dashboard-${section}`).screenshot({
      path: `/tmp/smart-pos-long-${section}-${locale}-${theme}-${width}.png`,
      style: '.topbar, .dashboard-toolbar, .mobile-tabbar, .scroll-to-top { opacity: 0 !important; }',
    })
  }
}

async function inspectDirectory(page: Page, width: number) {
  if (width > 390)
    return
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.locator('.dashboard-directory__trigger').click()

  const panel = page.locator('.dashboard-directory__panel')

  await expect(panel).toBeVisible()
  await expect(panel.locator('a')).toHaveCount(5)

  const bounds = await panel.boundingBox()

  if (!bounds)
    throw new Error('The section directory has no visible bounds')
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(780)
  await panel.locator('.dashboard-directory__heading button').click()
}

async function inspectDateTimePicker(page: Page, locale: string, theme: string, width: number) {
  const mobile = width <= 650
  if (mobile)
    await page.locator('.dashboard-filters__trigger').click()
  const field = page.locator('.datetime-field__trigger').first()

  await field.click()

  const popup = page.locator('.datetime-pop[open]')

  await expect(popup).toBeVisible()
  await expect(popup).toHaveCSS('opacity', '1')
  await expect(popup.locator('input')).toHaveCount(2)
  await expect(popup).not.toContainText(/M0[1-9]|M1[0-2]|dash_/)

  const geometry = await popup.evaluate(el => {
    const rect = el.getBoundingClientRect()
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, scroll: el.scrollWidth, width: el.clientWidth }
  })

  expect(geometry.x).toBeGreaterThanOrEqual(0)
  expect(geometry.y).toBeGreaterThanOrEqual(0)
  expect(geometry.right).toBeLessThanOrEqual(width)
  expect(geometry.bottom).toBeLessThanOrEqual(page.viewportSize()?.height ?? 844)
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width)
  await expect(popup.locator('.datetime-pop__foot button')).toBeInViewport()
  if (width === 1440 || width === 390)
    await page.screenshot({ path: `/tmp/smart-pos-datetime-${locale}-${theme}-${width}.png` })
  await page.keyboard.press('Escape')
  await expect(field).toBeFocused()
  await expect(popup).toHaveCount(0)
  if (mobile) {
    await page.keyboard.press('Escape')
    await expect(page.locator('.dashboard-filters__trigger')).toBeFocused()
  }
}

for (const locale of ['en', 'ru', 'uz']) {
  for (const theme of ['light', 'dark']) {
    test(`continuous dashboard fits desktop, tablet, and small phones in ${locale}/${theme}`, async ({ page }) => {
      test.setTimeout(180_000)
      await setup(page, {}, locale, theme)
      await page.goto('/')
      await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
      await expect(page.locator('.dashprod')).toHaveAttribute('aria-busy', 'false')
      for (const width of [1440, 1280, 1100, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width >= 1000 ? 1000 : 844 })
        await expectNoOverflow(page)
        await expectReadableChartLabels(page)
        await expect(page.locator('.summary-lead')).toBeVisible()
        await expect(page.locator('.overview-payments')).toBeVisible()
        await captureSections(page, locale, theme, width)
        await inspectDirectory(page, width)
        await inspectDateTimePicker(page, locale, theme, width)
      }
    })
  }
}

test('dashboard and error toasts respect reduced motion', async ({ page }) => {
  const state: FixtureState = { fail: true }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page, state, 'ru', 'dark')
  await page.goto('/')

  const toast = page.locator('.alpha-toast[data-type="error"]')

  await expect(toast).toBeVisible()
  await expect(toast).toHaveCSS('transition-duration', '0s')
  await expectNoOverflow(page)
  await toast.getByRole('button').focus()
  await page.keyboard.press('Enter')
  await expect(toast).toHaveCount(0)
  state.fail = false
  await page.locator('.overview-unavailable').getByRole('button').click()
  await expect(page.locator('.summary-board')).toHaveCSS('animation-name', 'none')
  await page.locator('.dashboard-filters__trigger').click()
  await page.locator('.datetime-field__trigger').first().click()
  await expect(page.locator('.datetime-pop[open]')).toHaveCSS('animation-name', 'none')
  await page.keyboard.press('Escape')
})

test('a failed product breakdown preserves overview and trends while other sections stay populated', async ({ page }) => {
  const state: FixtureState = { failPaths: ['/analytics/products/categories'] }

  await setup(page, state)
  await page.goto('/')

  const products = page.locator('#dashboard-products')

  await expect(products.locator('.dashboard-notice')).toContainText('Some data is unavailable')
  await expect(products.locator('.sparktable')).toContainText('Signature lavash with grilled chicken')
  await expect(products.locator('.kpi').first()).toContainText('28')
  await expect(page.locator('#dashboard-staff')).toContainText('Aziza Karimova')
  state.failPaths = []
  await products.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(products.locator('.dashboard-notice')).toHaveCount(0)
  await expect(products).toContainText('Drinks & refreshments')
})

test('staff failures display a retry instead of an empty business state', async ({ page }) => {
  const state: FixtureState = { failPaths: ['/staff/performance'] }

  await setup(page, state)
  await page.goto('/')

  const staff = page.locator('#dashboard-staff')

  await expect(staff.locator('.dashboard-notice')).toContainText('This section could not be loaded')
  await expect(staff.getByText('No staff data for this range')).toHaveCount(0)
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  state.failPaths = []
  await staff.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(staff).toContainText('Aziza Karimova')
  await expect(staff.locator('.dashboard-notice')).toHaveCount(0)
})

async function chooseDateTime(page: Page, label: string, date: string, time: string) {
  await page.getByRole('button', { name: label, exact: true }).click()

  const popup = page.getByRole('dialog', { name: label, exact: true })

  for (let attempts = 0; attempts < 12; attempts++) {
    if (await popup.locator(`[data-date="${date}"]`).count())
      break
    const first = await popup.locator('[data-date]').first().getAttribute('data-date')

    await popup.getByRole('button', { name: date < String(first) ? 'Previous month' : 'Next month', exact: true }).click()
  }
  await popup.locator(`[data-date="${date}"]`).click()
  await expect(popup.getByLabel('Hour', { exact: true })).toBeFocused()
  await popup.getByLabel('Hour', { exact: true }).fill(time.split(':')[0])
  await popup.getByLabel('Minute', { exact: true }).fill(time.split(':')[1])
  await popup.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByRole('button', { name: label, exact: true })).toBeFocused()
}

test('integrated date and time fields validate drafts and send one exact overnight interval', async ({ page }) => {
  const calls = await setup(page)

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()

  const apply = page.locator('.date-fields').getByRole('button', { name: 'Apply', exact: true })
  const originalCalls = calls.filter(url => url.pathname.endsWith('/dashboard')).length

  await chooseDateTime(page, 'Start date', '2026-08-20', '07:00')
  await chooseDateTime(page, 'End date', '2026-08-05', '18:00')
  await expect(page.locator('.date-fields__error')).toContainText('end date must be on or after')
  await expect(apply).toBeDisabled()
  expect(calls.filter(url => url.pathname.endsWith('/dashboard'))).toHaveLength(originalCalls)
  await chooseDateTime(page, 'Start date', '2026-08-05', '07:00')
  await chooseDateTime(page, 'End date', '2026-08-20', '18:00')
  await page.getByRole('button', { name: 'Whole day', exact: true }).click()
  await apply.click()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  let request = calls.filter(url => url.pathname.endsWith('/dashboard')).at(-1)
  expect(request?.searchParams.get('from')).toBe('2026-08-05')
  expect(request?.searchParams.get('to')).toBe('2026-08-20')
  await chooseDateTime(page, 'Start date', '2026-08-05', '22:00')
  await chooseDateTime(page, 'End date', '2026-08-05', '02:00')
  await expect(page.locator('.date-fields__timebar')).toContainText('next calendar day')
  await expect(page.locator('.date-fields__timebar')).toContainText('2026-08-06 02:00')
  await apply.click()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  request = calls.filter(url => url.pathname.endsWith('/dashboard')).at(-1)
  expect(request?.searchParams.get('from_at')).toBe('2026-08-05T22:00:00+05:00')
  expect(request?.searchParams.get('to_at')).toBe('2026-08-06T02:00:00+05:00')
  for (const endpoint of ['/dashboard/sales', '/analytics/products/categories', '/analytics/products/affinity', '/staff/performance', '/dashboard/operations']) {
    const section = calls.filter(url => url.pathname.endsWith(endpoint)).at(-1)

    expect(section?.searchParams.get('from_at'), endpoint).toBe(request?.searchParams.get('from_at'))
    expect(section?.searchParams.get('to_at'), endpoint).toBe(request?.searchParams.get('to_at'))
  }
})

test('date and time picker contains focus, validates the clock, and discards unconfirmed changes', async ({ page }) => {
  await setup(page)
  await page.goto('/')

  const field = page.getByRole('button', { name: 'Start date', exact: true })
  const original = await field.textContent()

  await field.focus()
  await page.keyboard.press('ArrowDown')

  const popup = page.getByRole('dialog', { name: 'Start date', exact: true })

  await expect(popup.locator('[aria-pressed="true"]')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(popup.getByLabel('Hour', { exact: true })).toBeFocused()
  await popup.getByLabel('Hour', { exact: true }).fill('25')
  await expect(popup.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()
  await expect(popup.getByRole('alert')).toBeVisible()
  await popup.getByLabel('Hour', { exact: true }).fill('09')
  await popup.getByLabel('Minute', { exact: true }).fill('61')
  await expect(popup.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()
  await popup.getByLabel('Minute', { exact: true }).fill('15')
  await expect(popup.getByRole('button', { name: 'Done', exact: true })).toBeEnabled()
  await popup.getByRole('button', { name: 'Done', exact: true }).focus()
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => !!document.activeElement?.closest('.datetime-pop'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(field).toBeFocused()
  await expect(field).toHaveText(original || '')
  await expect(page.locator('.date-fields').getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
})

test('today orders remain independent of range totals and distinguish zero from unavailable', async ({ page }) => {
  test.setTimeout(30_000)

  const state: FixtureState = { todayOrders: 42 }
  const calls = await setup(page, state)

  await page.goto('/')

  const card = page.getByRole('complementary', { name: 'Today\'s Orders', exact: true })

  await expect(card.locator('.today-orders__count')).toHaveText('42')
  const pulse = page.getByRole('region', { name: 'Today at a glance', exact: true })
  await expect(pulse).toContainText('13:00–14:00')
  await expect(pulse).toContainText('11 orders · 690,000 UZS')
  await expect(pulse).toContainText('Signature lavash with grilled chicken')
  await expect(pulse).toContainText('28 sold · 1,400,000 UZS')
  await pulse.screenshot({ path: '/tmp/alpha-dashboard-today-pulse.png', animations: 'disabled' })
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  expect(calls.filter(url => url.pathname.endsWith('/dashboard/today'))).toHaveLength(1)
  await page.getByRole('combobox', { name: 'Quick select', exact: true }).click()
  await page.getByRole('option', { name: 'Last 7 days', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await expect(card.locator('.today-orders__count')).toHaveText('42')
  state.todayOrders = 0
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Refresh', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(card.locator('.today-orders__count')).toHaveText('0')
  state.failPaths = ['/dashboard/today']
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Refresh', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(card.locator('.today-orders__count')).toHaveText('—')
  await expect(card).toContainText('Today’s count is unavailable')
  state.failPaths = []
  state.todayOrders = 43
  await card.getByRole('button', { name: 'Retry', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(card.locator('.today-orders__count')).toHaveText('43')
  state.todayOrders = null
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Refresh', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(card.locator('.today-orders__count')).toHaveText('—')
  await expect(card).toContainText('No data')
})

test('payment and category explorers retain small categories and support keyboard selection', async ({ page }) => {
  await setup(page)
  await page.goto('/')

  const payment = page.locator('.overview-payments .distribution')

  await payment.getByRole('button', { name: /Payme/ }).click()
  await expect(payment.locator('.distribution__summary')).toContainText(grouped(revenue * 0.2))
  await payment.getByRole('button', { name: 'Show the total' }).click()
  await expect(payment.locator('.distribution__summary')).toContainText(grouped(revenue))

  const categoryRows = page.locator('#dashboard-products .product-category-distribution')

  await categoryRows.getByRole('button', { name: 'Show all 7', exact: true }).click()

  await expect(categoryRows.locator('.distribution__row')).toHaveCount(7)
  await categoryRows.getByRole('button', { name: /Seasonal specials/ }).focus()
  await page.keyboard.press('Enter')
  await expect(categoryRows.locator('.distribution__summary')).toContainText(grouped(revenue * 0.01))

  const map = page.locator('#dashboard-products .category-map')

  await map.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Seasonal specials', exact: true }).click()
  await expect(map.locator('.category-map__value')).toContainText(grouped(revenue * 0.01))
  await page.locator('#dashboard-products').getByRole('button', { name: 'Units sold', exact: true }).click()
  await expect(map.locator('.category-map__value')).toContainText('110')
  await expect(categoryRows.locator('.distribution__summary')).toContainText('110')
})

test('donut sectors respond directly to pointer input and the point readout supports keyboard navigation', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  const payment = page.locator('.overview-payments .distribution')
  const ring = payment.locator('.distribution__ring')
  await ring.scrollIntoViewIfNeeded()
  const bounds = await ring.boundingBox()
  if (!bounds) throw new Error('Payment ring is not visible')
  await ring.click({ position: { x: bounds.width * .87, y: bounds.height * .5 } })
  await expect(payment.getByRole('button', { name: /Cash.*50%/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(payment.locator('.distribution__summary')).toContainText(grouped(revenue * .5))
  await ring.click({ position: { x: bounds.width * .28, y: bounds.height * .20 } })
  await expect(payment.getByRole('button', { name: /Payme/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(payment.locator('.distribution__summary')).toContainText(grouped(revenue * .2))
  await payment.getByRole('button', { name: /Payme/ }).focus()
  await page.keyboard.press('Escape')
  await expect(payment.locator('[aria-pressed="true"]')).toHaveCount(0)
  const explorer = page.locator('.overview-performance .series-explorer')
  await explorer.locator('.series-explorer__point').focus()
  await page.keyboard.press('Home')
  await expect(explorer.locator('.series-explorer__readout')).toContainText(grouped(revenueSeries[0]))
  await expect(explorer.getByRole('button', { name: 'Previous data point', exact: true })).toBeDisabled()
  await page.keyboard.press('ArrowRight')
  await expect(explorer.locator('.series-explorer__readout')).toContainText(grouped(revenueSeries[1]))
  await expect(explorer.getByRole('slider')).toHaveCount(0)
})

test('staff comparison exposes reported measures and changes the selected team member', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  const staff = page.locator('#dashboard-staff')
  await expect(staff.locator('.staff-comparison-values')).toHaveAttribute('open', '')
  const values = staff.locator('.staff-comparison-values table')
  await expect(values).toContainText('150')
  await expect(values).toContainText(grouped(10_000_000))
  await expect(values).toContainText('96')
  await expect(values).toContainText('Shifts')
  await staff.locator('.lb-row').filter({ hasText: 'Sardor Mirzayev' }).focus()
  await page.keyboard.press('Enter')
  await expect(values.locator('thead')).toContainText('Sardor Mirzayev')
  await expect(values.locator('tbody tr').filter({ hasText: 'Revenue' })).toContainText(grouped(7_000_000))
  await expect(staff.getByRole('combobox', { name: 'First team member', exact: true })).toContainText('Sardor Mirzayev')
  await expect(staff).not.toContainText('Speed')
})

test('one staff member shows an honest comparison state without fabricated scores', async ({ page }) => {
  await setup(page, { staffCount: 1 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const staff = page.locator('#dashboard-staff')
  await expect(staff.locator('.report-state')).toContainText('One team member in this period')
  await expect(staff.locator('.staff-comparison-controls')).toHaveCount(0)
  await expect(staff.locator('.lb-row')).toContainText('Aziza Karimova')
  await expectNoOverflow(page)
})

test('product pairing failures can be retried and all three views remain useful', async ({ page }) => {
  const state: FixtureState = { failPaths: ['/analytics/products/affinity'] }
  await setup(page, state)
  await page.goto('/')
  const affinity = page.locator('.affinity-report')
  await expect(affinity.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
  await expect(affinity.locator('.affinity-body')).toHaveCount(0)
  state.failPaths = []
  await affinity.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(affinity.locator('.affinity-body')).toBeVisible()
  await expect(affinity.getByRole('button', { name: 'Ranked', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await affinity.getByRole('button', { name: 'Chord', exact: true }).click()
  await expect(affinity.locator('.affinity-viz > svg')).toBeVisible()
  await affinity.getByRole('button', { name: 'Matrix', exact: true }).click()
  await expect(affinity.locator('.affinity-viz > div > svg')).toBeVisible()
})

test('Pareto exploration preserves every product and exact cumulative values on phones', async ({ page }) => {
  await setup(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const pareto = page.locator('.pareto')
  await pareto.getByRole('combobox', { name: 'Explore a product', exact: true }).click()
  await page.getByRole('option', { name: '3. Fresh lemonade', exact: true }).click()
  await expect(pareto.locator('.pareto__readout')).toContainText(grouped(5_500_000))
  await expect(pareto.locator('.pareto__readout')).toContainText('100%')
  await expect(pareto.locator('.pareto__scope')).toHaveText('Cumulative share of revenue shown in this chart.')
  await pareto.getByRole('button', { name: 'Previous data point', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(pareto.locator('.pareto__readout')).toContainText('Pizza Margherita')
  await expect(pareto.locator('.pareto__readout')).toContainText(grouped(7_000_000))
  await expectNoOverflow(page)
})

for (const [locale, presetLabel] of [['en', 'Last 30 days'], ['ru', 'Последние 30 дней'], ['uz', 'Oxirgi 30 kun']]) {
  for (const theme of ['light', 'dark']) {
    test(`shared calendar keeps localized dates readable in ${locale}/${theme}`, async ({ page }) => {
      await setup(page, {}, locale, theme)
      await page.goto('/orders')

      await page.locator('.date-fields').getByRole('combobox').click()
      await page.getByRole('option', { name: presetLabel, exact: true }).click()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 844 })
        if (width < 700) await page.locator('.dashboard-filters__trigger').click()
        const trigger = page.locator('.datetime-field__trigger').first()
        await trigger.click()

        const footer = page.locator('.datetime-pop[open] .datetime-pop__foot > span')

        await expect(footer).toBeVisible()
        await expect(footer).not.toContainText(/M0[1-9]|M1[0-2]/)

        const sizes = await footer.evaluate(el => ({ width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height, client: el.clientWidth, scroll: el.scrollWidth }))

        expect(sizes.width).toBeGreaterThan(200)
        expect(sizes.height).toBeLessThan(65)
        expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1)
        await page.locator('.datetime-pop[open]').screenshot({ path: `/tmp/smart-pos-calendar-${locale}-${theme}-${width}.png` })
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
      }
    })
  }
}


test('phone reporting keeps totals near the top and date edits in a focused sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const calls = await setup(page)
  await page.goto('/')
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await expect(page.locator('.today-orders')).toBeInViewport()
  await expect(page.locator('.summary-board')).toBeInViewport()
  await expect(page.locator('.datetime-field__trigger')).toHaveCount(0)
  const before = calls.filter(url => url.pathname.endsWith('/dashboard')).length
  await page.getByRole('button', { name: 'Date range', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: 'Date range', exact: true })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Start date', exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Start date', exact: true }).click()
  await expect(page.locator('.datetime-pop[open]')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Date range', exact: true })).toBeFocused()
  expect(calls.filter(url => url.pathname.endsWith('/dashboard'))).toHaveLength(before)
  await page.getByRole('button', { name: 'Show Total Orders trend', exact: true }).click()
  await expect(page.locator('.overview-chart-value')).toContainText(String(orders))
  await expectNoOverflow(page)
})


test('blue and forest palettes persist with both display modes and synchronize chart and form colors', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'blue')
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click()
  const appearance = page.getByRole('dialog', { name: 'Appearance', exact: true })
  await appearance.getByRole('button', { name: 'Forest', exact: true }).click()
  await appearance.getByRole('button', { name: 'Dark', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'forest')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Account menu', exact: true })).toBeFocused()
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'forest')
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click()
  await appearance.getByRole('button', { name: 'Legacy blue', exact: true }).click()
  await page.keyboard.press('Escape')
  const colors = await page.locator('.v-application').evaluate(el => ({ raw: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim().toLowerCase(), vuetify: getComputedStyle(el).getPropertyValue('--v-theme-primary').replace(/\s/g, '') }))
  expect(colors).toEqual({ raw: '#72a7ff', vuetify: '114,167,255' })
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'blue')
  await expect(page.locator('.daily-ledger tbody tr')).toHaveCount(7)
  await expect(page.locator('.daily-ledger tbody tr').first()).toContainText(grouped(revenueSeries[0]))
  await expect(page.locator('.overview-payments .distribution__ring path[data-segment]')).toHaveCount(3)
})

test('new palettes recolor populated charts without changing their values or phone layout', async ({ page }) => {
  await setup(page)
  await page.goto('/')
  for (const palette of ['blue', 'forest', 'teal', 'violet', 'rose', 'amber'] as const) for (const mode of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1440, height: 960 })
    await page.getByRole('button', { name: 'Account menu', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Appearance', exact: true }).click()
    const appearance = page.getByRole('dialog', { name: 'Appearance', exact: true })
    await appearance.getByRole('button', { name: palette === 'blue' ? 'Legacy blue' : palette[0].toUpperCase() + palette.slice(1), exact: true }).click()
    await appearance.getByRole('button', { name: mode === 'light' ? 'Light' : 'Dark', exact: true }).click()
    await page.keyboard.press('Escape')
    const chart = page.locator('.overview-performance .series-explorer__canvas')
    await chart.scrollIntoViewIfNeeded()
    await expect.poll(() => chart.locator('svg stop').evaluateAll(stops => stops.map(stop => stop.getAttribute('stop-color')?.toLowerCase()))).toContain(alphaPaletteTokens(palette, mode).primary.toLowerCase())
    await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
    await expectDonutLabelContrast(page)
    await expectChannelColorConsistency(page)
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 960 })
      await page.evaluate(() => window.scrollTo(0, 0))
      await expectNoOverflow(page)
      await page.screenshot({ path: `/tmp/alpha-theme-pass/dashboard-${palette}-${mode}-${width}.png`, animations: 'disabled' })
    }
  }
})

for (const locale of ['en', 'ru', 'uz']) test(`phone chart controls keep complete metric labels separate from comparison in ${locale}`, async ({ page }) => {
  await setup(page, {}, locale, 'dark')
  await page.goto('/')
  await expect(page.locator('.summary-lead__amount')).toContainText(grouped(revenue))
  for (const width of [540, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const metrics = page.locator('.overview-segments')
    await metrics.scrollIntoViewIfNeeded()
    const problems = await metrics.evaluate(group => {
      const box = group.getBoundingClientRect()
      return [...group.querySelectorAll('button')].filter(button => {
        const rect = button.getBoundingClientRect()
        return rect.left < box.left || rect.right > box.right || button.scrollWidth > button.clientWidth + 1
      }).map(button => button.textContent)
    })
    expect(problems).toEqual([])
    const comparison = await page.locator('.overview-compare').boundingBox()
    const metricBox = await metrics.boundingBox()
    expect(comparison!.y).toBeGreaterThanOrEqual(metricBox!.y + metricBox!.height)
    await expectNoOverflow(page)
    if (width === 320) await page.screenshot({ path: `/tmp/alpha-theme-pass/chart-controls-${locale}-320.png`, animations: 'disabled' })
  }
})

test('staff scatter supports keyboard selection, exact values, and direct phone selection', async ({ page }) => {
  await setup(page, {}, 'en', 'dark')
  await page.goto('/')
  const scatter = page.locator('.scatter-chart')
  const sardor = scatter.getByRole('button', { name: /^Sardor Mirzayev\./ })
  await sardor.focus()
  await page.keyboard.press('Enter')
  await expect(sardor).toHaveAttribute('aria-pressed', 'true')
  const readout = scatter.locator('.scatter-chart__readout')
  await expect(readout).toContainText('Sardor Mirzayev')
  await expect(readout).toContainText('120')
  await expect(readout).toContainText(`${grouped(7_000_000)} UZS`)
  await expect(readout).toContainText(`${grouped(65000)} UZS`)
  await page.locator('#dashboard-staff').screenshot({ path: '/tmp/alpha-dashboard-rebuild/review-staff-desktop.png', style: '.dashboard-toolbar { opacity: 0 !important; }' })
  await page.setViewportSize({ width: 390, height: 844 })
  const aziza = scatter.getByRole('button', { name: /^Aziza Karimova\./ })
  await aziza.click()
  await page.mouse.move(0, 0)
  await expect(aziza).toHaveAttribute('aria-pressed', 'true')
  await expect(readout).toContainText(`${grouped(10_000_000)} UZS`)
  await expectNoOverflow(page)
  await page.locator('#dashboard-staff').screenshot({ path: '/tmp/alpha-dashboard-rebuild/review-staff-mobile.png', style: '.dashboard-toolbar, .mobile-tabbar { opacity: 0 !important; }' })
})

for (const source of ['total', 'shares']) test(`Pareto preserves the reported revenue denominator from ${source}`, async ({ page }) => {
  await setup(page, source === 'total' ? { paretoTotal: revenue } : { paretoShares: true })
  await page.goto('/')
  const pareto = page.locator('.pareto')
  await pareto.getByRole('combobox', { name: 'Explore a product', exact: true }).click()
  await page.getByRole('option', { name: '3. Fresh lemonade', exact: true }).click()
  await expect(pareto.locator('.pareto__readout')).toContainText(`${(21_000_000 / revenue * 100).toFixed(1)}%`)
  await expect(pareto.locator('.pareto__scope')).toHaveText('Cumulative share of the reported period’s revenue.')
  await expect(pareto.locator('.pareto__insight')).toHaveCount(0)
  await expect(page.locator('#dashboard-products')).not.toContainText('Five products')
})

test('paired product and category pies show exact sold units side by side and stack on phones', async ({ page }) => {
  await setup(page, { paretoTotal: revenue }, 'en', 'dark')
  await page.goto('/')
  const products = page.locator('.product-unit-pie')
  const categoriesPie = page.locator('.category-unit-pie')
  await expect(products.locator('.distribution__ring path')).toHaveCount(3)
  await expect(categoriesPie.locator('.distribution__ring path')).toHaveCount(7)
  await expect(products.locator('.distribution__summary')).toContainText('360')
  await expect(categoriesPie.locator('.distribution__summary')).toContainText(grouped(1610))
  const firstBox = await products.boundingBox()
  const secondBox = await categoriesPie.boundingBox()
  expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThan(2)
  expect(secondBox!.x).toBeGreaterThan(firstBox!.x)
  await products.getByRole('button', { name: /Pizza Margherita/ }).click()
  await expect(products.locator('.distribution__summary')).toContainText('120')
  await expect(products.locator('.distribution__center')).toContainText('33.3%')
  await page.mouse.move(0, 0)
  await page.locator('#dashboard-products').screenshot({ path: '/tmp/alpha-dashboard-rebuild/review-products-desktop.png', style: '.dashboard-toolbar { opacity: 0 !important; }' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expectNoOverflow(page)
  const phoneFirst = await products.boundingBox()
  const phoneSecond = await categoriesPie.boundingBox()
  expect(phoneSecond!.y).toBeGreaterThanOrEqual(phoneFirst!.y + phoneFirst!.height)
  await page.locator('#dashboard-products').screenshot({ path: '/tmp/alpha-dashboard-rebuild/review-products-mobile.png', style: '.dashboard-toolbar, .mobile-tabbar { opacity: 0 !important; }' })
})

test('large product pies retain all slices without expanding hundreds of legend rows', async ({ page }) => {
  await setup(page, { productCount: 241 })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const pie = page.locator('.product-unit-pie')
  await expect(pie.locator('.distribution__ring path')).toHaveCount(241)
  await expect(pie.locator('.distribution__row')).toHaveCount(5)
  await pie.getByRole('combobox', { name: 'Explore a product', exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(pie.locator('.distribution__summary')).toContainText('Product 241')
  await expect(pie.locator('.distribution__summary strong')).toContainText('1')
  await expectNoOverflow(page)
})


test('order channel exploration retains every business date and distinguishes missing counts from zero', async ({ page }) => {
  await setup(page, { partialChannels: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  const flow = page.locator('.channel-flow')
  await expect(flow.locator('dl')).toContainText('Hall')
  const select = flow.getByRole('combobox', { name: 'Choose a period or date for order channels' })
  await select.click()
  await expect(page.getByRole('option')).toHaveCount(31)
  await page.getByRole('option', { name: '2026-08-01', exact: true }).click()
  await expect(flow.locator('dd')).toHaveText(['16 —', '— —', '0 —'])
  await expect(flow.locator('.channel-flow__notice')).toContainText('not reported')
  await select.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(flow.locator('dd')).toHaveText(['17 77.3%', '3 13.6%', '2 9.1%'])
  await expect(select).toBeFocused()
  await page.setViewportSize({ width: 320, height: 720 })
  await expectNoOverflow(page)
})


test('donut labels stay readable while hovering, selecting, and dimming sectors', async ({ page }) => {
  await setup(page, {}, 'en', 'dark')
  await page.goto('/')
  const payment = page.locator('.overview-payments')
  await expect(payment.locator('.distribution__ring')).toBeVisible()
  await expectDonutLabelContrast(page)
  const card = payment.getByRole('button', { name: /^Card/ })
  await card.hover()
  await expectDonutLabelContrast(page)
  await card.click()
  await page.mouse.move(1, 1)
  await expectDonutLabelContrast(page)
  await payment.screenshot({ path: '/tmp/alpha-dashboard-rebuild/verdict-payment-selected-dark.png', animations: 'disabled' })
  await card.focus()
  await page.keyboard.press('Escape')
  await expectDonutLabelContrast(page)
})

test('expense pagination, kitchen targets, and open staff values remain useful with many records', async ({ page }) => {
  await setup(page, { expenseCount: 12, staffCount: 10 }, 'en', 'dark')
  await page.goto('/')
  const expenses = page.locator('.sales-expense-list')
  await expect(expenses.locator('.sales-expense-list__row')).toHaveCount(4)
  await expect(expenses).toContainText('1–4 of 12')
  await expenses.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(expenses).toContainText('5–8 of 12')
  await expect(expenses.locator('.sales-expense-list__row').first()).toContainText('Expense record 5')
  const staff = page.locator('#dashboard-staff')
  await expect(staff.locator('.lb-row')).toHaveCount(5)
  await expect(staff.locator('.staff-comparison-values table')).toBeVisible()
  const kitchen = page.locator('.kitchen-speed').first()
  await expect(kitchen.locator('.prep-list__item')).toHaveCount(7)
  await expect(kitchen.locator('.prep-list__item.is-late')).toHaveCount(2)
  await kitchen.getByRole('button', { name: 'Above target 2', exact: true }).click()
  await expect(kitchen.locator('.prep-list__item')).toHaveCount(2)
  const geometry = await kitchen.locator('.prep-list__item').first().evaluate(el => ({ actual: el.querySelector('.prep-list__track > span')!.getBoundingClientRect().right, target: el.querySelector('.prep-list__track > i')!.getBoundingClientRect().left }))
  expect(geometry.actual).toBeGreaterThan(geometry.target)
  await kitchen.getByRole('button', { name: 'All categories 7', exact: true }).click()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expectNoOverflow(page)
    const radarTextSizes = await staff.locator('.staff-row-1 svg text').evaluateAll(labels => labels.map(label => parseFloat(getComputedStyle(label).fontSize) * ((label as SVGTextElement).getScreenCTM()?.a ?? 1)))
    expect(Math.min(...radarTextSizes)).toBeGreaterThanOrEqual(10.9)
    for (const [name, selector] of [['expenses', '.sales-expense-grid'], ['kitchen', '.kitchen-speed'], ['staff', '.staff-row-1']] as const) {
      await page.locator(selector).first().screenshot({ path: `/tmp/alpha-dashboard-rebuild/verdict-${name}-${width}.png`, animations: 'disabled', style: '.topbar, .dashboard-toolbar, .mobile-tabbar, .scroll-to-top { opacity: 0 !important; }' })
    }
  }
})
