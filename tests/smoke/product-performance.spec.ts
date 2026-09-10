import { type Page, expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

interface State { empty?: boolean; error?: string; exportError?: string; gate?: Promise<void>; exportGate?: Promise<void>; rows?: number; categoryError?: boolean }
const amount = (cents: bigint) => `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
const grouped = (decimal: string) => decimal.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')
const baseRows = (count = 27) => Array.from({ length: count }, (_, i) => ({
  rank: i + 1, product_id: i + 1, product_name: i === 0 ? 'Signature burger with caramelized onions' : `Product ${i + 1}`, category_id: i % 2 ? 5 : 4, category_name: i % 2 ? 'Drinks' : 'Burgers and signature kitchen dishes', units_sold: 1, units_refunded: 0, net_units: 1, orders_sold: 1, refund_events: 0,
  selling_price_per_unit: '120000.5500', minimum_selling_price: '120000.55', maximum_selling_price: '120000.55', current_catalog_price: '125000.00', gross_sales_revenue: '120000.55', refund_amount: '0.00', total_revenue: '120000.55', ingredient_cost_per_unit: i === count - 1 ? null : '45000.2500', gross_ingredient_cost: i === count - 1 ? null : '45000.25', ingredient_cost_credit: '0.00', total_ingredient_cost: i === count - 1 ? null : '45000.25', gross_profit_per_item: i === count - 1 ? null : '75000.3000', gross_profit: i === count - 1 ? null : '75000.30', gross_profit_margin_pct: i === count - 1 ? null : '62.50', cost_source: i === count - 1 ? 'MISSING' : 'ACTUAL_STOCK', cost_complete: i !== count - 1, cost_coverage_pct: i === count - 1 ? '0.00' : '100.00',
}))
function payload(url: URL, state: State) {
  const params = url.searchParams
  const rows = (state.empty ? [] : baseRows(state.rows)).filter(row => (!params.get('category_id') || String(row.category_id) === params.get('category_id')) && (!params.get('product_id') || String(row.product_id) === params.get('product_id')) && (!params.get('search') || row.product_name.toLowerCase().includes(params.get('search')!.toLowerCase())))
  const missing = rows.filter(row => !row.cost_complete).length
  const summary = { product_count: rows.length, order_count: rows.length, refund_event_count: 0, total_units_sold: rows.length, total_units_refunded: 0, net_units: rows.length, gross_sales_revenue: amount(BigInt(rows.length) * 12000055n), refund_amount: '0.00', total_revenue: amount(BigInt(rows.length) * 12000055n), gross_ingredient_cost: missing ? null : amount(BigInt(rows.length) * 4500025n), ingredient_cost_credit: '0.00', total_ingredient_cost: missing ? null : amount(BigInt(rows.length) * 4500025n), known_ingredient_cost: amount(BigInt(rows.length - missing) * 4500025n), total_gross_profit: missing ? null : amount(BigInt(rows.length) * 7500030n), gross_profit_margin_pct: missing || !rows.length ? null : '62.50', average_selling_price_per_unit: rows.length ? '120000.5500' : null, average_ingredient_cost_per_unit: missing || !rows.length ? null : '45000.2500', cost_complete: !missing, cost_coverage_pct: rows.length ? ((rows.length - missing) / rows.length * 100).toFixed(2) : '100.00', products_missing_cost: missing }
  const page = Number(params.get('page') || 1)
  const size = Number(params.get('per_page') || 25)
  const from = params.get('preset') === 'custom' ? params.get('from')! : params.get('preset') === 'last_7_days' ? '2026-09-04' : '2026-09-10'
  const to = params.get('preset') === 'custom' ? params.get('to')! : '2026-09-10'
  return { status: 'PROVISIONAL', currency: 'UZS', branch_id: 'branch1', range: { from, to, start_at: `${from}T07:00:00+05:00`, end_at: '2026-09-11T03:00:00+05:00', mode: 'business', timezone: 'Asia/Tashkent', preset: params.get('preset') }, filters: Object.fromEntries(params), summary,
    products: rows.slice((page - 1) * size, page * size),
    categories: rows.length ? [{ ...summary, category_id: 4, category_name: 'All reported categories', units_sold: rows.length, gross_profit: summary.total_gross_profit }] : [], daily: rows.length ? [{ ...summary, business_date: from, units_sold: rows.length, gross_profit: summary.total_gross_profit }] : [],
    pagination: { page, per_page: size, total: rows.length, total_pages: Math.ceil(rows.length / size) }, options: { formats: ['xlsx', 'pdf', 'csv'] }, coverage: { cost_complete: !missing, missing_cost_products: [], policy: 'Historical evidence only.' }, generated_at: '2026-09-10T16:30:00+05:00' }
}
async function setup(page: Page, state: State = {}, locale = 'en', theme = 'dark', role = 'ADMIN') {
  await page.addInitScript(data => {
    localStorage.setItem('accessToken', JSON.stringify('report-fixture-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 9, name: 'Report review', role: data.role, permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
    localStorage.setItem('appLocale', data.locale)
    localStorage.setItem('alphapos-theme', data.theme)
  }, { locale, theme, role })
  const calls: URL[] = []
  page.on('pageerror', error => { throw error })
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/reports/product-performance/export')) {
      calls.push(url)
      if (url.searchParams.get('format') === 'xlsx' && state.exportGate) await state.exportGate
      if (state.exportError) {
        await route.fulfill({ status: 413, json: { success: false, code: state.exportError, message: 'Choose a shorter period' } }); return
      }
      const report = payload(url, state)
      const format = url.searchParams.get('format')!
      await route.fulfill({ contentType: format === 'csv' ? 'text/csv' : format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'Content-Disposition': `attachment; filename="fallback.${format}"; filename*=UTF-8''Hisobot%20%E2%80%94%20sentabr.${format}`, 'X-Export-Count': String(report.pagination.total), 'X-Report-From': report.range.from, 'X-Report-To': report.range.to, 'X-Report-Cost-Complete': String(report.summary.cost_complete) }, body: `Product,Revenue\nALL PRODUCTS,${report.pagination.total}\nTOTAL,${report.summary.total_revenue}\n` })
      return
    }
    if (url.pathname.endsWith('/reports/product-performance')) {
      calls.push(url)
      if (state.gate) await state.gate
      if (state.error) {
        await route.fulfill({ status: state.error === 'PERMISSION_DENIED' ? 403 : 422, json: { success: false, code: state.error, message: 'Invalid report', errors: { to: 'Choose another date' } } }); return
      }
      await route.fulfill({ json: { success: true, data: payload(url, state) } }); return
    }
    if (url.pathname.endsWith('/categories/active')) {
      await route.fulfill(state.categoryError ? { status: 503, json: { message: 'Unavailable' } } : { json: { data: { categories: [{ id: 4, name: 'Burgers' }, { id: 5, name: 'Drinks' }] } } }); return
    }
    if (url.pathname.endsWith('/users')) { await route.fulfill({ json: { data: { users: [{ id: 9, first_name: 'Aziza', last_name: 'Karimova' }] } } }); return }
    await route.fulfill({ json: { data: {} } })
  })
  return calls
}
const jsonCalls = (calls: URL[]) => calls.filter(url => url.pathname.endsWith('/reports/product-performance'))
async function select(page: Page, name: string, value: string) {
  await page.getByRole('combobox', { name, exact: true }).click()
  await page.getByRole('option', { name: value, exact: true }).click()
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  const clipped = await page.locator('.report-stat__value, .report-toolbar, .report-tabs, .report-context, .report-cost-warning, .report-selected-product').evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.className))
  expect(clipped).toEqual([])
}

test('server totals, exact decimal money, incomplete costs and paginated rows remain distinct', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/reports/product-performance')
  await expect(page.locator('[data-metric="revenue"] .report-stat__value')).toContainText('3\u202f240\u202f014.85')
  await expect(page.locator('[data-metric="cost"] .report-stat__value')).toHaveText('—')
  await expect(page.locator('[data-metric="profit"] .report-stat__value')).toHaveText('—')
  await expect(page.locator('.report-cost-warning')).toContainText('incomplete historical ingredient cost: 1')
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
  expect(jsonCalls(calls)[0].searchParams.get('preset')).toBe('today')
  expect(jsonCalls(calls)[0].searchParams.get('sort')).toBe('highest_revenue')
  await page.locator('.pagination .pglist button').filter({ hasText: /^2$/ }).click()
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(2)
  await expect(page.locator('[data-metric="revenue"] .report-stat__value')).toContainText('3\u202f240\u202f014.85')
  const unknown = page.locator('.product-report-table tbody tr').filter({ hasText: 'Product 27' })
  await expect(unknown).toContainText('Incomplete')
  await expect(unknown).toContainText('—')
  await page.getByRole('button', { name: /^Daily/ }).click()
  await expect(page.locator('.report-aggregate-table')).toContainText('3\u202f240\u202f014.85')
})

test('all sorts and category filters are server driven and reset page one', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/reports/product-performance')
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
  await page.locator('.pagination .pglist button').filter({ hasText: /^2$/ }).click()
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(2)
  for (const [label, sort] of [['Highest units sold', 'highest_units'], ['Highest revenue', 'highest_revenue'], ['Highest profit', 'highest_profit'], ['Lowest profit', 'lowest_profit'], ['Highest profit margin', 'highest_profit_margin'], ['Lowest profit margin', 'lowest_profit_margin']]) {
    await select(page, 'Sort by', label)
    await expect.poll(() => jsonCalls(calls).at(-1)?.searchParams.get('sort')).toBe(sort)
    expect(jsonCalls(calls).at(-1)?.searchParams.get('page')).toBe('1')
  }
  await select(page, 'Category', 'Drinks')
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(13)
  await expect(page.locator('[data-metric="revenue"] .report-stat__value')).toContainText('1\u202f560\u202f007.15')
  await expect(page.locator('.report-cost-warning')).toHaveCount(0)
})

test('search debounces, every advanced filter reaches the report, and products can be focused', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/reports/product-performance')
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
  const before = jsonCalls(calls).length
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Signature')
  await expect.poll(() => jsonCalls(calls).at(-1)?.searchParams.get('search')).toBe('Signature')
  expect(jsonCalls(calls).length).toBe(before + 1)
  await page.getByRole('button', { name: /^More filters/ }).click()
  for (const [label, value, key, expected] of [['Cashier', 'Aziza Karimova', 'cashier_id', '9'], ['Order type', 'Hall', 'order_type', 'HALL'], ['Order source', 'Telegram', 'order_origin', 'TELEGRAM'], ['Payment method', 'All cards', 'payment_method', 'CARD']]) {
    await select(page, label, value)
    await expect.poll(() => jsonCalls(calls).at(-1)?.searchParams.get(key)).toBe(expected)
  }
  await page.getByRole('button', { name: 'Filter report to Signature burger with caramelized onions', exact: true }).click()
  await expect.poll(() => jsonCalls(calls).at(-1)?.searchParams.get('product_id')).toBe('1')
  await expect(page.locator('.report-selected-product')).toContainText('Signature burger')
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
  expect(jsonCalls(calls).at(-1)?.searchParams.has('search')).toBe(false)
})

test('returned preset dates and custom calendar dates use the report business window', async ({ page }) => {
  const calls = await setup(page)
  await page.goto('/reports/product-performance')
  await select(page, 'Date range', 'Last 7 days')
  await expect(page.locator('.report-context')).toContainText('04.09.2026 — 10.09.2026')
  await select(page, 'Date range', 'Custom range')
  const count = jsonCalls(calls).length
  await page.getByRole('button', { name: 'Start date', exact: true }).click()
  await page.locator('.calendar-popover[open] [data-date="2026-09-08"]').click()
  await page.getByRole('button', { name: 'End date', exact: true }).click()
  await page.locator('.calendar-popover[open] [data-date="2026-09-07"]').click()
  await page.locator('.report-custom-dates').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect(page.locator('.report-range-error')).toBeVisible()
  expect(jsonCalls(calls).length).toBe(count)
  await page.getByRole('button', { name: 'End date', exact: true }).click()
  await page.locator('.calendar-popover[open] [data-date="2026-09-09"]').click()
  await page.locator('.report-custom-dates').getByRole('button', { name: 'Apply', exact: true }).click()
  await expect.poll(() => jsonCalls(calls).at(-1)?.searchParams.get('from')).toBe('2026-09-08')
  expect(jsonCalls(calls).at(-1)?.searchParams.get('to')).toBe('2026-09-09')
  await expect(page.locator('.report-context')).toContainText('08.09.2026 — 09.09.2026')
})

test('changing search cancels the previous request and retains only the latest totals', async ({ page }) => {
  await setup(page)
  await page.goto('/reports/product-performance')
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
  let release!: () => void
  let slowStarted = false
  let slowFinished = false
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/admins/reports/product-performance?**', async route => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('search') !== 'Signature') {
      await route.fallback()
      return
    }
    slowStarted = true
    await gate
    await route.fulfill({ json: { success: true, data: payload(url, {}) } })
    slowFinished = true
  })
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Signature')
  await expect.poll(() => slowStarted).toBe(true)
  const canceled = page.waitForEvent('requestfailed', { predicate: request => new URL(request.url()).searchParams.get('search') === 'Signature' })
  await page.getByRole('textbox', { name: 'Search', exact: true }).fill('Product 2')
  await canceled
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(9)
  await expect(page.locator('[data-metric="revenue"] .report-stat__value')).toContainText('1\u202f080\u202f004.95')
  release()
  await expect.poll(() => slowFinished).toBe(true)
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(9)
  await expect(page.locator('.product-report-table')).not.toContainText('Signature burger')
  await expect(page.locator('.alpha-toast[data-type="error"]')).toHaveCount(0)
})

test('exports retain filters, ignore pagination, use backend filenames and disable only the running format', async ({ page }, testInfo) => {
  let release!: () => void
  const state: State = { exportGate: new Promise<void>(resolve => { release = resolve }) }
  const calls = await setup(page, state)
  await page.goto('/reports/product-performance')
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
  await page.locator('.pagination .pglist button').filter({ hasText: /^2$/ }).click()
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(2)
  await page.locator('.report-export > button').click()
  await page.getByRole('menuitem', { name: /Excel/ }).click()
  await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeDisabled()
  await expect(page.getByRole('menuitem', { name: /PDF/ })).toBeEnabled()
  await expect(page.getByRole('menuitem', { name: /CSV/ })).toBeEnabled()
  const downloading = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: /CSV/ }).click()
  const csv = await downloading
  expect(csv.suggestedFilename()).toBe('Hisobot — sentabr.csv')
  const csvPath = testInfo.outputPath('report.csv')
  await csv.saveAs(csvPath)
  expect(await readFile(csvPath, 'utf8')).toContain('TOTAL,3240014.85')
  const exportCalls = calls.filter(url => url.pathname.endsWith('/export'))
  for (const url of exportCalls) {
    expect(url.searchParams.has('page')).toBe(false)
    expect(url.searchParams.has('per_page')).toBe(false)
    expect(url.searchParams.get('preset')).toBe('today')
    expect(url.searchParams.get('sort')).toBe('highest_revenue')
  }
  const xlsxDownload = page.waitForEvent('download')
  release()
  expect((await xlsxDownload).suggestedFilename()).toBe('Hisobot — sentabr.xlsx')
  await expect(page.getByRole('menuitem', { name: /Excel/ })).toBeEnabled()
  await page.keyboard.press('Escape')
  await expect(page.locator('.report-export > button')).toBeFocused()
})

test('blob export errors are readable and leave the report usable', async ({ page }) => {
  await setup(page, { exportError: 'REPORT_TOO_LARGE' })
  await page.goto('/reports/product-performance')
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
  await page.locator('.report-export > button').click()
  await page.getByRole('menuitem', { name: /PDF/ }).click()
  await expect(page.locator('.alpha-toast[data-type="error"]')).toContainText('This report is too large. Choose a shorter period or narrow the filters.')
  await expect(page.getByRole('menuitem', { name: /PDF/ })).toBeEnabled()
  await expect(page.locator('.product-report-table tbody tr')).toHaveCount(25)
})

for (const role of ['ADMIN', 'MANAGER', 'CASHIER']) test(`product report respects ${role} access`, async ({ page }) => {
  const calls = await setup(page, {}, 'en', 'dark', role)
  await page.goto('/reports/product-performance')
  if (role === 'CASHIER') {
    await expect(page).toHaveURL(/not-authorized/)
    expect(jsonCalls(calls)).toHaveLength(0)
  } else await expect(page.locator('.product-report-table')).toBeVisible()
})

test('loading, empty and denied states are distinct and recoverable', async ({ page }) => {
  let release!: () => void
  const state: State = { empty: true, gate: new Promise<void>(resolve => { release = resolve }) }
  await setup(page, state)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/reports/product-performance')
  await expect(page.locator('.report-loading')).toBeVisible()
  await expect(page.locator('.report-stat__value')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/alpha-report-check/loading-mobile.png' })
  release()
  await expect(page.getByText('No matching sales in this period', { exact: true })).toBeVisible()
  await expect(page.locator('[data-metric="revenue"] .report-stat__value')).toContainText('0')
  await page.screenshot({ path: '/tmp/alpha-report-check/empty-mobile.png' })
  state.error = 'PERMISSION_DENIED'
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(page.locator('.product-performance-page > .report-state')).toContainText('Manager or Admin access is required')
  await expect(page.locator('.report-stat__value')).toHaveCount(0)
  await page.screenshot({ path: '/tmp/alpha-report-check/error-mobile.png' })
  state.error = undefined; state.empty = false
  await page.locator('.product-performance-page > .report-state').getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(page.locator('.product-report-table')).toBeVisible()
})

for (const locale of ['en', 'ru', 'uz']) for (const theme of ['light', 'dark']) test(`product report stays readable in ${locale}/${theme} on desktop and phones`, async ({ page }) => {
  await setup(page, { rows: 4 }, locale, theme)
  await page.goto('/reports/product-performance')
  await expect(page.locator('.product-report-table')).toBeVisible()
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 700 ? 1000 : 844 })
    const sort = page.locator('.report-sort [role="combobox"]')
    await sort.click()
    const choices = await page.getByRole('option').allTextContents()
    const longestChoice = [...choices].sort((a, b) => b.length - a.length)[0]
    await page.keyboard.press('Escape')
    for (const choice of choices) {
      await sort.click()
      await page.getByRole('option', { name: choice.trim(), exact: true }).click()
      await expect(page.locator('.product-report-table')).toBeVisible()
      const label = sort.locator('.select__label')
      await expect(label).toHaveText(choice.trim())
      expect(await label.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true)
      if (width < 700 && choice === longestChoice) await page.locator('.report-filters').screenshot({ path: `/tmp/alpha-report-check/review-longest-sort-${locale}-${theme}-${width}.png`, animations: 'disabled' })
    }
    await page.locator('.report-more-filters').click()
    await noOverflow(page)
    await page.locator('.report-more-filters').click()
    await page.evaluate(() => window.scrollTo(0, 0))
    if (width !== 320) {
      await page.screenshot({ path: `/tmp/alpha-report-check/report-${locale}-${theme}-${width}.png`, animations: 'disabled' })
      await page.locator('.report-data').screenshot({ path: `/tmp/alpha-report-check/table-${locale}-${theme}-${width}.png`, style: '.topbar, .mobile-tabbar { opacity: 0 !important; }', animations: 'disabled' })
    }
    if (width < 700) await page.locator('.report-filters').screenshot({ path: `/tmp/alpha-report-check/review-sort-${locale}-${theme}-${width}.png`, animations: 'disabled' })
    if (width < 700) {
      await page.locator('.mobile-record').first().getByRole('button', { name: /./ }).last().click()
      await noOverflow(page)
    }
  }
})
