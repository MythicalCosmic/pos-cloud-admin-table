import { type Page, expect, test } from '@playwright/test'

const analyticsOverview = {
  range: { from: '2026-07-20', to: '2026-07-21' },
  window_days: 2,
  total_revenue: '95000',
  gross_revenue: '135000',
  refund_amount: '40000',
  total_units: 4,
  gross_units: 6,
  refunded_units: 2,
  distinct_products_sold: 2,
  order_lines: 4,
  orders: 2,
  gross_orders: 2,
  refunded_orders: 2,
  avg_line_revenue: '23750',
  top_products: [],
  slowest_products: [],
}

const analyticsCategories = [
  {
    category_id: 'mains',
    category: 'Mains',
    units: 4,
    gross_units: 6,
    refunded_units: 2,
    revenue: '95000',
    gross_revenue: '135000',
    refund_amount: '40000',
    pct_of_revenue: 100,
  },
]

const analyticsProducts = [
  {
    product_id: 'burger',
    product_name: 'Burger',
    qty_sold: 2,
    gross_qty_sold: 3,
    refunded_qty: 1,
    revenue: '60000',
    gross_revenue: '90000',
    refund_amount: '30000',
    pct_of_revenue: 63.16,
    cumulative_pct: 63.16,
    class: 'A',
  },
  {
    product_id: 'pasta',
    product_name: 'Pasta',
    qty_sold: 2,
    gross_qty_sold: 3,
    refunded_qty: 1,
    revenue: '35000',
    gross_revenue: '45000',
    refund_amount: '10000',
    pct_of_revenue: 36.84,
    cumulative_pct: 100,
    class: 'B',
  },
]

const analyticsTrends = [
  {
    date: '2026-07-20',
    units: 2,
    gross_units: 3,
    refunded_units: 1,
    revenue: '60000',
    gross_revenue: '90000',
    refund_amount: '30000',
  },
  {
    date: '2026-07-21',
    units: 2,
    gross_units: 3,
    refunded_units: 1,
    revenue: '35000',
    gross_revenue: '45000',
    refund_amount: '10000',
  },
]

interface ProductStatisticsRequests {
  analyticsPaths: string[]
  orders: string[]
}

async function mockProductStatisticsApi(page: Page): Promise<ProductStatisticsRequests> {
  const requests: ProductStatisticsRequests = {
    analyticsPaths: [],
    orders: [],
  }

  await page.route('**/api/admins/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname

    if (path.endsWith('/orders')) {
      requests.orders.push(request.url())
      await route.fulfill({ status: 500, json: { message: 'Product statistics must not fetch orders' } })
      return
    }

    if (path.endsWith('/analytics/products/overview')) {
      requests.analyticsPaths.push('/analytics/products/overview')
      await route.fulfill({ json: { success: true, data: analyticsOverview } })
      return
    }

    if (path.endsWith('/analytics/products/categories')) {
      requests.analyticsPaths.push('/analytics/products/categories')
      await route.fulfill({ json: { success: true, data: { categories: analyticsCategories } } })
      return
    }

    if (path.endsWith('/analytics/products/pareto')) {
      requests.analyticsPaths.push('/analytics/products/pareto')
      await route.fulfill({ json: { success: true, data: { products: analyticsProducts } } })
      return
    }

    if (path.endsWith('/analytics/products/trends')) {
      requests.analyticsPaths.push('/analytics/products/trends')
      await route.fulfill({ json: { success: true, data: { daily: analyticsTrends } } })
      return
    }

    if (path.endsWith('/products')) {
      await route.fulfill({
        json: {
          data: {
            products: [
              { id: 'burger', name: 'Burger', category_id: 'mains' },
              { id: 'pasta', name: 'Pasta', category_id: 'mains' },
              { id: 'no-sales-salad', name: 'No-sales salad', category_id: 'drinks' },
            ],
            pagination: { total_pages: 1 },
          },
        },
      })
      return
    }

    if (path.endsWith('/categories')) {
      await route.fulfill({
        json: {
          data: {
            categories: [
              { id: 'mains', name: 'Mains' },
              { id: 'drinks', name: 'Drinks' },
            ],
            pagination: { total_pages: 1 },
          },
        },
      })
      return
    }

    if (path.endsWith('/auth-me') || path.endsWith('/app-settings')) {
      await route.fulfill({ json: { data: {} } })
      return
    }

    // Keep the route isolated from app-shell requests such as navigation counts.
    await route.fulfill({ json: { data: {} } })
  })

  return requests
}

test.describe('product sales analytics', () => {
  test('uses backend analytics, shows refunds, and filters server-aggregated products locally', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('appLocale', 'en')
      localStorage.setItem('alphapos-theme', 'light')
      localStorage.setItem('numberFormat', 'full')
      localStorage.setItem('accessToken', JSON.stringify('test-token'))
      localStorage.setItem('userData', JSON.stringify({ id: 1, name: 'Manager' }))
      localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
    })

    const requests = await mockProductStatisticsApi(page)

    await page.goto('/analytics/product-statistics')

    const pagePadding = await page.locator('.product-statistics').evaluate(element => {
      const styles = window.getComputedStyle(element)

      return {
        left: styles.paddingLeft,
        right: styles.paddingRight,
      }
    })

    const table = page.getByTestId('product-statistics-table')

    expect(pagePadding).toEqual({ left: '16px', right: '16px' })
    await expect(table).toContainText('Burger')
    await expect(table).toContainText('Pasta')
    await expect(page.locator('.kpi').filter({ hasText: 'Net product sales' })).toContainText(/95.*000.*UZS/)
    await expect(page.locator('.kpi').filter({ hasText: 'Net units sold' })).toContainText('4')
    await expect(page.locator('.kpi').filter({ hasText: 'Gross sales' })).toContainText(/135.*000.*UZS/)
    await expect(page.getByText('Calculated by the server from settled product sales.')).toBeVisible()
    await expect(page.getByText('Gross sales include settled line revenue after allocated discounts. Net sales subtract product refund events.')).toBeVisible()
    await expect(table.getByText(/30.*000/)).toBeVisible()

    expect(requests.orders).toEqual([])
    expect(requests.analyticsPaths.sort()).toEqual([
      '/analytics/products/categories',
      '/analytics/products/overview',
      '/analytics/products/pareto',
      '/analytics/products/trends',
    ])

    await page.getByTestId('product-statistics-product-filter').click()
    await expect(page.getByTestId('product-statistics-product-option-no-sales-salad')).toBeVisible()
    await page.getByTestId('product-statistics-product-option-burger').click()

    await expect(table).toContainText('Burger')
    await expect(table).not.toContainText('Pasta')
    await expect(page.locator('.kpi').filter({ hasText: 'Net product sales' })).toContainText(/60.*000.*UZS/)
    await expect(page.locator('.kpi').filter({ hasText: 'Gross sales' })).toContainText(/90.*000.*UZS/)

    await page.getByTestId('product-statistics-product-filter').click()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.getByTestId('product-statistics-category-filter').click()
    await page.getByTestId('product-statistics-category-option-drinks').click()
    await expect(page.getByText('No product sales activity found')).toBeVisible()
    await expect(page.locator('.product-statistics__state-card').getByRole('button', { name: 'Clear filters' })).toBeVisible()

    await page.locator('.product-statistics__state-card').getByRole('button', { name: 'Clear filters' }).click()
    await page.locator('[title="Toggle theme"]').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.setViewportSize({ width: 390, height: 844 })

    const productFilter = page.getByTestId('product-statistics-product-filter')

    await productFilter.click()
    await expect(page.getByTestId('product-statistics-product-option-burger')).toBeVisible()

    const pickerBounds = await page.locator('.product-statistics__picker-popover').boundingBox()

    const pageWidth = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }))

    expect(pickerBounds).not.toBeNull()
    expect(pickerBounds?.x).toBeGreaterThanOrEqual(0)
    expect((pickerBounds?.x ?? 0) + (pickerBounds?.width ?? 0)).toBeLessThanOrEqual(390)
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.client)

    await productFilter.press('Escape')
    await expect(page.getByTestId('product-statistics-product-option-burger')).toBeHidden()
  })
})
