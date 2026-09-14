import { type Page, expect, test } from '@playwright/test'

interface ComparisonState {
  status?: number
  delay?: number
  errorCode?: string
}

interface ProductFixture {
  id: number
  name: string
  category: { name: string }
}

interface ProductRowFixture {
  id: number
  name: string
  category: string
  a_qty: number
  b_qty: number
  a_revenue: number
  b_revenue: number
  delta_pct: number
}

const products: ProductFixture[] = [
  { id: 42, name: 'Signature chicken lavash with grilled vegetables', category: { name: 'Lavash' } },
  { id: 43, name: 'Margherita pizza', category: { name: 'Pizza' } },
]

function cell(a: number, b: number, isUpGood = true) {
  return {
    a,
    b,
    delta: a - b,
    delta_pct: b ? Math.round(((a - b) / b) * 1000) / 10 : a ? null : 0,
    is_up_good: isUpGood,
  }
}

function productRow(product: ProductFixture, values: Pick<ProductRowFixture, 'a_qty' | 'b_qty' | 'a_revenue' | 'b_revenue' | 'delta_pct'>): ProductRowFixture {
  return {
    id: product.id,
    name: product.name,
    category: product.category.name,
    ...values,
  }
}

function comparisonScope(productId: string) {
  const selected = products.find(product => String(product.id) === productId)

  if (selected) {
    const rows = [productRow(selected, {
      a_qty: 148,
      b_qty: 121,
      a_revenue: 8_500_000,
      b_revenue: 7_000_000,
      delta_pct: 21.4,
    })]

    return {
      selection: { scope: 'product', product_id: selected.id, product_name: selected.name, category_name: selected.category.name },
      rows,
      losers: [] as ProductRowFixture[],
      categoryName: selected.category.name,
      aRevenue: 8_500_000,
      bRevenue: 7_000_000,
      aOrders: 132,
      bOrders: 111,
      aItems: 148,
      bItems: 121,
    }
  }

  const rows = [
    productRow(products[0], {
      a_qty: 148,
      b_qty: 121,
      a_revenue: 8_500_000,
      b_revenue: 7_000_000,
      delta_pct: 21.4,
    }),
    productRow(products[1], {
      a_qty: 96,
      b_qty: 110,
      a_revenue: 5_400_000,
      b_revenue: 6_100_000,
      delta_pct: -11.5,
    }),
  ]

  return {
    selection: { scope: 'all_products' },
    rows,
    losers: [rows[1]],
    categoryName: 'Lavash',
    aRevenue: 13_900_000,
    bRevenue: 13_100_000,
    aOrders: 214,
    bOrders: 205,
    aItems: 244,
    bItems: 231,
  }
}

function hourValue(hour: number, peakHour: number, peakValue: number, baseValue: number): number {
  if (hour === peakHour)
    return peakValue

  if (hour >= 10 && hour <= 21)
    return baseValue

  return 0
}

function hourlySeries(peakHour: number, peakValue: number, baseValue: number) {
  return Array.from({ length: 24 }, (unused, hour) => ({
    hour,
    value: hourValue(hour, peakHour, peakValue, baseValue),
  }))
}

function hourWeekdayMatrix() {
  return Array.from({ length: 7 }, (unused, weekday) =>
    Array.from({ length: 24 }, (innerUnused, hour) =>
      hourValue(hour, 13, 8 + weekday, 2),
    ),
  )
}

function comparisonPayload(productId = '') {
  const scope = comparisonScope(productId)
  const hoursA = hourlySeries(13, 38, 10)
  const hoursB = hourlySeries(12, 31, 8)
  const matrix = hourWeekdayMatrix()

  return {
    selection: scope.selection,
    period_a: { start: '2026-09-01', end: '2026-09-14', days: 14 },
    period_b: { start: '2026-08-01', end: '2026-08-14', days: 14 },
    kpis: {
      gross_revenue: cell(scope.aRevenue, scope.bRevenue),
      net_revenue: cell(scope.aRevenue - 300_000, scope.bRevenue - 350_000),
      orders: cell(scope.aOrders, scope.bOrders),
      items_sold: cell(scope.aItems, scope.bItems),
      aov: cell(Math.round(scope.aRevenue / scope.aOrders), Math.round(scope.bRevenue / scope.bOrders)),
      discounts: cell(220_000, 260_000, false),
      refunds: cell(80_000, 90_000, false),
    },
    revenue_timeseries: {
      granularity: 'day',
      a: [1_100_000, 1_250_000, 1_400_000].map((value, index) => ({ index: index + 1, date: `2026-09-0${index + 1}`, value })),
      b: [950_000, 1_050_000, 1_180_000].map((value, index) => ({ index: index + 1, date: `2026-08-0${index + 1}`, value })),
    },
    categories: [{ id: 1, name: scope.categoryName, a_revenue: scope.aRevenue, b_revenue: scope.bRevenue, a_qty: scope.aItems, b_qty: scope.bItems, delta_pct: 6.1 }],
    products: scope.rows,
    top_gainers: [{ name: scope.rows[0].name, a: scope.rows[0].a_revenue, b: scope.rows[0].b_revenue, delta: scope.rows[0].a_revenue - scope.rows[0].b_revenue, delta_pct: scope.rows[0].delta_pct }],
    top_losers: scope.losers.map(row => ({ name: row.name, a: row.a_revenue, b: row.b_revenue, delta: row.a_revenue - row.b_revenue, delta_pct: row.delta_pct })),
    by_hour: { a: hoursA, b: hoursB },
    by_weekday: {
      a: Array.from({ length: 7 }, (_, weekday) => ({ weekday, value: 1_500_000 + weekday * 50_000 })),
      b: Array.from({ length: 7 }, (_, weekday) => ({ weekday, value: 1_300_000 + weekday * 40_000 })),
    },
    hour_weekday: { a: matrix, b: matrix.map(row => row.map(value => Math.max(0, value - 1))) },
    payment_methods: {
      a: [{ method: 'cash', value: Math.round(scope.aRevenue * 0.6), share: 60 }, { method: 'card', value: Math.round(scope.aRevenue * 0.4), share: 40 }],
      b: [{ method: 'cash', value: Math.round(scope.bRevenue * 0.63), share: 63 }, { method: 'card', value: Math.round(scope.bRevenue * 0.37), share: 37 }],
    },
    order_types: {
      a: [{ type: 'dine_in', value: Math.round(scope.aOrders * 0.7), share: 70 }, { type: 'takeaway', value: Math.round(scope.aOrders * 0.3), share: 30 }],
      b: [{ type: 'dine_in', value: Math.round(scope.bOrders * 0.68), share: 68 }, { type: 'takeaway', value: Math.round(scope.bOrders * 0.32), share: 32 }],
    },
  }
}

async function setup(page: Page, state: ComparisonState = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('accessToken', JSON.stringify('comparison-test-token'))
    localStorage.setItem('userData', JSON.stringify({ id: 1, role: 'ADMIN', permissions: ['*'] }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })

  const comparisonRequests: URL[] = []

  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/products')) {
      await route.fulfill({ json: { data: { products, pagination: { total_pages: 1, has_next: false } } } })
      return
    }
    if (url.pathname.endsWith('/analytics/comparison')) {
      comparisonRequests.push(url)
      if (state.delay)
        await new Promise(resolve => setTimeout(resolve, state.delay))
      if (state.status && state.status !== 200) {
        await route.fulfill({ status: state.status, json: { success: false, code: state.errorCode, message: 'Comparison fixture unavailable' } })
        return
      }
      await route.fulfill({ json: { data: comparisonPayload(url.searchParams.get('product_id') ?? '') } })
      return
    }
    await route.fulfill({ json: { success: true, data: {} } })
  })

  return comparisonRequests
}

test('compares the full catalog and one selected product with shareable applied filters', async ({ page }) => {
  const requests = await setup(page, { delay: 80 })

  await page.goto('/analytics/compare?a_start=2026-09-01&a_end=2026-09-14&b_start=2026-08-01&b_end=2026-08-14&mode=custom&gran=day&avg=0')

  await expect(page.getByRole('heading', { name: 'Product comparison', exact: true })).toBeVisible()
  await expect(page.getByText('Live comparison', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: /Sales grew by/ })).toBeVisible()
  await expect(page.getByText('13:00–14:00', { exact: true })).toBeVisible()
  await expect(page.getByText('12:00–13:00', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-product-comparison-desktop.png', fullPage: true, animations: 'disabled' })

  const productSelect = page.getByRole('combobox', { name: 'Product focus' })

  await productSelect.click()
  await page.locator('.search-select__menu input[type="search"]').fill('Signature chicken')
  await page.getByRole('option', { name: products[0].name, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Update comparison', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Update comparison', exact: true }).evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  await expect(page.getByRole('heading', { name: `${products[0].name} performance`, exact: true })).toBeVisible()
  await expect(page).toHaveURL(/product_id=42/)
  expect(requests.filter(request => request.searchParams.get('product_id') === '42')).toHaveLength(1)

  await page.getByRole('button', { name: 'Week', exact: true }).click()
  await page.getByRole('button', { name: 'Update comparison', exact: true }).click()
  await expect(page).toHaveURL(/gran=week/)
  expect(requests.at(-1)?.searchParams.get('granularity')).toBe('week')

  await page.setViewportSize({ width: 390, height: 844 })

  const overflow = await page.evaluate(() => ({ document: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth }))

  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport)
  await expect(page.getByRole('button', { name: 'Compare periods', exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/alpha-product-comparison-mobile.png', fullPage: true, animations: 'disabled' })

  await page.evaluate(() => localStorage.setItem('alphapos-theme', 'dark'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByText('Live comparison', { exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: '/tmp/alpha-product-comparison-mobile-dark.png', fullPage: true, animations: 'disabled' })
})

test('labels only an unavailable endpoint as preview data and preserves real server errors', async ({ page }) => {
  await setup(page, { status: 404 })
  await page.goto('/analytics/compare')

  await expect(page.getByText('Comparison preview', { exact: true })).toBeVisible()
  await expect(page.getByText('Preview data', { exact: true })).toBeVisible()

  const errorPage = await page.context().newPage()

  await setup(errorPage, { status: 500 })
  await errorPage.goto('/analytics/compare')

  await expect(errorPage.getByText('Comparison could not be loaded', { exact: true })).toBeVisible()
  await expect(errorPage.getByText('Comparison preview', { exact: true })).toHaveCount(0)

  const missingProductPage = await page.context().newPage()

  await setup(missingProductPage, { status: 404, errorCode: 'PRODUCT_NOT_FOUND' })
  await missingProductPage.goto('/analytics/compare?product_id=999')

  await expect(missingProductPage.getByText('Comparison could not be loaded', { exact: true })).toBeVisible()
  await expect(missingProductPage.getByText('Comparison preview', { exact: true })).toHaveCount(0)

  const structuredNotFoundPage = await page.context().newPage()

  await setup(structuredNotFoundPage, { status: 404, errorCode: 'NOT_FOUND' })
  await structuredNotFoundPage.goto('/analytics/compare')

  await expect(structuredNotFoundPage.getByText('Comparison could not be loaded', { exact: true })).toBeVisible()
  await expect(structuredNotFoundPage.getByText('Comparison preview', { exact: true })).toHaveCount(0)
})
