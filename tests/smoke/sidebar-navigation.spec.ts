import { type Page, expect, test } from '@playwright/test'

const expectedAdminNav = [
  '/',
  '/analytics/compare',
  '/ai-assistant',
  '/shifts-analytics',
  '/users',
  '/categories',
  '/products',
  '/orders',
  '/places',
  '/discounts',
  '/discounts/secret-word',
  '/loyalty',
  '/hr-employees',
  '/hr-salaries',
  '/hr-departments',
  '/cashbox/categories',
  '/hr-expenses',
  '/money-control',
  '/treasury',
  '/analytics/product-statistics',
  '/reports/product-performance',
  '/analytics/menu-engineering',
  '/forecast/tomorrow',
  '/warehouse',
  '/stock/items',
  '/stock/levels',
  '/stock/batches',
  '/stock/suppliers',
  '/stock/purchase-invoices',
  '/stock/purchase-orders',
  '/stock/receiving',
  '/stock/counts',
  '/stock/adjustment-requests',
  '/stock/adjustments',
  '/stock/transfers',
  '/stock/alerts',
  '/stock/reservations',
  '/stock/categories',
  '/stock/locations',
  '/stock/product-links',
  '/stock/production-orders',
  '/stock/recipes',
  '/stock/settings',
  '/stock/transactions',
  '/stock/units',
  '/stock/variance-codes',
  '/app-settings',
  '/settings/roles',
  '/notifications',
  '/notification-queue',
  '/notification-settings',
  '/notification-templates',
  '/notification-types',
]

async function seedAdminSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('appLocale', 'en')
    localStorage.setItem('accessToken', JSON.stringify('admin-navigation-test-token'))
    localStorage.setItem('userData', JSON.stringify({
      id: 'admin-navigation-test',
      name: 'Admin Navigation Tester',
      role: 'ADMIN',
      permissions: ['*'],
    }))
    localStorage.setItem('userAbilities', JSON.stringify([{ action: 'manage', subject: 'all' }]))
  })
}

test.describe('selected admin navigation', () => {
  test.beforeEach(async ({ page }) => {
    await seedAdminSession(page)
    await page.route('**/api/**', async route => {
      await route.fulfill({ json: { success: true, data: {} } })
    })
  })

  test('shows the approved pages in order and keeps notifications last', async ({ page }) => {
    await page.goto('/warehouse')

    const sidebar = page.locator('#primary-navigation')

    await expect(page.locator('#app')).not.toHaveAttribute('aria-busy', 'true')
    await expect(sidebar.locator('a.nav-item').first()).toBeVisible()

    const hrefs = await sidebar.locator('a.nav-item').evaluateAll(links =>
      links.map(link => link.getAttribute('href')),
    )

    const sections = await sidebar.locator('.sidebar-group__heading > span').allTextContents()

    expect(hrefs).toEqual(expectedAdminNav)
    expect(sections.map(section => section.trim())).toEqual([
      'Management',
      'Staff',
      'Finance',
      'Analytics',
      'Stock',
      'Settings',
      'Notifications',
    ])
    expect(hrefs.slice(-5)).toEqual([
      '/notifications',
      '/notification-queue',
      '/notification-settings',
      '/notification-templates',
      '/notification-types',
    ])
  })

  test('removed pages resolve to the not-found page', async ({ page }) => {
    for (const path of [
      '/analytics/cashier-shifts',
      '/analytics/kitchen-shifts',
      '/audit-log',
      '/inkassa',
    ]) {
      await page.goto(path)
      await expect(page.getByText('404', { exact: true })).toBeVisible()
      await expect(page.getByText('Page Not Found', { exact: true })).toBeVisible()
    }
  })

  test('keeps the full menu usable on a dark Uzbek mobile layout', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('appLocale', 'uz')
      localStorage.setItem('alphapos-theme', 'dark')
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/warehouse')

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    const sidebar = page.locator('#primary-navigation')

    await page.locator('.mobile-tabbar [aria-controls="primary-navigation"]').click()
    await expect(sidebar).toHaveClass(/is-open/)

    await sidebar.locator('.sidebar-group__heading').filter({ hasText: 'Bildirishnomalar' }).click()

    const lastNotification = sidebar.locator('a[href="/notification-types"]')

    await lastNotification.scrollIntoViewIfNeeded()
    await expect(lastNotification).toBeVisible()

    const width = await sidebar.evaluate(element => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }))

    expect(width.scroll).toBeLessThanOrEqual(width.client)

    await page.keyboard.press('Escape')
    await expect(sidebar).toHaveAttribute('aria-hidden', 'true')
  })
})
